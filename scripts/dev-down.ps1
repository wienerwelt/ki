Write-Host "Stoppe PostgreSQL und Redis..." -ForegroundColor Yellow
docker compose down
Write-Host "Fertig. Infrastruktur gestoppt." -ForegroundColor Yellow