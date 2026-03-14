Write-Host "Stoppe Dev Umgebung..." -ForegroundColor Yellow
npm run dev:stop

Start-Sleep -Seconds 2

Write-Host "Starte Dev Umgebung..." -ForegroundColor Cyan
npm run dev:all
