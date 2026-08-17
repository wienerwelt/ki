# Dev → Prod: einzige verbindliche Release-Anleitung

Diese Datei ist die **einzige** Anleitung für Entwicklung, Prüfung, SFTP-Upload, produktives Deployment, Kontrolle und Rollback des mobiliti-Dashboards.

Arbeitsregel: Jeden nummerierten Schritt vollständig abschließen. Sobald ein Befehl einen Fehler zeigt, **stoppen**, nichts überspringen und nicht blind erneut ausführen.

## Feste Umgebung: Wo welcher Befehl ausgeführt wird

Es gibt genau diese drei Stationen:

- **DEV / Windows:** VS Code mit integriertem PowerShell-Terminal und Docker Desktop. Der Prompt beginnt beispielsweise mit `PS C:\DATEN\WWW\projekte-App\dashboard>`. Hier werden die Abschnitte 4 bis 7 sowie der als DEV markierte Teil von Abschnitt 15 ausgeführt. Abschnitt 16 enthält die vollständigen Copy-&-Paste-Blöcke für spätere Routine-Updates.
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
- erhält die bestehenden Zugriffsrechte des produktiven Projekt-Roots für Nginx/Plesk;
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
  JWT_EXPIRES_IN=8h
  SESSION_COOKIE_MAX_AGE_MS=28800000
  ```

  `JWT_SECRET` muss ebenfalls vorhanden sein und mindestens 32 zufällige Zeichen haben. Sein Inhalt wird niemals in Git, in diese Anleitung oder in Terminalausgaben kopiert. `SESSION_COOKIE_MAX_AGE_MS=28800000` begrenzt eine Browser-Sitzung auf acht Stunden; eine Verlängerung erfolgt bewusst über den Sitzungsdialog.

- Optional kann ein erreichbarer ClamAV-Dienst für hochgeladene Dokumente aktiviert werden. Erst wenn der Dienst unter dem angegebenen Host tatsächlich läuft, diese Werte lokal und in Produktion ergänzen:

  ```env
  CLAMAV_HOST=clamav
  CLAMAV_PORT=3310
  REQUIRE_MALWARE_SCAN_FOR_PUBLIC_FILES=true
  ```

  Ohne `CLAMAV_HOST` werden Dateien als „nicht geprüft“ gekennzeichnet. Externe Links funktionieren weiterhin. Mit `REQUIRE_MALWARE_SCAN_FOR_PUBLIC_FILES=true` wird dagegen sicher geschlossen: Upload und externe Freigabe werden abgelehnt, wenn ClamAV nicht erreichbar ist oder keine saubere Prüfung bestätigt.

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
   PROJECT_MARKER="$(<.mobiliti-dashboard-root)"
   test "${PROJECT_MARKER%$'\r'}" = "mobiliti-dashboard" && echo "Projektmarker OK"
   grep -F "Produktionsdatenbank sichern und Backup prüfen" deploy.sh
   ```

Nur wenn beide Befehle eine positive Ausgabe liefern, mit dem normalen Ablauf fortfahren.

## 4. DEV / VS Code-PowerShell: Release-Version festlegen

Format: `vYYYY.MM.DD.N`. `N` beginnt pro Tag bei `1` und wird für jedes weitere Release erhöht.

Für jedes Release in PowerShell eine neue Version eingeben:

```powershell
$ReleaseVersion = (Read-Host 'Neue Release-Version, z. B. v2026.08.16.1').Trim()
if ($ReleaseVersion -notmatch '^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$') {
  throw 'Ungültiges Format. Erwartet: vYYYY.MM.DD.N'
}
if (git tag --list $ReleaseVersion) {
  throw "Release-Version existiert bereits: $ReleaseVersion"
}
$ReleaseVersion
```

Eine Versionsnummer darf nach erfolgreichem Deployment niemals wiederverwendet werden.

## 5. DEV / VS Code-PowerShell und Docker Desktop: entwickeln und prüfen

