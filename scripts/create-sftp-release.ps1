[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$')]
    [string]$Version,

    [string]$OutputDirectory = 'releases'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$archivePath = $null
$checksumPath = $null
$createdArtifacts = $false

Push-Location $repoRoot

try {
    $branch = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'Der aktuelle Git-Branch konnte nicht ermittelt werden.'
    }
    if ($branch -ne 'main') {
        throw "Releases dürfen nur von main erstellt werden. Aktuell: $branch"
    }

    $changes = & git status --porcelain
    if ($LASTEXITCODE -ne 0) {
        throw 'Der Git-Status konnte nicht ermittelt werden.'
    }
    if ($changes) {
        throw 'Der Arbeitsbaum enthält ungespeicherte Änderungen. Bitte zuerst vollständig committen.'
    }

    $frozenHeadCommit = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'Der Commit des eingefrorenen Release-Kandidaten konnte nicht ermittelt werden.'
    }

    $requiredTrackedFiles = @(
        '.mobiliti-dashboard-root',
        'RELEASE.md',
        'deploy.sh',
        'docker-compose.yml',
        'docker-compose.prod.yml',
        'backend/Dockerfile',
        'backend/package.json',
        'backend/package-lock.json',
        'backend/scripts/runMigrations.js',
        'frontend/package.json',
        'frontend/package-lock.json',
        'scripts/preflight.ps1',
        'scripts/create-sftp-release.ps1'
    )
    foreach ($requiredFile in $requiredTrackedFiles) {
        & git ls-files --error-unmatch -- $requiredFile *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "Release-Pflichtdatei ist nicht in Git enthalten: $requiredFile"
        }
    }

    & powershell.exe `
        -NoProfile `
        -ExecutionPolicy Bypass `
        -File (Join-Path $repoRoot 'scripts\preflight.ps1')
    if ($LASTEXITCODE -ne 0) {
        throw 'Preflight fehlgeschlagen; es wurde kein Release erstellt.'
    }

    $branchAfterPreflight = (& git branch --show-current).Trim()
    $headAfterPreflight = (& git rev-parse HEAD).Trim()
    $changesAfterPreflight = & git status --porcelain
    if ($LASTEXITCODE -ne 0) {
        throw 'Der Git-Stand konnte nach dem Preflight nicht geprüft werden.'
    }
    if ($branchAfterPreflight -ne 'main' -or $headAfterPreflight -ne $frozenHeadCommit -or $changesAfterPreflight) {
        throw 'Der eingefrorene Release-Kandidat wurde während des Preflights verändert. Vollständig neu prüfen.'
    }

    $headCommit = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'Der aktuelle Commit konnte nicht ermittelt werden.'
    }

    & git show-ref --tags --verify --quiet "refs/tags/$Version"
    $tagExists = $LASTEXITCODE -eq 0
    if ($tagExists) {
        $tagCommit = (& git rev-list -n 1 $Version).Trim()
        if ($tagCommit -ne $headCommit) {
            throw "Der Tag $Version existiert bereits und zeigt nicht auf den aktuellen main-Commit."
        }
    }

    $resolvedOutputDirectory = Join-Path $repoRoot $OutputDirectory
    New-Item -ItemType Directory -Force -Path $resolvedOutputDirectory | Out-Null

    $archiveName = "mobiliti-dashboard-$Version.tar.gz"
    $archivePath = Join-Path $resolvedOutputDirectory $archiveName
    $checksumPath = "$archivePath.sha256"

    if ((Test-Path -LiteralPath $archivePath) -or (Test-Path -LiteralPath $checksumPath)) {
        throw "Release-Dateien existieren bereits: $archiveName"
    }

    & git archive --format=tar.gz --output=$archivePath HEAD
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $archivePath)) {
        throw 'Das Release-Archiv konnte nicht erstellt werden.'
    }
    $createdArtifacts = $true

    $archiveEntries = & tar -tzf $archivePath
    if ($LASTEXITCODE -ne 0) {
        throw 'Das erzeugte Release-Archiv kann nicht gelesen werden.'
    }
    $forbiddenEntry = $archiveEntries | Where-Object {
        $_ -match '(^|/)(\.env($|\.)|backups/|node_modules/|frontend/dist/|\.git/)'
    } | Select-Object -First 1
    if ($forbiddenEntry) {
        throw "Verbotener Inhalt im Release-Archiv: $forbiddenEntry"
    }

    foreach ($requiredFile in $requiredTrackedFiles) {
        if ($archiveEntries -notcontains $requiredFile) {
            throw "Release-Pflichtdatei fehlt im Archiv: $requiredFile"
        }
    }

    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
    [System.IO.File]::WriteAllText(
        $checksumPath,
        "$hash  $archiveName`n",
        [System.Text.Encoding]::ASCII
    )

    if (-not $tagExists) {
        & git tag -a $Version -m "Release $Version"
        if ($LASTEXITCODE -ne 0) {
            throw "Der Release-Tag $Version konnte nicht erstellt werden."
        }
    }

    Write-Host 'SFTP-Release erfolgreich erstellt:' -ForegroundColor Green
    Write-Host "  Commit:    $headCommit"
    Write-Host "  Archiv:    $archivePath"
    Write-Host "  Prüfsumme: $checksumPath"
    Write-Host '  Freeze:    Git-Stand während des vollständigen Preflights unverändert'
    Write-Host 'Nur diese beiden Dateien nach .deploy/incoming/ hochladen.'
} catch {
    if ($createdArtifacts) {
        if ($archivePath -and (Test-Path -LiteralPath $archivePath)) {
            Remove-Item -LiteralPath $archivePath -Force
        }
        if ($checksumPath -and (Test-Path -LiteralPath $checksumPath)) {
            Remove-Item -LiteralPath $checksumPath -Force
        }
    }
    throw
} finally {
    Pop-Location
}
