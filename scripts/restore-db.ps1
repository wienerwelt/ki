param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile
)

$ErrorActionPreference = "Stop"

$dbName = "dashboard-mobiliti_lokal"
$container = "mobiliti-dashboard-postgres16"

if (!(Test-Path $BackupFile)) {
    Write-Error "Backup-Datei nicht gefunden: $BackupFile"
    exit 1
}

Write-Host "Stelle Backup wieder her: $BackupFile" -ForegroundColor Yellow
Write-Host "ACHTUNG: Die bestehende Datenbank wird vorher geleert." -ForegroundColor Red

docker exec -i $container psql -U postgres -d $dbName -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

cmd /c "docker exec -i $container psql -U postgres -d $dbName < `"$BackupFile`""

Write-Host "Restore abgeschlossen." -ForegroundColor Green