1. Projekt öffnen und Docker starten:

   ```powershell
   Set-Location 'C:\DATEN\WWW\projekte-App\dashboard'
   docker compose up -d
   docker compose ps
   Invoke-RestMethod 'http://127.0.0.1:5001/api/health'
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
   - nach dem Login kein `jwt_token` oder `token` in Local Storage; die Anmeldung läuft ausschließlich über ein HttpOnly-Cookie
   - als Mandantenassistenz keine globalen Adminseiten wie Mandantenverwaltung, Anzeigen, Cronjobs oder Systemmonitor erreichbar
   - Benutzerverwaltung der Mandantenassistenz zeigt und findet ausschließlich normale Benutzer des eigenen Mandanten
   - Dashboard und geänderte Widgets
   - Community-Profile, Bewertungen und Benutzersuche
   - Actions & Software im Adminbereich
   - Software-Lexikon intern und öffentlich
   - Branchenverzeichnis als Liste und Karte
   - Datencloud: externen Dokumentlink mit Ablaufdatum erzeugen, ohne Login herunterladen und wieder deaktivieren
   - Public Page, Logos, Kategorien, Kalender und Netzwerkticker
   - Browser-Konsole ohne neue Fehler
   - Kontaktformular nur dann real absenden, wenn ein Testdatensatz und Testmails gewünscht sind

5. Vollständigen automatischen Preflight ausführen:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\preflight.ps1
   ```

Der Preflight prüft Dev- und Prod-Compose, alle npm-Abhängigkeiten einschließlich Build-/Dev-Werkzeugen auf kritische Sicherheitsmeldungen, `deploy.sh`, Backend-Syntax, unsichere JWT-Ablage im Frontend, Migrationen und Frontend-Build. Danach baut er die Docker-Images neu, erneuert ausschließlich die anonymen Dev-Abhängigkeitsvolumes, erstellt die lokale API und Worker daraus neu und prüft API-Health sowie alle sicheren fachlichen Smoke-Tests. Der Sicherheitstest erwartet insbesondere `403` auf globalen Adminrouten für Assistenzen, `404` auf fremde Mandantendaten und `403` auf Cookie-Schreibzugriffe ohne CSRF-Token. Er versendet keine E-Mails. Nur bei der Meldung `Preflight vollständig erfolgreich.` fortfahren.

6. DEV nach der Arbeit sicher stoppen:

   Im PowerShell-Fenster mit dem laufenden Frontend zuerst `Strg+C` drücken. Danach in einem PowerShell-Fenster ausführen:

   ```powershell
   Set-Location 'C:\DATEN\WWW\projekte-App\dashboard'
   docker compose stop
   docker compose ps
   ```

   `docker compose stop` erhält Datenbank, Redis-Daten und Uploads. Docker Desktop darf anschließend beendet werden. Niemals `docker compose down -v` verwenden.

## 6. DEV / VS Code-PowerShell: Änderungen vollständig in Git abschließen

Git wird hier als lokales Sicherheitsnetz und als eindeutige Quelle für das Release-Archiv verwendet. Dafür sind keine Git-Vorkenntnisse nötig. Git übernimmt ausschließlich Projektcode und Konfigurationen, die nicht durch `.gitignore` ausgeschlossen sind. Die lokale oder produktive Datenbank, `.env`, Backups, Uploads, `node_modules` und `frontend/dist` werden dadurch weder übertragen noch verändert.

Jedes Änderungspaket wird auf einem eigenen Feature-Branch entwickelt. Erst der vollständig geprüfte Stand wird nach `main` übernommen. Abschnitt 16 enthält dafür einen zusammenhängenden Copy-&-Paste-Block.

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

   Die erste Ausgabe muss den absichtlich verwendeten Feature-Branch zeigen. Bei unbekannten oder nicht beabsichtigten Dateien stoppen.

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
   git commit -m "Release: $ReleaseVersion"
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
PROJECT_MARKER="$(<.mobiliti-dashboard-root)"
test "${PROJECT_MARKER%$'\r'}" = "mobiliti-dashboard" && echo "Projektmarker OK"
test -f .env && echo ".env vorhanden"
grep -F 'FRONTEND_URL=https://dashboard.mobiliti.at' .env
grep -F 'SESSION_COOKIE_MAX_AGE_MS=28800000' .env
JWT_SECRET_VALUE="$(sed -n 's/^JWT_SECRET=//p' .env | tail -n 1)"
test "${#JWT_SECRET_VALUE}" -ge 32 && echo "JWT_SECRET-Länge OK"
unset JWT_SECRET_VALUE
df -h .
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Stoppen, wenn:

