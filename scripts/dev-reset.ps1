Write-Host "WARNUNG: Lokale DB/Redis-Daten werden gelöscht..." -ForegroundColor Red
docker compose down -v
docker compose up -d
Write-Host "Fertig. Infrastruktur wurde frisch neu aufgebaut." -ForegroundColor Green