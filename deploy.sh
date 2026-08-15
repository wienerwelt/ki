#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
if [[ "$SCRIPT_DIR" == "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR='.'
fi

ROOT_DIR="$(cd "$SCRIPT_DIR" && pwd)"
ARCHIVE_INPUT="${1:-}"
DEPLOY_DIR="$ROOT_DIR/.deploy"
CURRENT_RELEASE_FILE="$DEPLOY_DIR/current-release"
STAGING_DIR=''
BACKUP_HOST_PATH=''
BACKUP_PARTIAL_HOST_PATH=''
COMPOSE=(
  docker compose
  -f "$ROOT_DIR/docker-compose.yml"
  -f "$ROOT_DIR/docker-compose.prod.yml"
)

cd "$ROOT_DIR"

if [[ -z "$ARCHIVE_INPUT" ]]; then
  echo "Verwendung: bash ./deploy.sh <release-archiv.tar.gz>"
  echo "Beispiel:   bash ./deploy.sh .deploy/incoming/mobiliti-dashboard-v2026.08.15.2.tar.gz"
  exit 2
fi

if [[ ! -f "$ROOT_DIR/.mobiliti-dashboard-root" ]] || \
   [[ "$(<"$ROOT_DIR/.mobiliti-dashboard-root")" != 'mobiliti-dashboard' ]]; then
  echo "Abbruch: .mobiliti-dashboard-root fehlt oder ist ungültig."
  echo "deploy.sh muss im Root des mobiliti-Dashboard-Projekts liegen."
  exit 2
fi

for command_name in npm docker curl tar sha256sum rsync realpath mktemp grep date chmod; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Fehlendes Programm auf dem Server: $command_name"
    exit 2
  fi
done

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Abbruch: Die produktive .env fehlt im Projekt-Root."
  exit 2
fi

if [[ ! -f "$ARCHIVE_INPUT" ]]; then
  echo "Release-Archiv nicht gefunden: $ARCHIVE_INPUT"
  exit 2
fi

ARCHIVE_PATH="$(realpath "$ARCHIVE_INPUT")"
ARCHIVE_FILE="${ARCHIVE_PATH##*/}"
ARCHIVE_DIR="${ARCHIVE_PATH%/*}"
CHECKSUM_FILE="$ARCHIVE_PATH.sha256"

if [[ ! "$ARCHIVE_FILE" =~ ^mobiliti-dashboard-(v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+)\.tar\.gz$ ]]; then
  echo "Ungültiger Archivname: $ARCHIVE_FILE"
  echo "Erwartet: mobiliti-dashboard-vYYYY.MM.DD.N.tar.gz"
  exit 2
fi

RELEASE_NAME="${BASH_REMATCH[1]}"
PREVIOUS_RELEASE=''
if [[ -f "$CURRENT_RELEASE_FILE" ]]; then
  IFS= read -r PREVIOUS_RELEASE < "$CURRENT_RELEASE_FILE" || true
fi

cleanup() {
  if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
    rm -rf -- "$STAGING_DIR"
  fi
  if [[ -n "$BACKUP_PARTIAL_HOST_PATH" && -f "$BACKUP_PARTIAL_HOST_PATH" ]]; then
    rm -f -- "$BACKUP_PARTIAL_HOST_PATH"
  fi
}

on_error() {
  local exit_code=$?
  set +e
  echo
  echo "Deployment von $RELEASE_NAME fehlgeschlagen."
  "${COMPOSE[@]}" ps
  if [[ -n "$BACKUP_HOST_PATH" && -s "$BACKUP_HOST_PATH" ]]; then
    echo "Geprüftes Datenbank-Backup: $BACKUP_HOST_PATH"
  fi
  if [[ -n "$PREVIOUS_RELEASE" ]]; then
    echo "Code-Rollback: Archiv von $PREVIOUS_RELEASE erneut deployen."
  fi
  echo "Nicht blind wiederholen. Zuerst RELEASE.md, Abschnitt Fehlerfall, verwenden."
  exit "$exit_code"
}

trap cleanup EXIT
trap on_error ERR

echo "[1/9] Release-Prüfsumme kontrollieren"
if [[ ! -f "$CHECKSUM_FILE" ]]; then
  echo "Prüfsummendatei fehlt: $CHECKSUM_FILE"
  exit 2
fi
(
  cd "$ARCHIVE_DIR"
  sha256sum --check "${ARCHIVE_FILE}.sha256"
)

echo "[2/9] Release-Inhalt prüfen und sicher entpacken"
ARCHIVE_CONTENTS="$(tar -tzf "$ARCHIVE_PATH")"
if printf '%s\n' "$ARCHIVE_CONTENTS" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "Abbruch: Das Archiv enthält einen unsicheren Pfad."
  exit 2
fi
if printf '%s\n' "$ARCHIVE_CONTENTS" | grep -Eq '(^|/)(\.env($|\.)|backups/|node_modules/|frontend/dist/|\.git/)'; then
  echo "Abbruch: Das Archiv enthält Secrets, Backups oder Laufzeitdateien."
  exit 2
fi

mkdir -p "$DEPLOY_DIR"
STAGING_DIR="$(mktemp -d "$DEPLOY_DIR/staging.XXXXXX")"
# mktemp erstellt Verzeichnisse absichtlich mit 0700. Da rsync -a auch die
# Rechte des Quell-Roots übernimmt, muss der Staging-Root vor dem Kopieren
# dieselben Rechte wie der produktive Projekt-Root erhalten. Andernfalls kann
# Nginx nach dem Deployment das Frontend nicht mehr lesen.
chmod --reference="$ROOT_DIR" "$STAGING_DIR"
tar -xzf "$ARCHIVE_PATH" -C "$STAGING_DIR"

for required_file in \
  .mobiliti-dashboard-root \
  deploy.sh \
  RELEASE.md \
  docker-compose.yml \
  docker-compose.prod.yml \
  backend/package-lock.json \
  frontend/package-lock.json; do
  if [[ ! -f "$STAGING_DIR/$required_file" ]]; then
    echo "Ungültiges Release: $required_file fehlt."
    exit 2
  fi
done

echo "[3/9] Produktionsdatenbank sichern und Backup prüfen"
"${COMPOSE[@]}" config --quiet
mkdir -p "$ROOT_DIR/backups"
"${COMPOSE[@]}" up -d postgres

DB_INFO="$("${COMPOSE[@]}" run --rm --no-deps -T api node -e \
  "const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.username+'\\t'+u.pathname.slice(1))")"
IFS=$'\t' read -r RELEASE_DB_USER RELEASE_DB_NAME <<< "$DB_INFO"
if [[ -z "$RELEASE_DB_USER" || -z "$RELEASE_DB_NAME" ]]; then
  echo "Datenbank-Benutzer oder -Name konnten nicht aus DATABASE_URL ermittelt werden."
  exit 2
fi

BACKUP_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_NAME="pre-${RELEASE_NAME}-${BACKUP_STAMP}.dump"
BACKUP_CONTAINER_PATH="/backups/$BACKUP_NAME"
BACKUP_PARTIAL_CONTAINER_PATH="/backups/.${BACKUP_NAME}.partial"
BACKUP_HOST_PATH="$ROOT_DIR/backups/$BACKUP_NAME"
BACKUP_PARTIAL_HOST_PATH="$ROOT_DIR/backups/.${BACKUP_NAME}.partial"

if [[ -e "$BACKUP_HOST_PATH" || -e "$BACKUP_HOST_PATH.sha256" ]]; then
  echo "Abbruch: Backup-Datei existiert bereits: $BACKUP_HOST_PATH"
  exit 2
fi

"${COMPOSE[@]}" exec -T postgres \
  pg_dump -U "$RELEASE_DB_USER" -d "$RELEASE_DB_NAME" -Fc -f "$BACKUP_PARTIAL_CONTAINER_PATH"
"${COMPOSE[@]}" exec -T postgres \
  pg_restore --list "$BACKUP_PARTIAL_CONTAINER_PATH" >/dev/null
"${COMPOSE[@]}" exec -T postgres \
  mv "$BACKUP_PARTIAL_CONTAINER_PATH" "$BACKUP_CONTAINER_PATH"

if [[ ! -s "$BACKUP_HOST_PATH" ]]; then
  echo "Abbruch: Das Datenbank-Backup fehlt oder ist leer: $BACKUP_HOST_PATH"
  exit 2
fi

(
  cd "$ROOT_DIR/backups"
  sha256sum "$BACKUP_NAME" > "$BACKUP_NAME.sha256"
)
BACKUP_PARTIAL_HOST_PATH=''
echo "Geprüftes Backup: $BACKUP_HOST_PATH"

echo "[4/9] Anwendungscode aktualisieren"
rsync -a --delete \
  --exclude='.deploy/' \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='backups/' \
  --exclude='docker-data/' \
  --exclude='logs/' \
  --exclude='pids/' \
  --exclude='pg-rescue/' \
  --exclude='releases/' \
  --exclude='sql/' \
  --exclude='*.log' \
  --exclude='*.pid' \
  --exclude='backend/node_modules/' \
  --exclude='frontend/node_modules/' \
  --exclude='frontend/dist/' \
  --exclude='backend/public/directory_logos/' \
  --exclude='backend/public/logos/' \
  --exclude='backend/public/social-media/' \
  --exclude='backend/public/grafiken/' \
  "$STAGING_DIR/" "$ROOT_DIR/"

# Diese Verzeichnisse enthalten sowohl ausgelieferte Assets als auch
# Laufzeit-Uploads. Neue Release-Dateien werden ergänzt, bestehende Uploads
# aber niemals durch das Deployment gelöscht.
for public_dir in directory_logos logos social-media grafiken; do
  source_dir="$STAGING_DIR/backend/public/$public_dir"
  target_dir="$ROOT_DIR/backend/public/$public_dir"
  if [[ -d "$source_dir" ]]; then
    mkdir -p "$target_dir"
    rsync -a "$source_dir/" "$target_dir/"
  fi
done

echo "[5/9] Frontend reproduzierbar bauen"
npm --prefix frontend ci
npm --prefix frontend run build:dashboard

echo "[6/9] Docker-Konfiguration prüfen und Images bauen"
"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" build

echo "[7/9] Offene Datenbankmigrationen anwenden"
"${COMPOSE[@]}" run --rm -T api npm run migrate

echo "[8/9] Services aktualisieren"
"${COMPOSE[@]}" up -d --remove-orphans

echo "[9/9] API-Healthcheck abwarten"
healthy=false
for _ in {1..20}; do
  if curl --fail --silent "http://127.0.0.1:5001/api/health" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 3
done

if [[ "$healthy" != true ]]; then
  echo "Healthcheck nach 60 Sekunden weiterhin fehlgeschlagen."
  "${COMPOSE[@]}" logs --tail=100 api
  exit 1
fi

printf '%s\n' "$RELEASE_NAME" > "$CURRENT_RELEASE_FILE.tmp"
mv -f "$CURRENT_RELEASE_FILE.tmp" "$CURRENT_RELEASE_FILE"

trap - ERR

echo "Release $RELEASE_NAME ist live."
echo "Datenbank-Backup: $BACKUP_HOST_PATH"