- `pwd` nicht exakt das Produktions-Projektverzeichnis zeigt;
- Projektmarker oder `.env` fehlen;
- `FRONTEND_URL` oder `SESSION_COOKIE_MAX_AGE_MS` falsch ist;
- `JWT_SECRET` fehlt oder kürzer als 32 Zeichen ist;
- der Datenträger fast voll ist;
- PostgreSQL nicht läuft oder nicht gesund ist.

Upload-Dateien prüfen:

```bash
while true; do
  read -r -p 'Release-Version, z. B. v2026.08.16.1: ' RELEASE_VERSION
  [[ "$RELEASE_VERSION" =~ ^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$ ]] && break
  echo 'Ungültiges Format. Erwartet: vYYYY.MM.DD.N'
done

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
cd /var/www/vhosts/mobiliti.at/httpdocs/dashboard
cat .deploy/current-release
LATEST_BACKUP="$(ls -1t "backups/pre-${RELEASE_VERSION}-"*.dump | head -n 1)"
test -s "$LATEST_BACKUP" && echo "Backup vorhanden: $LATEST_BACKUP"
(cd backups && sha256sum --check "$(basename "$LATEST_BACKUP").sha256")
stat -c '%A  %a  %U:%G  %n' .
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl --fail --silent http://127.0.0.1:5001/api/health
echo
curl --fail --silent https://dashboard.mobiliti.at/api/health
echo
curl --fail --silent --show-error --head https://dashboard.mobiliti.at/
```

Erwartet:

- `current-release` entspricht der neuen Version;
- Backup ist vorhanden und nicht leer;
- Prüfsumme ist `OK`;
- der Projekt-Root hat weiterhin die Plesk-Rechte `755`;
- alle benötigten Container laufen;
- beide Healthchecks liefern `"status":"ok"`;
- die öffentliche Startseite liefert HTTP-Status `200`.

## 12. PROD / Ubuntu über PuTTY oder Plesk und Browser: fachlich testen

In dieser Reihenfolge kontrollieren:

1. Mandantenspezifische Public Page öffnen.
2. Login durchführen, Dashboard öffnen und wieder ausloggen.
   Ein einmaliges erneutes Anmelden nach diesem Sicherheitsrelease ist normal, wenn die vorherige Sitzung älter als acht Stunden war.
3. Prüfen, ob nach Logout wieder der richtige öffentliche Mandanten-Slug sichtbar ist.
4. Community öffnen, Nutzerprofile und Organisation kontrollieren.
5. In der Benutzerverwaltung einen Benutzer suchen, der nicht unter den ersten 50 steht.
6. Als Assistenz sicherstellen, dass keine fremden Mandanten gefunden werden.
   Zusätzlich prüfen, dass globale Adminseiten mit `403` gesperrt bleiben; Benutzer, Briefing, Actions/Software, Umfragen, Community und Rechtsmonitor des eigenen Mandanten bleiben verfügbar.
