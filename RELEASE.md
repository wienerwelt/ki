# Dev → Prod: einzige verbindliche Release-Anleitung

Diese Datei ist die **einzige** Anleitung für Entwicklung, Prüfung, SFTP-Upload, produktives Deployment, Kontrolle und Rollback des mobiliti-Dashboards.

Arbeitsregel: Jeden nummerierten Schritt vollständig abschließen. Sobald ein Befehl einen Fehler zeigt, **stoppen**, nichts überspringen und nicht blind erneut ausführen.

## Feste Umgebung: Wo welcher Befehl ausgeführt wird

Es gibt genau diese drei Stationen:

- **DEV / Windows:** VS Code mit integriertem PowerShell-Terminal und Docker Desktop. Der Prompt beginnt beispielsweise mit `PS C:\DATEN\WWW\projekte-App\dashboard>`. Hier werden die Abschnitte 4 bis 7 sowie der als DEV markierte Teil von Abschnitt 15 ausgeführt.
- **ÜBERTRAGUNG / Windows:** Ein SFTP-Programm überträgt ausschließlich die in Abschnitt 8 genannten zwei Release-Dateien auf den Ubuntu-Server.
- **PROD / Ubuntu:** Zugriff über PuTTY/SSH oder das Plesk-Terminal; die Anwendung läuft in Docker. Der Prompt enthält beispielsweise `@...:~/httpdocs/dashboard$`. Hier werden ausschließlich Abschnitt 3, die Abschnitte 9 bis 14 sowie der als PROD markierte Teil von Abschnitt 15 ausgeführt.

Abschnitt 8 ist kein Terminalbefehl, sondern der SFTP-Upload von Windows nach Ubuntu. Niemals `powershell`, `powershell.exe`, `.ps1` oder `npm.cmd` in PuTTY, im Plesk-Terminal oder anderweitig auf dem Ubuntu-Server ausführen. PowerShell dafür nicht auf Produktion installieren.

## 0. Was dieser Prozess schützt

Das Deployment:

- überträgt nur ein geprüftes Release-Archiv und dessen SHA-256-Datei;
- überträgt niemals `.env`, Datenbankdateien, `node_modules` oder Produktions-Uploads;
- erstellt **vor jeder Codeänderung** ein neues PostgreSQL-Backup mit Zeitstempel;
- prüft das Backup mit `pg_restore --list` und erzeugt eine SHA-256-Prüfsumme;
- überschreibt kein vorhandenes Backup;
- führt jede nummerierte Migration höchstens einmal aus und blockiert nachträglich veränderte Migrationen;
- erhält PostgreSQL- und Redis-Volumes sowie Upload-Verzeichnisse;
- aktiviert ein Release erst nach erfolgreichem API-Healthcheck.

Nicht automatisch rückgängig gemacht werden Datenbankmigrationen. Migrationen müssen deshalb additiv und mit der vorherigen App-Version kompatibel sein. Ein normaler Rollback betrifft zuerst nur den Code.

## 1. Niemals tun

Diese Befehle gehören **nicht** in einen normalen Release:

```text
docker compose down -v
docker volume prune
docker system prune --volumes
pg_restore --clean ...
```

Außerdem niemals per SFTP hochladen oder überschreiben:

```text
.env
backups/
backend/public/directory_logos/
backend/public/logos/
backend/public/social-media/
backend/public/grafiken/
node_modules/
frontend/dist/
```

Keine einzelnen Quellcodedateien mehr per SFTP verteilen. Im normalen Ablauf werden ausschließlich Release-Archiv und Prüfsumme übertragen.

## 2. Einmalige Voraussetzungen

### Lokal

- Docker Desktop läuft.
- Git, Node.js/npm und Git Bash sind installiert.
- Das Projekt liegt unter `C:\DATEN\WWW\projekte-App\dashboard`.
- Die lokale `.env` gehört nur zur Entwicklung und ist nicht in Git.

### Produktion

- Projektverzeichnis: `/var/www/vhosts/mobiliti.at/httpdocs/dashboard`
- Docker, Docker Compose, Node/npm, `curl`, `tar`, `sha256sum`, `rsync`, `realpath`, `mktemp` und `grep` sind installiert.
- Die produktive `.env` liegt ausschließlich im Projekt-Root des Servers.
- Darin steht mindestens:

  ```env
  FRONTEND_URL=https://dashboard.mobiliti.at
  ```

