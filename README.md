# mobiliti Dashboard

Die einzige verbindliche Anleitung für lokale Entwicklung, Tests, Release-Erstellung, SFTP-Upload, produktives Deployment, Backup, Kontrolle und Rollback ist:

## [RELEASE.md](./RELEASE.md)

Keine Befehle aus alten Notizen oder früheren Startanleitungen verwenden. Bei einem Widerspruch gilt ausschließlich `RELEASE.md`.

Wichtige Grundregel: `.env`, Datenbankdateien, Backups, Upload-Verzeichnisse, `node_modules` und `frontend/dist` werden niemals manuell von Dev nach Prod kopiert.