7. Software-Lexikon, Bewertungen und Community-Verknüpfung prüfen.
8. Branchenverzeichnis als Liste und Karte sowie Software-/Action-Markierungen prüfen.
9. Adminseite **Actions & Software** laden und einen vorhandenen Eintrag öffnen, aber nicht unnötig verändern.
10. Unter **Admin → Business Partner → Bearbeiten → Newsletter-Versand** kontrollieren: Versandmodus, zentrale Newsletter-Adresse, externen Anmeldelink und direktes Empfängerlimit. Bestehende Mandanten starten sicher mit `Direkt über Mobiliti` und einem Limit von `250`; bei mehr Empfängern wird nur mit hinterlegter zentraler Adresse ein Export erzeugt.
11. Unter **Briefing Redaktion** die gewünschte Versandfrequenz prüfen. `Nie` bedeutet: Das Briefing bleibt im Dashboard und es wird keine automatische E-Mail versendet.
12. Im Daily Cockpit kontrollieren: Mobiliti-Modus zeigt den Opt-in-Schalter, Export-Modus zeigt zentralen Versand, externer Modus verlinkt zur externen Anmeldung. Im Produktionstest keinen echten Massenversand auslösen.
13. Admin-Aktivitätsmonitor und Monatsreport-Status öffnen.
14. Browser-Konsole auf neue Fehler prüfen.
15. Kontaktformular nur bei gewünschtem Ende-zu-Ende-Test einmal absenden und Eingang von interner Mail sowie Bestätigung kontrollieren.
16. Nach einer Passwortänderung kontrollieren, dass eine vorherige Sitzung dieses Nutzers nicht weiterverwendet werden kann.

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
   while true; do
     read -r -p 'Exakter Backup-Pfad, z. B. backups/pre-vYYYY.MM.DD.N-ZEITSTEMPEL.dump: ' RESTORE_BACKUP
     [[ "$RESTORE_BACKUP" == backups/pre-v*.dump ]] && break
     echo 'Ungültiger Backup-Pfad.'
   done
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
  if ([string]::IsNullOrWhiteSpace($ReleaseVersion)) {
    $ReleaseVersion = (Read-Host 'Erfolgreich deployte Release-Version').Trim()
  }
  git push origin main
  git push origin $ReleaseVersion
  ```

- Kurz dokumentieren: Version, Zeitpunkt, Ergebnis, Backup-Datei und besondere Beobachtungen.

## 16. Copy & Paste: vollständiges Routine-Update DEV → PROD

Dieser Abschnitt ist die Copy-&-Paste-Kurzfassung. Die Abschnitte 4 bis 15 erklären die Prüfungen, Fehlerfälle und erwarteten Ergebnisse. Abschnitt 3 ist nur für den einmaligen Umstieg gedacht und wird nicht wiederholt.

### A. DEV / PowerShell: neue Änderung beginnen

Nur einmal am Anfang eines neuen Änderungspakets ausführen, nicht bei jedem Start am nächsten Tag:

```powershell
Set-Location 'C:\DATEN\WWW\projekte-App\dashboard'

function Assert-NativeSuccess([string]$Message) {
  if ($LASTEXITCODE -ne 0) { throw "STOPP: $Message" }
}

git switch main
Assert-NativeSuccess 'main konnte nicht ausgecheckt werden.'
git pull --ff-only
Assert-NativeSuccess 'main konnte nicht sicher aktualisiert werden.'
if (git status --porcelain) {
  throw 'STOPP: main enthält lokale Änderungen.'
}

$FeatureBranch = "codex/update-$(Get-Date -Format 'yyyyMMdd-HHmm')"
git switch -c $FeatureBranch
Assert-NativeSuccess 'Feature-Branch konnte nicht erstellt werden.'
git status --short --branch
Assert-NativeSuccess 'Git-Status konnte nicht gelesen werden.'
```

### B. DEV / PowerShell: Entwicklungsumgebung starten

BACKEND starten:

```powershell
Set-Location 'C:\DATEN\WWW\projekte-App\dashboard'

function Assert-NativeSuccess([string]$Message) {
  if ($LASTEXITCODE -ne 0) { throw "STOPP: $Message" }
}

if (-not (Test-Path '.\.mobiliti-dashboard-root')) {
  throw 'STOPP: falsches Projektverzeichnis.'
}

docker compose up -d
Assert-NativeSuccess 'Docker-Dienste konnten nicht gestartet werden.'
docker compose ps
Assert-NativeSuccess 'Docker-Status konnte nicht gelesen werden.'
docker compose exec -T api npm run migrate
Assert-NativeSuccess 'Lokale Migrationen sind fehlgeschlagen.'
Invoke-RestMethod 'http://127.0.0.1:5001/api/health'
```

FRONTEND starten:

```powershell
Set-Location 'C:\DATEN\WWW\projekte-App\dashboard'

if (-not (Test-Path '.\frontend\package.json')) {
  throw 'STOPP: frontend\package.json wurde nicht gefunden.'
}

npm.cmd --prefix .\frontend run dev
```

Frontend im Browser über die von Vite angezeigte lokale URL öffnen, normalerweise `http://localhost:5173`.

### C. DEV / PowerShell: Entwicklungsumgebung stoppen

Im Frontend-Fenster zuerst `Strg+C` drücken. Danach:

