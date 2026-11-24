#!/usr/bin/env bash
# Startet das Docker-Image (ein Container, Daten im Volume) mit denselben
# Härtungs-Optionen wie in DOCKER.md und prüft:
#   1. Start, Seite und API
#   2. Neustart: sauberes Herunterfahren, Daten bleiben im Volume
#   3. Unsichere Passwörter werden abgelehnt
#
# Aufruf: ci/docker-smoke-test.sh [IMAGE]
set -euo pipefail

IMAGE=${1:-pizzaorder:latest}
HERE=$(cd "$(dirname "$0")" && pwd)
NAME=pizzaorder-smoketest
VOLUME=pizzaorder-smoketest-data
PORT=18080
PASSWORD=$(openssl rand -hex 12)
SECRET=$(openssl rand -hex 32)

annotate() {
  local level=$1 title=$2 msg=$3
  msg=${msg//'%'/'%25'}; msg=${msg//$'\r'/}; msg=${msg//$'\n'/'%0A'}
  echo "::${level} title=${title}::${msg}"
}

fail() {
  local logs
  local all logs
  all=$(docker logs "$NAME" 2>&1 || true)
  echo "$all" | tail -n 200
  # MongoDB loggt sehr viel – für die Annotation nur die aussagekräftigen Zeilen
  logs=$(grep -vE '^\{"t":' <<<"$all" | tail -n 40)
  annotate error "Docker-Test" "$1"$'\n'"--- docker logs (ohne MongoDB-JSON)"$'\n'"$logs"
  exit 1
}

cleanup() {
  docker rm -f -v "$NAME" "$NAME-weak" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

run() { # NAME ADMIN_PASSWORT
  docker run -d --name "$1" \
    -p "127.0.0.1:${PORT}:8000" \
    -v "$VOLUME:/data/db" \
    -e ADMIN_PASSWORD="$2" -e JWT_SECRET="$SECRET" -e DB_NAME=pizzaorder \
    --read-only --tmpfs /tmp:size=16m,noexec,nosuid \
    --cap-drop ALL --security-opt no-new-privileges \
    --memory 1g --pids-limit 512 --stop-timeout 30 \
    "$IMAGE" >/dev/null
}

echo "==> Start"
run "$NAME" "$PASSWORD"
python3 "$HERE/api_check.py" "http://127.0.0.1:${PORT}" "$PASSWORD" || fail "API-Prüfung (Start) fehlgeschlagen"

echo "==> Neustart"
docker restart "$NAME" >/dev/null
# Logs erst einlesen: "docker logs | grep -q" bricht die Pipe ab (pipefail)
logs=$(docker logs "$NAME" 2>&1)
grep -q "Beende MongoDB" <<<"$logs" || fail "MongoDB wurde beim Stoppen nicht sauber beendet"
python3 "$HERE/api_check.py" "http://127.0.0.1:${PORT}" "$PASSWORD" --persist || fail "API-Prüfung (Neustart) fehlgeschlagen"

echo "==> Stoppen"
docker stop "$NAME" >/dev/null
code=$(docker inspect -f '{{.State.ExitCode}}' "$NAME")
[ "$code" = 0 ] || fail "Exit-Code nach docker stop: $code (erwartet 0)"
docker rm "$NAME" >/dev/null

echo "==> Unsicheres Passwort"
docker run -d --name "$NAME-weak" -e ADMIN_PASSWORD=bitte-aendern -e JWT_SECRET="$SECRET" \
  --read-only --tmpfs /tmp --cap-drop ALL "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Running}}' "$NAME-weak")" = false ] && break
  sleep 2
done
[ "$(docker inspect -f '{{.State.Running}}' "$NAME-weak")" = false ] || NAME="$NAME-weak" fail "Container mit unsicherem Passwort läuft weiter"
logs=$(docker logs "$NAME-weak" 2>&1)
grep -q "Unsichere Konfiguration" <<<"$logs" || NAME="$NAME-weak" fail "Keine Meldung zu unsicherem Passwort"

SIZE=$(docker image inspect -f '{{.Size}}' "$IMAGE" | awk '{printf "%.0f MB", $1/1024/1024}')
annotate notice "Docker-Image" "Alle Prüfungen bestanden (Image-Größe $SIZE)"
echo "Alle Prüfungen bestanden."
