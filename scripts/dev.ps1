Write-Host ""
Write-Host "Mobiliti Dev Control" -ForegroundColor Cyan
Write-Host "--------------------------------"
Write-Host "1  Start Dev"
Write-Host "2  Stop Dev"
Write-Host "3  Restart Dev"
Write-Host "4  Backup DB"
Write-Host "5  Restore DB"
Write-Host "6  Reset DB"
Write-Host "7  DB Shell"
Write-Host "8  DB Status"
Write-Host ""

$choice = Read-Host "Option wählen"

switch ($choice) {

"1" { npm run dev:all }

"2" { npm run dev:stop }

"3" { .\scripts\dev-restart.ps1 }

"4" { .\scripts\backup-db.ps1 }

"5" {
$file = Read-Host "Backup Datei"
.\scripts\restore-db.ps1 -BackupFile $file
}

"6" { .\scripts\dev-reset.ps1 }

"7" { .\scripts\db-shell.ps1 }

"8" { .\scripts\db-status.ps1 }

default { Write-Host "Ungültige Auswahl" }

}