- PostgreSQL ist nur an `127.0.0.1:5434`, die API nur an `127.0.0.1:5001` gebunden.
- Plesk leitet API-Aufrufe, `/<mandanten-slug>` und `/sitemap.xml` korrekt weiter.
- Früher in `Startanleitung.txt` gespeicherte Plesk-/SSH-Zugangsdaten wurden geändert. Zugangsdaten stehen künftig nur im Passwortmanager.

## 3. PROD / Ubuntu über PuTTY oder Plesk: einmaliger Umstieg

Dieser Abschnitt wird nur beim ersten Release mit dem neuen Verfahren ausgeführt.

1. Auf dem Server das bisherige Deployment-Skript sichern:

   ```bash
   cd /var/www/vhosts/mobiliti.at/httpdocs/dashboard
   mkdir -p .deploy/incoming .deploy/tool-backup
   cp -p deploy.sh ".deploy/tool-backup/deploy-before-$(date -u +%Y%m%dT%H%M%SZ).sh"
   ```

2. Einmalig diese beiden lokalen Dateien per SFTP direkt in den Produktions-Projektroot übertragen:

   ```text
   deploy.sh
   .mobiliti-dashboard-root
   ```

3. Auf dem Server prüfen:

   ```bash
   cd /var/www/vhosts/mobiliti.at/httpdocs/dashboard
   test "$(cat .mobiliti-dashboard-root)" = "mobiliti-dashboard" && echo "Projektmarker OK"
   grep -F "Produktionsdatenbank sichern und Backup prüfen" deploy.sh
   ```

Nur wenn beide Befehle eine positive Ausgabe liefern, mit dem normalen Ablauf fortfahren.

## 4. DEV / VS Code-PowerShell: Release-Version festlegen

Format: `vYYYY.MM.DD.N`. `N` beginnt pro Tag bei `1` und wird für jedes weitere Release erhöht.

Für das aktuelle Release in PowerShell setzen:

```powershell
$ReleaseVersion = 'v2026.08.15.1'
```

Eine Versionsnummer darf nach erfolgreichem Deployment niemals wiederverwendet werden.

## 5. DEV / VS Code-PowerShell und Docker Desktop: entwickeln und prüfen

1. Projekt öffnen und Docker starten:

   ```powershell
   Set-Location 'C:\DATEN\WWW\projekte-App\dashboard'
   docker compose up -d
   docker compose ps
   ```

2. Offene Migrationen lokal anwenden:

   ```powershell
   docker compose exec -T api npm run migrate
   ```

3. Frontend für die Entwicklung starten:

   ```powershell
   Set-Location 'C:\DATEN\WWW\projekte-App\dashboard'
   if (-not (Test-Path '.\frontend\package.json')) {
     throw 'Falsches Arbeitsverzeichnis: frontend\package.json wurde nicht gefunden.'
   }
   npm.cmd --prefix .\frontend run dev
   ```

   Der Befehl muss aus dem Projekt-Root `...\dashboard` gestartet werden. Wenn die PowerShell-Eingabe bereits mit `...\dashboard\frontend>` endet, zuerst den oben stehenden `Set-Location`-Befehl ausführen. Den laufenden Dev-Server in diesem Fenster geöffnet lassen und für die weiteren Schritte ein zweites PowerShell-Fenster verwenden.

4. Manuell kontrollieren:

   - Login, Logout und Rückkehr zum richtigen Mandanten-Slug
   - Dashboard und geänderte Widgets
   - Community-Profile, Bewertungen und Benutzersuche
   - Actions & Software im Adminbereich
   - Software-Lexikon intern und öffentlich
   - Branchenverzeichnis als Liste und Karte
   - Public Page, Logos, Kategorien, Kalender und Netzwerkticker
   - Browser-Konsole ohne neue Fehler
   - Kontaktformular nur dann real absenden, wenn ein Testdatensatz und Testmails gewünscht sind

