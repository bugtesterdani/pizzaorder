#!/usr/bin/env bash
# Startet MongoDB und die Web-App gemeinsam in einem Container.
#
# - MongoDB lauscht nur auf 127.0.0.1 und ist von außen nicht erreichbar.
# - Endet einer der beiden Prozesse, wird der andere sauber beendet und der
#   Container stoppt; Docker startet ihn über die restart-Policy neu.
# - Bei "docker stop" wird zuerst die Web-App, dann MongoDB sauber beendet.
set -uo pipefail

DB_PATH="${DB_PATH:-/data/db}"
MONGO_PORT=27017
CACHE_GB="${MONGO_CACHE_GB:-0.25}"
APP_PID=""

log() { echo "[entrypoint] $*" >&2; }

if ! grep -qw avx /proc/cpuinfo; then
  log "FEHLER: Die CPU meldet kein AVX – MongoDB ab Version 5 startet ohne AVX nicht."
  log "        AVX für die VM freigeben (siehe DOCKER.md) und den Container neu starten."
  exit 1
fi

if [ ! -w "$DB_PATH" ]; then
  log "FEHLER: $DB_PATH ist nicht beschreibbar. Ist das Volume korrekt eingebunden?"
  exit 1
fi

stop_all() {
  trap - TERM INT
  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    log "Beende Web-App ..."
    kill -TERM "$APP_PID" 2>/dev/null
    wait "$APP_PID" 2>/dev/null
  fi
  if kill -0 "$MONGO_PID" 2>/dev/null; then
    log "Beende MongoDB ..."
    kill -TERM "$MONGO_PID" 2>/dev/null
    wait "$MONGO_PID" 2>/dev/null
  fi
}

log "Starte MongoDB (Daten in $DB_PATH) ..."
mongod --dbpath "$DB_PATH" --bind_ip 127.0.0.1 --port "$MONGO_PORT" \
  --nounixsocket --quiet --wiredTigerCacheSizeGB "$CACHE_GB" &
MONGO_PID=$!
trap 'log "Stop-Signal erhalten"; stop_all; exit 0' TERM INT

ready=0
for _ in $(seq 1 90); do
  if (exec 3<>"/dev/tcp/127.0.0.1/$MONGO_PORT") 2>/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$MONGO_PID" 2>/dev/null; then
    wait "$MONGO_PID"
    log "FEHLER: MongoDB ist beim Start abgebrochen (Code $?)."
    exit 1
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  log "FEHLER: MongoDB war nach 90 Sekunden nicht erreichbar."
  stop_all
  exit 1
fi

export MONGO_URL="mongodb://127.0.0.1:${MONGO_PORT}"
log "MongoDB bereit, starte Web-App auf Port 8000 ..."
uvicorn main:app --host 0.0.0.0 --port 8000 --no-server-header &
APP_PID=$!

wait -n "$MONGO_PID" "$APP_PID"
code=$?
if kill -0 "$MONGO_PID" 2>/dev/null; then who="Die Web-App"; else who="MongoDB"; fi
log "$who wurde unerwartet beendet (Code $code) – stoppe Container."
stop_all
[ "$code" -eq 0 ] && code=1
exit "$code"
