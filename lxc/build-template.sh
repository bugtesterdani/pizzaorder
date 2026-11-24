#!/usr/bin/env bash
# Baut das Proxmox-CT-Template (LXC) als .tar.zst.
#
# Aufruf (auf einem Linux-Rechner mit Docker, auch direkt auf dem Proxmox-Host):
#   sudo lxc/build-template.sh [VERSION] [AUSGABEORDNER]
#
# Ergebnis: AUSGABEORDNER/pizzaorder_VERSION_amd64.tar.zst (+ .sha256)
set -euo pipefail

VERSION="${1:-dev}"
OUT_DIR="${2:-dist}"
IMAGE="pizzaorder-lxc:build"
NAME="pizzaorder_${VERSION}_amd64.tar.zst"

cd "$(dirname "$0")/.."

if [ "$(id -u)" -ne 0 ]; then
  echo "Bitte als root bzw. mit sudo ausführen (Dateirechte im Archiv)." >&2
  exit 1
fi
for tool in docker tar zstd; do
  command -v "$tool" >/dev/null || { echo "Fehlt: $tool" >&2; exit 1; }
done

WORK=$(mktemp -d /var/tmp/pizzaorder-build.XXXXXX)
ROOTFS="$WORK/rootfs"
cid=""
cleanup() {
  [ -n "$cid" ] && docker rm -f "$cid" >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "==> Dateisystem bauen (lxc/Dockerfile)"
docker build -f lxc/Dockerfile -t "$IMAGE" .

echo "==> Exportieren"
cid=$(docker create "$IMAGE" /bin/true)
mkdir -p "$ROOTFS"
docker export "$cid" | tar -xpf - --numeric-owner --xattrs --xattrs-include='*' -C "$ROOTFS"

echo "==> Docker-Reste entfernen, Standarddateien setzen"
rm -f "$ROOTFS/.dockerenv"
# Diese Dateien überschreibt Proxmox beim Anlegen des Containers
echo "pizzaorder" > "$ROOTFS/etc/hostname"
cat > "$ROOTFS/etc/hosts" <<'EOF'
127.0.0.1	localhost
127.0.1.1	pizzaorder
::1		localhost ip6-localhost ip6-loopback
EOF
: > "$ROOTFS/etc/resolv.conf"
cat > "$ROOTFS/etc/network/interfaces" <<'EOF'
auto lo
iface lo inet loopback

source /etc/network/interfaces.d/*
EOF
# Sicherstellen, dass keine Kennung im Template steckt
: > "$ROOTFS/etc/machine-id"
rm -f "$ROOTFS/var/lib/dbus/machine-id"
rm -rf "$ROOTFS"/tmp/* "$ROOTFS"/var/tmp/* "$ROOTFS"/var/log/journal/*

echo "==> Packen: $OUT_DIR/$NAME"
mkdir -p "$OUT_DIR"
tar --numeric-owner --xattrs --xattrs-include='*' -cpf - -C "$ROOTFS" . \
  | zstd -T0 -19 -q > "$OUT_DIR/$NAME"
(cd "$OUT_DIR" && sha256sum "$NAME" > "$NAME.sha256")

ls -lh "$OUT_DIR/$NAME"
echo "Fertig: $OUT_DIR/$NAME"