5. Vollständigen automatischen Preflight ausführen:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\preflight.ps1
   ```

Der Preflight prüft Dev- und Prod-Compose, alle npm-Abhängigkeiten einschließlich Build-/Dev-Werkzeugen auf kritische Sicherheitsmeldungen, `deploy.sh`, Backend-Syntax, Migrationen und Frontend-Build. Danach baut er die Docker-Images neu, erstellt die lokale API und Worker daraus neu und prüft API-Health sowie alle sicheren fachlichen Smoke-Tests. Er versendet keine E-Mails. Nur bei der Meldung `Preflight vollständig erfolgreich.` fortfahren.

## 6. DEV / VS Code-PowerShell: Änderungen vollständig in Git abschließen

Git wird hier als lokales Sicherheitsnetz und als eindeutige Quelle für das Release-Archiv verwendet. Dafür sind keine Git-Vorkenntnisse nötig. Git übernimmt ausschließlich Projektcode und Konfigurationen, die nicht durch `.gitignore` ausgeschlossen sind. Die lokale oder produktive Datenbank, `.env`, Backups, Uploads, `node_modules` und `frontend/dist` werden dadurch weder übertragen noch verändert.

Beim aktuellen ersten Sammelrelease werden die bisher noch nicht konsequent gespeicherten Projektänderungen einmal gemeinsam in einem Commit festgehalten. Danach enthält jedes weitere Release nur die seit dem letzten Commit hinzugekommenen Änderungen.

1. Aktuellen Feature-Branch merken und Änderungen prüfen:

   ```powershell
   $FeatureBranch = (git branch --show-current).Trim()
   if ([string]::IsNullOrWhiteSpace($FeatureBranch) -or $FeatureBranch -eq 'main') {
     throw 'Vor dem Release muss ein Feature-Branch aktiv sein.'
   }
   $FeatureBranch
   git status --short
   git -c core.pager=cat -c core.safecrlf=false diff --check
   ```

   Beim aktuellen Sammelrelease muss die erste Ausgabe `codex/public-widgets-release` lauten. Bei unbekannten oder nicht beabsichtigten Dateien stoppen.

2. Den vollständig geprüften aktuellen Arbeitsstand stagen und nochmals kontrollieren:

   ```powershell
   git -c core.safecrlf=false add -A
   git -c core.pager=cat -c core.safecrlf=false diff --cached --check
   git status --short
   git --no-pager diff --cached --stat
   ```

   `.env`, Backups, Uploads, `node_modules`, `frontend/dist`, `Startanleitung.txt` und `todo.txt` müssen wegen `.gitignore` fehlen. Falls eine solche oder eine unbekannte Datei erscheint: nicht committen, sondern stoppen.

3. Commit erstellen:

   ```powershell
   git commit -m "Release: Dashboard, Public Page und Betriebsprozess"
   ```

4. Den gemerkten Feature-Branch nach `main` übernehmen:

   ```powershell
   git switch main
   git pull --ff-only
   git merge --no-ff $FeatureBranch
   ```

5. Endzustand prüfen:

   ```powershell
   git branch --show-current
   git status --porcelain
   ```

Erwartet: erste Ausgabe `main`, zweite Ausgabe leer. Bei Konflikten oder einer nicht leeren zweiten Ausgabe stoppen.

## 7. DEV / VS Code-PowerShell: Release-Paket erzeugen

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-sftp-release.ps1 -Version $ReleaseVersion
```

Das Skript:

- akzeptiert nur einen sauberen `main`;
- führt den kompletten Preflight erneut aus;
- prüft alle Pflichtdateien;
- blockiert Secrets, Backups und Laufzeitdateien im Archiv;
- blockiert kritische Sicherheitsmeldungen in allen npm-Abhängigkeiten;
- erzeugt einen Git-Tag;
- erstellt genau zwei Dateien unter `releases\`.

Ausgabe prüfen:

```powershell
Get-ChildItem ".\releases\mobiliti-dashboard-$ReleaseVersion.tar.gz*" |
  Select-Object Name, Length, LastWriteTime
```

Erwartet werden genau:

```text
mobiliti-dashboard-<Version>.tar.gz
mobiliti-dashboard-<Version>.tar.gz.sha256
```

## 8. SFTP: genau zwei Dateien übertragen

Lokale Quelle:

```text
C:\DATEN\WWW\projekte-App\dashboard\releases\
```

Produktionsziel:

```text
/var/www/vhosts/mobiliti.at/httpdocs/dashboard/.deploy/incoming/
```

Nur diese beiden Dateien übertragen:

```text
mobiliti-dashboard-<Version>.tar.gz
mobiliti-dashboard-<Version>.tar.gz.sha256
```

Nach dem Upload noch nichts löschen und keine Dateien manuell entpacken.

## 9. PROD / Ubuntu über PuTTY oder Plesk: vor dem Deployment kontrollieren

Im Plesk-Terminal oder per SSH:

```bash
cd /var/www/vhosts/mobiliti.at/httpdocs/dashboard
pwd
test "$(cat .mobiliti-dashboard-root)" = "mobiliti-dashboard" && echo "Projektmarker OK"
test -f .env && echo ".env vorhanden"
grep -F 'FRONTEND_URL=https://dashboard.mobiliti.at' .env
df -h .
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Stoppen, wenn:

