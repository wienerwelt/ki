$ErrorActionPreference = "Stop"

$backupDir = "C:\pg-rescue"
$dbName = "dashboard-mobiliti_lokal"
$container = "mobiliti-dashboard-postgres16"

if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupFile = Join-Path $backupDir "$dbName-$timestamp.sql"

Write-Host "Erstelle Backup: $backupFile" -ForegroundColor Green

cmd /c "docker exec $container pg_dump -U postgres $dbName > `"$backupFile`""

Write-Host "Backup erfolgreich erstellt." -ForegroundColor Green
