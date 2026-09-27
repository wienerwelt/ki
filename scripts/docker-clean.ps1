[CmdletBinding()]
param(
    [switch]$Apply,
    [ValidateRange(1, 100)]
    [int]$MaxBuildCacheGiB = 10,
    [ValidateRange(1, 500)]
    [int]$WarningFreeSpaceGiB = 30,
    [ValidateRange(1, 500)]
    [int]$StopBuildBelowGiB = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-DockerCommand {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker-Befehl fehlgeschlagen: docker $($Arguments -join ' ')"
    }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI wurde nicht gefunden.'
}

$serverVersion = & docker info --format '{{.ServerVersion}}' 2>$null
if ($LASTEXITCODE -ne 0 -or -not $serverVersion) {
    throw 'Docker Engine ist nicht erreichbar. Es wurde nichts veraendert.'
}

$systemDriveName = if ($env:SystemDrive) { $env:SystemDrive.TrimEnd(':') } else { 'C' }
$systemDrive = Get-PSDrive -Name $systemDriveName -ErrorAction Stop
$freeGiB = [math]::Round($systemDrive.Free / 1GB, 2)
$danglingImageIds = @(& docker image ls --filter dangling=true --quiet)
if ($LASTEXITCODE -ne 0) {
    throw 'Dangling Images konnten nicht ermittelt werden.'
}

Write-Host 'Docker-Speicherbericht' -ForegroundColor Cyan
Write-Host "Engine: $serverVersion"
Write-Host "Freier Speicher auf $($systemDriveName): $freeGiB GiB"
Write-Host "Dangling Images: $($danglingImageIds.Count)"
Write-Host "Build-Cache-Ziel: maximal $MaxBuildCacheGiB GiB"

if ($freeGiB -lt $StopBuildBelowGiB) {
    Write-Warning "Weniger als $StopBuildBelowGiB GiB frei. Keine vollstaendigen Docker-Builds starten."
}
elseif ($freeGiB -lt $WarningFreeSpaceGiB) {
    Write-Warning "Weniger als $WarningFreeSpaceGiB GiB frei. Speicherentwicklung beobachten."
}

if (-not $Apply) {
    Write-Host ''
    Write-Host 'Nur Bericht. Es wurde nichts geloescht.' -ForegroundColor Yellow
    Write-Host "Sichere Bereinigung: .\scripts\docker-clean.ps1 -Apply -MaxBuildCacheGiB $MaxBuildCacheGiB"
    exit 0
}

Write-Host ''
Write-Host 'Bereinige ausschliesslich dangling Images und ungenutzten Build-Cache ...' -ForegroundColor Yellow
Invoke-DockerCommand -Arguments @('image', 'prune', '--force')
Invoke-DockerCommand -Arguments @(
    'buildx',
    'prune',
    '--force',
    '--max-used-space',
    "${MaxBuildCacheGiB}gb"
)

$systemDrive = Get-PSDrive -Name $systemDriveName -ErrorAction Stop
$freeAfterGiB = [math]::Round($systemDrive.Free / 1GB, 2)
Write-Host ''
Write-Host 'Sichere Docker-Bereinigung abgeschlossen.' -ForegroundColor Green
Write-Host "Freier Speicher auf $($systemDriveName): $freeAfterGiB GiB"
Write-Host 'Container, Netzwerke, Volumes und getaggte Images wurden nicht bereinigt.'
Write-Host 'Hinweis: Physisch freier Windows-Speicher kann erst nach einer VHDX-Kompaktierung sichtbar werden.'