- `pwd` nicht exakt das Produktions-Projektverzeichnis zeigt;
- Projektmarker oder `.env` fehlen;
- `FRONTEND_URL` falsch ist;
- der Datenträger fast voll ist;
- PostgreSQL nicht läuft oder nicht gesund ist.

Upload-Dateien prüfen:

```bash
RELEASE_VERSION='v2026.08.15.1'
ls -lh ".deploy/incoming/mobiliti-dashboard-${RELEASE_VERSION}.tar.gz" \
       ".deploy/incoming/mobiliti-dashboard-${RELEASE_VERSION}.tar.gz.sha256"
```

`RELEASE_VERSION` muss mit der lokal erzeugten Version übereinstimmen.

## 10. PROD / Ubuntu über PuTTY oder Plesk: Deployment ausführen

Genau einen Befehl ausführen:

```bash
bash ./deploy.sh ".deploy/incoming/mobiliti-dashboard-${RELEASE_VERSION}.tar.gz"
```

Das Skript zeigt neun Stufen. Es muss mit diesen beiden Zeilen enden:

```text
Release <Version> ist live.
Datenbank-Backup: .../backups/pre-<Version>-<Zeitstempel>.dump
```

Bei irgendeinem Fehler direkt zu Abschnitt 13 wechseln. Nicht denselben Befehl blind wiederholen.

## 11. PROD / Ubuntu über PuTTY oder Plesk: Backup und Serverzustand prüfen

```bash
cat .deploy/current-release
LATEST_BACKUP="$(ls -1t "backups/pre-${RELEASE_VERSION}-"*.dump | head -n 1)"
test -s "$LATEST_BACKUP" && echo "Backup vorhanden: $LATEST_BACKUP"
(cd backups && sha256sum --check "$(basename "$LATEST_BACKUP").sha256")
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl --fail --silent https://dashboard.mobiliti.at/api/health
```

Erwartet:

- `current-release` entspricht der neuen Version;
- Backup ist vorhanden und nicht leer;
- Prüfsumme ist `OK`;
- alle benötigten Container laufen;
- Healthcheck liefert `"status":"ok"`.

## 12. PROD / Ubuntu über PuTTY oder Plesk und Browser: fachlich testen

In dieser Reihenfolge kontrollieren:

1. Mandantenspezifische Public Page öffnen.
2. Login durchführen, Dashboard öffnen und wieder ausloggen.
3. Prüfen, ob nach Logout wieder der richtige öffentliche Mandanten-Slug sichtbar ist.
4. Community öffnen, Nutzerprofile und Organisation kontrollieren.
5. In der Benutzerverwaltung einen Benutzer suchen, der nicht unter den ersten 50 steht.
6. Als Assistenz sicherstellen, dass keine fremden Mandanten gefunden werden.
7. Software-Lexikon, Bewertungen und Community-Verknüpfung prüfen.
8. Branchenverzeichnis als Liste und Karte sowie Software-/Action-Markierungen prüfen.
9. Adminseite **Actions & Software** laden und einen vorhandenen Eintrag öffnen, aber nicht unnötig verändern.
10. Admin-Aktivitätsmonitor und Monatsreport-Status öffnen.
11. Browser-Konsole auf neue Fehler prüfen.
12. Kontaktformular nur bei gewünschtem Ende-zu-Ende-Test einmal absenden und Eingang von interner Mail sowie Bestätigung kontrollieren.

Zusätzlich Serverlogs prüfen:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=150 api
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 worker-mail
```

Keine fachlichen Smoke-Skripte in Produktion starten: Einige davon erzeugen kurzzeitig Testdaten und sind bewusst nur für Dev vorgesehen.

## 13. PROD / Ubuntu über PuTTY oder Plesk: Fehlerfall und Code-Rollback

### Deployment vor den Migrationen fehlgeschlagen

- Produktionsdaten wurden nicht migriert.
- Das neue, geprüfte Backup bleibt erhalten.
- Fehlerausgabe und Logs lesen.
- Ursache lokal korrigieren und **eine neue Versionsnummer** erstellen.

### Deployment nach den Migrationen oder beim Healthcheck fehlgeschlagen

1. Serverstatus und Logs sichern:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
   docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200 api
   ls -lht backups | head
   cat .deploy/current-release 2>/dev/null || true
   ```

