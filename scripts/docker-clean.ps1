Write-Host "Räume Docker auf..." -ForegroundColor Yellow

docker container prune -f
docker network prune -f
docker image prune -f

Write-Host "Docker Cleanup abgeschlossen." -ForegroundColor Green
