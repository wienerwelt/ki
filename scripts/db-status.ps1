$container = "mobiliti-dashboard-postgres16"
$dbName = "dashboard-mobiliti_lokal"

Write-Host "Prüfe Docker-Container..." -ForegroundColor Cyan
docker ps --filter "name=$container"

Write-Host ""
Write-Host "Prüfe Datenbank-Version..." -ForegroundColor Cyan
docker exec -it $container psql -U postgres -d $dbName -c "SELECT version();"

Write-Host ""
Write-Host "Prüfe User-Anzahl..." -ForegroundColor Cyan
docker exec -it $container psql -U postgres -d $dbName -c "SELECT COUNT(*) AS users_count FROM users;"