2. Wenn die vorherige App-Version mit den additiven Migrationen kompatibel ist, das letzte funktionierende Archiv erneut deployen. Beispiel:

   ```bash
   PREVIOUS_VERSION='v2026.08.08.1'
   bash ./deploy.sh ".deploy/incoming/mobiliti-dashboard-${PREVIOUS_VERSION}.tar.gz"
   ```

3. Danach Abschnitt 11 und 12 erneut durchführen.

Ein Code-Rollback stellt die Datenbank nicht zurück. Das ist normalerweise gewollt, weil seit dem Release bereits neue Produktionsdaten entstanden sein können.

## 14. PROD / Ubuntu über PuTTY oder Plesk: Datenbank-Restore – nur im echten Notfall

Ein Restore kann neuere Produktionsdaten löschen. Deshalb nur durchführen, wenn die Datenbank tatsächlich beschädigt oder eine Migration fachlich unbrauchbar ist und der gewünschte Backup-Zeitpunkt eindeutig feststeht.

1. Gewähltes Backup und Prüfsumme prüfen:

   ```bash
   cd /var/www/vhosts/mobiliti.at/httpdocs/dashboard
   RESTORE_BACKUP='backups/pre-v2026.08.15.1-YYYYMMDDTHHMMSSZ.dump'
   test -s "$RESTORE_BACKUP"
   (cd backups && sha256sum --check "$(basename "$RESTORE_BACKUP").sha256")
   ```

2. Vor dem Restore ein zusätzliches Backup des aktuellen Zustands erstellen. Dafür nicht improvisieren: zunächst Ursache dokumentieren und bei Unsicherheit stoppen.

3. Schreibende Dienste stoppen:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml stop \
     api worker-ai worker-scrape worker-mail worker-data worker-funding
   ```

4. Datenbankname und Benutzer aus der produktiven Konfiguration lesen:

   ```bash
   DB_INFO="$(docker compose -f docker-compose.yml -f docker-compose.prod.yml \
     run --rm --no-deps -T api node -e \
     "const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.username+'\\t'+u.pathname.slice(1))")"
   IFS=$'\t' read -r PROD_DB_USER PROD_DB_NAME <<< "$DB_INFO"
   printf 'DB-Benutzer: %s\nDB-Name: %s\n' "$PROD_DB_USER" "$PROD_DB_NAME"
   ```

5. Erst nach bewusster Bestätigung den Restore in einer Transaktion ausführen:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
     pg_restore -U "$PROD_DB_USER" -d "$PROD_DB_NAME" \
     --clean --if-exists --no-owner --no-privileges --single-transaction \
     "/backups/$(basename "$RESTORE_BACKUP")"
   ```

6. Passendes Release erneut deployen und danach Abschnitt 11 und 12 vollständig prüfen.

## 15. PROD und DEV: Nachbereitung

Auf **PROD / Ubuntu**:

- Mindestens die letzten drei funktionierenden Release-Archive samt `.sha256` auf dem Server behalten.
- Datenbank-Dumps und ihre `.sha256` nicht manuell überschreiben.
- Alte Backups erst nach bestätigter externer Sicherung und niemals während eines Releases entfernen.

Danach auf **DEV / VS Code-PowerShell** im Projekt-Root Release-Tag und `main` in das Git-Remote übertragen:

  ```powershell
  Set-Location 'C:\DATEN\WWW\projekte-App\dashboard'
  git push origin main
  git push origin $ReleaseVersion
  ```

- Kurz dokumentieren: Version, Zeitpunkt, Ergebnis, Backup-Datei und besondere Beobachtungen.

## 16. Kurzfassung für spätere Routine-Releases

Wenn der einmalige Umstieg abgeschlossen ist:

1. Lokal entwickeln und manuell testen.
2. `scripts\preflight.ps1` erfolgreich ausführen.
3. Änderungen committen und nach `main` mergen.
4. Auf sauberem `main` `create-sftp-release.ps1` ausführen.
5. Genau Archiv und `.sha256` per SFTP nach `.deploy/incoming/` laden.
6. Produktions-Vorprüfung aus Abschnitt 9 ausführen.
7. Einen `deploy.sh`-Befehl aus Abschnitt 10 ausführen.
8. Backup, Healthcheck, Anwendung und Logs nach Abschnitt 11 und 12 prüfen.
