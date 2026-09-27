# Mobiliti Dashboard – Arbeits- und Speicherschutz

Diese Regeln gelten fuer das gesamte Repository. Auf diesem Windows-Host laufen mehrere Docker-Projekte; fremde Container, Images, Netzwerke und Volumes sind immer zu erhalten.

## Speicher vor Builds pruefen

- Vor einem vollstaendigen Docker-Build den freien Speicher auf dem Systemlaufwerk und den Docker-Build-Cache pruefen.
- Unter 30 GiB freiem Speicher eine Warnung ausgeben.
- Unter 20 GiB keinen vollstaendigen Build starten. Zuerst `scripts/docker-clean.ps1 -Apply` ausfuehren oder den Benutzer informieren.
- Nur betroffene Services bauen. `--no-cache` nur zur konkreten Fehlerdiagnose und nach Hinweis auf den zusaetzlichen Speicherbedarf verwenden.

## Erlaubte Docker-Bereinigung

- Fuer Berichte `scripts/docker-clean.ps1` verwenden.
- Fuer die sichere Bereinigung `scripts/docker-clean.ps1 -Apply` verwenden. Der Build-Cache bleibt standardmaessig auf maximal 10 GiB begrenzt.
- Dangling Images duerfen bereinigt werden. Getaggte Images anderer Projekte bleiben erhalten.
- Nach einer groesseren Build- oder Release-Serie die sichere Bereinigung erneut ausfuehren.

## Verbotene globale Bereinigung

Ohne ausdrueckliche, zielgenaue Freigabe niemals ausfuehren:

- `docker system prune -a`
- `docker image prune -a`
- `docker container prune`
- `docker network prune`
- `docker volume prune`
- `docker compose down -v`

Docker-Volumes koennen Datenbanken und Uploads enthalten. Backups, Releases, Uploads und Projektverzeichnisse werden niemals allein aufgrund ihres Alters geloescht.

## Codex und Worktrees

- Fuer kleine Aenderungen im vorhandenen Checkout arbeiten. Einen Worktree nur fuer echte Isolation oder Parallelentwicklung anlegen.
- Abgeschlossene Worktrees kontrolliert ueber Codex beziehungsweise Git entfernen; niemals `.git` oder unbekannte Arbeitsverzeichnisse manuell loeschen.
- Abhaengigkeiten, Build-Ausgaben und Testartefakte nicht unnoetig in mehreren Worktrees duplizieren.
- Plugins ueber die Plugin-Verwaltung entfernen; den persoenlichen Codex-Cache nicht pauschal loeschen.

## Docker Desktop und VHDX

- Die Docker-VHDX nicht manuell verschieben und nicht auf einen wechselbaren USB-Stick legen.
- Eine Offline-Kompaktierung nur bei vollstaendig gestopptem Docker/WSL und mit Administratorrechten durchfuehren.
- Bei weniger als 30 GiB freiem Speicher oder auffaelligem VHDX-Wachstum zuerst berichten, dann zielgerichtet handeln.