```powershell
Set-Location 'C:\DATEN\WWW\projekte-App\dashboard'
function Assert-NativeSuccess([string]$Message) {
  if ($LASTEXITCODE -ne 0) { throw "STOPP: $Message" }
}
docker compose stop
Assert-NativeSuccess 'Docker-Dienste konnten nicht gestoppt werden.'
docker compose ps
Assert-NativeSuccess 'Docker-Status konnte nicht gelesen werden.'
```

Das erhält Datenbank, Redis-Daten und Uploads. Niemals `docker compose down -v` verwenden.

### D. DEV / PowerShell: geprüftes Release erzeugen

Erst ausführen, wenn Entwicklung und manueller Browsertest abgeschlossen sind:

```powershell
Set-Location 'C:\DATEN\WWW\projekte-App\dashboard'

function Assert-NativeSuccess([string]$Message) {
  if ($LASTEXITCODE -ne 0) { throw "STOPP: $Message" }
}

$ReleaseVersion = (Read-Host 'Neue Release-Version, z. B. v2026.08.16.1').Trim()
if ($ReleaseVersion -notmatch '^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$') {
  throw 'STOPP: ungültiges Versionsformat. Erwartet: vYYYY.MM.DD.N'
}
if (git tag --list $ReleaseVersion) {
  throw "STOPP: Release-Version existiert bereits: $ReleaseVersion"
}

$FeatureBranch = (git branch --show-current).Trim()
if ([string]::IsNullOrWhiteSpace($FeatureBranch) -or $FeatureBranch -eq 'main') {
  throw 'STOPP: Vor dem Release muss der geprüfte Feature-Branch aktiv sein.'
}

powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\preflight.ps1
Assert-NativeSuccess 'Preflight fehlgeschlagen.'

git -c core.pager=cat -c core.safecrlf=false diff --check
Assert-NativeSuccess 'Arbeitsbaum enthält ungültige Änderungen.'
git -c core.safecrlf=false add -A
Assert-NativeSuccess 'Änderungen konnten nicht gestagt werden.'
git -c core.pager=cat -c core.safecrlf=false diff --cached --check
Assert-NativeSuccess 'Gestagte Änderungen enthalten Fehler.'
git status --short
Assert-NativeSuccess 'Git-Status konnte nicht gelesen werden.'
git --no-pager diff --cached --stat
Assert-NativeSuccess 'Commit-Übersicht konnte nicht erzeugt werden.'

$Freigabe = (Read-Host 'Nur wenn alle Dateien beabsichtigt sind, JA eingeben').Trim()
if ($Freigabe -cne 'JA') {
  throw 'STOPP: Commit wurde nicht freigegeben.'
}

git commit -m "Release: $ReleaseVersion"
Assert-NativeSuccess 'Release-Commit ist fehlgeschlagen.'
git switch main
Assert-NativeSuccess 'main konnte nicht ausgecheckt werden.'
git pull --ff-only
Assert-NativeSuccess 'main konnte nicht sicher aktualisiert werden.'
git merge --no-ff $FeatureBranch
Assert-NativeSuccess 'Feature-Branch konnte nicht nach main übernommen werden.'

if ((git branch --show-current).Trim() -ne 'main' -or (git status --porcelain)) {
  throw 'STOPP: main ist nach dem Merge nicht sauber.'
}

powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-sftp-release.ps1 -Version $ReleaseVersion
Assert-NativeSuccess 'Release-Paket wurde nicht erstellt.'

Get-ChildItem ".\releases\mobiliti-dashboard-$ReleaseVersion.tar.gz*" |
  Select-Object Name, Length, LastWriteTime
```

Erwartet: `Preflight vollständig erfolgreich.` sowie genau ein Archiv und eine `.sha256`-Datei.

### E. SFTP / Windows: genau zwei Dateien übertragen

Von:

```text
C:\DATEN\WWW\projekte-App\dashboard\releases\
```

Nach:

```text
/var/www/vhosts/mobiliti.at/httpdocs/dashboard/.deploy/incoming/
```

Nur diese beiden Dateien der neuen Version übertragen:

```text
mobiliti-dashboard-<Version>.tar.gz
mobiliti-dashboard-<Version>.tar.gz.sha256
```

### F. PROD / PuTTY: prüfen, bestätigen, deployen und technisch testen

Den gesamten folgenden Block in PuTTY einfügen. Die Release-Version wird abgefragt. Bei einem Fehler stoppt nur der Block; die SSH-Sitzung bleibt geöffnet. Das Deployment startet erst nach Eingabe von `DEPLOY`.

