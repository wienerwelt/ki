[CmdletBinding()]
param(
    [switch]$SkipHealthCheck,
    [switch]$SkipSmokeTests
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Assert-LastExitCode([string]$Message) {
    if ($LASTEXITCODE -ne 0) {
        throw $Message
    }
}

function Assert-NoCriticalVulnerabilities([string]$PackageDirectory, [string]$Label) {
    Push-Location $PackageDirectory
    try {
        $auditOutput = (& npm.cmd audit --audit-level=critical --json) -join [Environment]::NewLine
        $auditExitCode = $LASTEXITCODE
        try {
            $audit = $auditOutput | ConvertFrom-Json
        } catch {
            throw "$Label-Abhängigkeitsprüfung lieferte keine lesbare npm-Antwort."
        }

        $counts = $audit.metadata.vulnerabilities
        if ($auditExitCode -ne 0 -or [int]$counts.critical -gt 0) {
            throw "$Label enthält $($counts.critical) kritische npm-Abhängigkeit(en). Release gestoppt."
        }

        Write-Host "  ${Label}: 0 kritisch; $($counts.high) hoch; $($counts.moderate) mittel; $($counts.low) niedrig"
    } finally {
        Pop-Location
    }
}

Push-Location $repoRoot

try {
    Write-Host '[1/9] Dev- und Prod-Docker-Konfiguration prüfen'
    & docker compose -f docker-compose.yml -f docker-compose.override.yml config --quiet
    Assert-LastExitCode 'Die lokale Docker-Compose-Konfiguration ist ungültig.'
    & docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
    Assert-LastExitCode 'Die produktive Docker-Compose-Konfiguration ist ungültig.'

    Write-Host '[2/9] Kritische npm-Abhängigkeiten prüfen (inklusive Build-/Dev-Werkzeuge)'
    Assert-NoCriticalVulnerabilities (Join-Path $repoRoot 'backend') 'Backend'
    Assert-NoCriticalVulnerabilities (Join-Path $repoRoot 'frontend') 'Frontend'

    Write-Host '[3/9] Deployment-Skript syntaktisch prüfen'
    $gitBash = 'C:\Program Files\Git\bin\bash.exe'
    if (-not (Test-Path -LiteralPath $gitBash)) {
        throw 'Git Bash fehlt. Erwartet: C:\Program Files\Git\bin\bash.exe'
    }
    & $gitBash -n (Join-Path $repoRoot 'deploy.sh')
    Assert-LastExitCode 'deploy.sh enthält einen Shell-Syntaxfehler.'

    Write-Host '[4/9] Backend-JavaScript syntaktisch prüfen'
    $backendFiles = Get-ChildItem -Path (Join-Path $repoRoot 'backend') -Filter '*.js' -File -Recurse |
        Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' }

    foreach ($file in $backendFiles) {
        & node --check $file.FullName
        Assert-LastExitCode "Syntaxfehler in $($file.FullName)"
    }

    Write-Host '[5/9] Lokale Datenbankmigrationen prüfen'
    & docker compose exec -T api npm run migrate
    Assert-LastExitCode 'Die lokalen Datenbankmigrationen sind fehlgeschlagen.'

    Write-Host '[6/9] Dashboard-Frontend bauen'
    & npm.cmd --prefix frontend run build:dashboard
    Assert-LastExitCode 'Der Frontend-Build ist fehlgeschlagen.'

    Write-Host '[7/9] Backend- und Worker-Images bauen und lokale Dienste aktualisieren'
    & docker compose -f docker-compose.yml -f docker-compose.override.yml build
    Assert-LastExitCode 'Der lokale Docker-Image-Build ist fehlgeschlagen.'
    & docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --force-recreate --no-deps `
        api worker-ai worker-scrape worker-mail worker-data worker-funding
    Assert-LastExitCode 'Die lokalen API-/Worker-Container konnten nicht aus den neuen Images erstellt werden.'

    if ($SkipHealthCheck) {
        Write-Host '[8/9] Lokalen Healthcheck ausdrücklich übersprungen'
    } else {
        Write-Host '[8/9] Laufende lokale API prüfen'
        $health = $null
        for ($attempt = 1; $attempt -le 18; $attempt++) {
            try {
                $health = Invoke-RestMethod `
                    -Uri 'http://127.0.0.1:5001/api/health' `
                    -TimeoutSec 5
                if ($health.status -eq 'ok') {
                    break
                }
            } catch {
                $health = $null
            }
            Start-Sleep -Seconds 5
        }

        if ($null -eq $health -or $health.status -ne 'ok') {
            throw 'Die frisch erstellte lokale API wurde innerhalb von 90 Sekunden nicht gesund.'
        }
    }

    if ($SkipSmokeTests) {
        Write-Host '[9/9] Fachliche Smoke-Tests ausdrücklich übersprungen'
    } else {
        Write-Host '[9/9] Fachliche Smoke-Tests ausführen (ohne E-Mail-Versand)'
        $smokeScripts = @(
            'smoke:software-rating',
            'smoke:monthly-report',
            'smoke:monthly-report-monitor',
            'smoke:community-profile',
            'smoke:admin-user-search',
            'smoke:event-feed-dedup'
        )
        foreach ($smokeScript in $smokeScripts) {
            Write-Host "  -> $smokeScript"
            & docker compose exec -T api npm run $smokeScript
            Assert-LastExitCode "Smoke-Test fehlgeschlagen: $smokeScript"
        }
    }

    Write-Host 'Preflight vollständig erfolgreich.' -ForegroundColor Green
} finally {
    Pop-Location
}
