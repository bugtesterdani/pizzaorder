#!/usr/bin/env bash
# Bootet das Proxmox-Template mit systemd-nspawn – unprivilegiert und mit eigenem
# Netzwerk, ähnlich wie ein unprivilegierter Proxmox-Container – und prüft:
#   1. Erster Start: Dienste laufen, Zugangsdaten erzeugt, Seite und API ok
#   2. Sauberes Herunterfahren
#   3. Zweiter Start: gleiches Passwort, Daten noch vorhanden
#
# Aufruf: sudo ci/lxc-smoke-test.sh dist/pizzaorder_VERSION_amd64.tar.zst
# Benötigt: systemd-container (systemd-nspawn, machinectl), zstd, python3
set -euo pipefail

TEMPLATE=$(realpath "$1")
HERE=$(cd "$(dirname "$0")" && pwd)
MACHINE=pizzaorder-test
WORK=$(mktemp -d /var/tmp/pizzaorder-test.XXXXXX)
ROOT="$WORK/rootfs"
NSPAWN_PID=""

annotate() { # GitHub-Annotation (mehrzeilig), außerhalb von Actions nur Ausgabe
  local level=$1 title=$2 msg=$3
  msg=${msg//'%'/'%25'}; msg=${msg//$'\r'/}; msg=${msg//$'\n'/'%0A'}
  echo "::${level} title=${title}::${msg}"
}

diagnose() {
  local out
  out=$(
    echo "--- systemctl --failed"; systemctl -M "$MACHINE" --failed --no-legend --no-pager 2>&1 || true
    echo "--- Status"; systemctl -M "$MACHINE" status --no-pager -l pizzaorder-setup pizzaorder-db pizzaorder 2>&1 | tail -n 60 || true
    echo "--- Journal"; journalctl -M "$MACHINE" --no-pager -n 60 -u pizzaorder-setup -u pizzaorder-db -u pizzaorder 2>&1 || true
    echo "--- nspawn"; tail -n 30 "$WORK"/boot*.log 2>/dev/null || true
  )
  echo "$out"
  annotate error "LXC-Boot-Test: Diagnose" "$out"
}

fail() {
  annotate error "LXC-Boot-Test" "$1"
  diagnose
  exit 1
}

cleanup() {
  if [ -n "$NSPAWN_PID" ] && kill -0 "$NSPAWN_PID" 2>/dev/null; then
    machinectl terminate "$MACHINE" 2>/dev/null || kill "$NSPAWN_PID" 2>/dev/null || true
    wait "$NSPAWN_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

boot() {
  systemd-nspawn --quiet --directory="$ROOT" --machine="$MACHINE" \
    --private-users=pick --private-users-ownership=auto \
    --private-network --boot --console=passive > "$WORK/boot$1.log" 2>&1 &
  NSPAWN_PID=$!
  for _ in $(seq 1 60); do
    machinectl show "$MACHINE" >/dev/null 2>&1 && break
    kill -0 "$NSPAWN_PID" 2>/dev/null || fail "systemd-nspawn ist sofort beendet"
    sleep 1
  done
  LEADER=$(machinectl show "$MACHINE" -p Leader --value)
  [ -n "$LEADER" ] || fail "Container nicht registriert"
}

# Befehl im Netzwerk des Containers ausführen (dort lauscht die App auf Port 80)
in_netns() { nsenter --target "$LEADER" --net -- "$@"; }

wait_active() {
  for _ in $(seq 1 120); do
    if systemctl -M "$MACHINE" is-active --quiet pizzaorder-db pizzaorder 2>/dev/null; then
      return 0
    fi
    kill -0 "$NSPAWN_PID" 2>/dev/null || fail "Container ist abgestürzt"
    sleep 2
  done
  fail "Dienste nicht aktiv nach 240 Sekunden"
}

shutdown_machine() {
  machinectl poweroff "$MACHINE"
  for _ in $(seq 1 90); do
    kill -0 "$NSPAWN_PID" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$NSPAWN_PID" 2>/dev/null; then
    fail "Container fährt nicht innerhalb von 90 Sekunden herunter"
  fi
  wait "$NSPAWN_PID" || true
  NSPAWN_PID=""
}

echo "==> Template entpacken"
mkdir -p "$ROOT"
zstd -dc "$TEMPLATE" | tar -xpf - --numeric-owner --xattrs --xattrs-include='*' -C "$ROOT"
[ -s "$ROOT/etc/machine-id" ] && fail "machine-id ist im Template nicht leer"
[ -e "$ROOT/.dockerenv" ] && fail ".dockerenv ist noch im Template"

echo "==> Erster Start"
boot 1
wait_active
CRED="$ROOT/root/pizzaorder-zugangsdaten.txt"
[ -s "$CRED" ] || fail "Zugangsdaten-Datei wurde nicht erzeugt"
PASSWORD=$(awk '/^Passwort:/ {print $2}' "$CRED")
[ "${#PASSWORD}" -ge 12 ] || fail "Erzeugtes Passwort zu kurz"
in_netns python3 "$HERE/api_check.py" http://127.0.0.1 "$PASSWORD" || fail "API-Prüfung (erster Start) fehlgeschlagen"

for unit in pizzaorder-db pizzaorder; do
  user=$(systemctl -M "$MACHINE" show -p User --value "$unit")
  [ -n "$user" ] && [ "$user" != root ] || fail "$unit läuft als root"
done
FAILED=$(systemctl -M "$MACHINE" --failed --no-legend --no-pager | awk '{print $2}' | tr '\n' ' ')
[ -n "$FAILED" ] && annotate warning "LXC-Boot-Test" "Fehlgeschlagene Units im Test-Container (außerhalb von Proxmox evtl. normal): $FAILED"

echo "==> Herunterfahren"
shutdown_machine

echo "==> Zweiter Start"
boot 2
wait_active
[ "$(awk '/^Passwort:/ {print $2}' "$CRED")" = "$PASSWORD" ] || fail "Passwort hat sich beim Neustart geändert"
in_netns python3 "$HERE/api_check.py" http://127.0.0.1 "$PASSWORD" --persist || fail "API-Prüfung (Neustart) fehlgeschlagen"
shutdown_machine

SIZE=$(du -h "$TEMPLATE" | cut -f1)
annotate notice "Proxmox-Template" "Boot-Test bestanden ($(basename "$TEMPLATE"), $SIZE)"
echo "Alle Prüfungen bestanden."
