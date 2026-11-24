#!/bin/bash
# Läuft bei jedem Start vor Datenbank und Web-App (darf mehrfach laufen).
#
# - Legt den Datenordner an und setzt die Rechte – auch wenn /var/lib/pizzaorder
#   ein eigener Proxmox-Datenträger (Mountpoint) ist oder von einem anderen
#   Container übernommen wurde.
# - Erzeugt beim allerersten Start die Konfiguration mit zufälligem
#   Admin-Passwort und JWT-Schlüssel. Sie liegt mit auf dem Datenträger, damit
#   sie beim Umzug auf einen neuen Container erhalten bleibt.
set -euo pipefail

DATA_ROOT=/var/lib/pizzaorder
DB_DIR="$DATA_ROOT/db"
CONF="$DATA_ROOT/pizzaorder.env"
CRED=/root/pizzaorder-zugangsdaten.txt

install -d -m 755 -o root -g root "$DATA_ROOT"
install -d -m 700 -o mongodb -g mongodb "$DB_DIR"
chown mongodb:mongodb "$DB_DIR"
chmod 700 "$DB_DIR"
find "$DB_DIR" -mindepth 1 \( ! -user mongodb -o ! -group mongodb \) -exec chown -h mongodb:mongodb {} +

if [ ! -s "$CONF" ]; then
  umask 077
  password=$(python3 -c 'import secrets; print(secrets.token_urlsafe(15))')
  secret=$(python3 -c 'import secrets; print(secrets.token_hex(32))')

  cat > "$CONF" <<EOF
# Konfiguration der MittwochsPizza-Web-App
# Nach Änderungen:  systemctl restart pizzaorder
ADMIN_PASSWORD=$password
JWT_SECRET=$secret
DB_NAME=pizzaorder
# Adresse, unter der die Seite im Browser aufgerufen wird (für CORS),
# z. B. http://192.168.1.50 oder https://pizza.example.de
CORS_ORIGINS=http://localhost
PORT=80
EOF
  chown root:pizzaorder "$CONF"
  chmod 640 "$CONF"

  cat > "$CRED" <<EOF
MittwochsPizza – Zugangsdaten (beim ersten Start erzeugt)

Bestellseite:  http://<IP dieses Containers>/
Admin-Seite:   http://<IP dieses Containers>/admin
Passwort:      $password

Ändern: ADMIN_PASSWORD in $CONF anpassen,
danach "systemctl restart pizzaorder".
EOF
  chmod 600 "$CRED"
  echo "Neue Konfiguration erzeugt – Zugangsdaten stehen in $CRED"
fi

chown root:pizzaorder "$CONF"
chmod 640 "$CONF"