```bash
(
  set -Eeuo pipefail

  cd /var/www/vhosts/mobiliti.at/httpdocs/dashboard

  read -r -p 'Release-Version, z. B. v2026.08.16.1: ' RELEASE_VERSION
  [[ "$RELEASE_VERSION" =~ ^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$ ]] || {
    echo 'STOPP: ungültiges Versionsformat.'
    exit 1
  }

  test "$(pwd)" = '/var/www/vhosts/mobiliti.at/httpdocs/dashboard'

  PROJECT_MARKER=''
  IFS= read -r PROJECT_MARKER < .mobiliti-dashboard-root || true
  PROJECT_MARKER="${PROJECT_MARKER%$'\r'}"
  test "$PROJECT_MARKER" = 'mobiliti-dashboard'

  test -f .env
  grep -F 'FRONTEND_URL=https://dashboard.mobiliti.at' .env
  grep -F 'SESSION_COOKIE_MAX_AGE_MS=28800000' .env
  JWT_SECRET_VALUE="$(sed -n 's/^JWT_SECRET=//p' .env | tail -n 1)"
  test "${#JWT_SECRET_VALUE}" -ge 32
  unset JWT_SECRET_VALUE
  test "$(stat -c '%a' .)" = '755'

  test -f ".deploy/incoming/mobiliti-dashboard-${RELEASE_VERSION}.tar.gz"
  test -f ".deploy/incoming/mobiliti-dashboard-${RELEASE_VERSION}.tar.gz.sha256"

  df -h .
  docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

  (
    cd .deploy/incoming
    sha256sum --check "mobiliti-dashboard-${RELEASE_VERSION}.tar.gz.sha256"
  )

  read -r -p 'Nur wenn alle Prüfungen passen, DEPLOY eingeben: ' DEPLOY_CONFIRMATION
  test "$DEPLOY_CONFIRMATION" = 'DEPLOY'

  bash ./deploy.sh ".deploy/incoming/mobiliti-dashboard-${RELEASE_VERSION}.tar.gz"

  test "$(<.deploy/current-release)" = "$RELEASE_VERSION"

  LATEST_BACKUP="$(ls -1t "backups/pre-${RELEASE_VERSION}-"*.dump | head -n 1)"
  test -s "$LATEST_BACKUP"
  (
    cd backups
    sha256sum --check "$(basename "$LATEST_BACKUP").sha256"
  )

  test "$(stat -c '%a' .)" = '755'
  docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

  curl --fail --silent http://127.0.0.1:5001/api/health
  echo
  curl --fail --silent https://dashboard.mobiliti.at/api/health
  echo
  curl --fail --silent --show-error --head https://dashboard.mobiliti.at/

  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --since=15m --tail=150 api
  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --since=15m --tail=100 worker-mail

  echo "Technische Prüfung für ${RELEASE_VERSION} abgeschlossen."
  echo "Backup: ${LATEST_BACKUP}"
)
```

Danach den fachlichen Browsertest aus Abschnitt 12 durchführen. Bei einem Fehler Abschnitt 13 verwenden und den Deployment-Befehl nicht blind wiederholen.

### G. DEV / PowerShell: erfolgreiches Release in Git sichern

Erst nach erfolgreichem technischen und fachlichen Produktionstest:

```powershell
Set-Location 'C:\DATEN\WWW\projekte-App\dashboard'

function Assert-NativeSuccess([string]$Message) {
  if ($LASTEXITCODE -ne 0) { throw "STOPP: $Message" }
}

$ReleaseVersion = (Read-Host 'Erfolgreich deployte Release-Version').Trim()
if ($ReleaseVersion -notmatch '^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$') {
  throw 'STOPP: ungültiges Versionsformat.'
}

git push origin main
Assert-NativeSuccess 'main konnte nicht gepusht werden.'
git push origin $ReleaseVersion
Assert-NativeSuccess 'Release-Tag konnte nicht gepusht werden.'
git status --short --branch
Assert-NativeSuccess 'Git-Status konnte nicht gelesen werden.'
```

Erwartet: `main...origin/main` ohne `ahead` und ohne geänderte Dateien.
