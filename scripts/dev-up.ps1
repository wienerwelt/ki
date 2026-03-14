Write-Host "Starte PostgreSQL und Redis..." -ForegroundColor Green
docker compose up -d
Write-Host "Fertig. Docker-Infrastruktur läuft." -ForegroundColor Green