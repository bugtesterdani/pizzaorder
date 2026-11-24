# Root-Dateisystem für das Proxmox-CT-Template (LXC, Debian 12 mit systemd).
#
# Dieses Image wird NICHT als Docker-Container betrieben. lxc/build-template.sh
# baut es, exportiert das Dateisystem und packt es als .tar.zst für Proxmox.
# Im Container laufen dann ganz normal per systemd:
#   pizzaorder-setup.service  Ersteinrichtung (Passwort, Datenordner)
#   pizzaorder-db.service     MongoDB, nur auf 127.0.0.1
#   pizzaorder.service        Web-App auf Port 80

ARG NODE_VERSION=22
ARG MONGO_MAJOR=8.0

# ---------- Stufe 1: Frontend bauen (wie im Haupt-Dockerfile) ----------
FROM node:${NODE_VERSION}-alpine AS frontend
WORKDIR /build

ARG APP_TITLE=MittwochsPizza

COPY frontend/package.json ./
COPY docker/prepare-frontend.mjs /tmp/prepare-frontend.mjs
COPY frontend/public ./public
RUN APP_TITLE="${APP_TITLE}" node /tmp/prepare-frontend.mjs \
 && yarn install --non-interactive --network-timeout 600000 \
 && yarn cache clean

COPY frontend/ ./
RUN APP_TITLE="${APP_TITLE}" node /tmp/prepare-frontend.mjs

ENV REACT_APP_BACKEND_URL="" \
    GENERATE_SOURCEMAP=false \
    DISABLE_EMERGENT_OVERLAY=true \
    ENABLE_HEALTH_CHECK=false \
    CI=false
RUN NODE_ENV=production yarn build


# ---------- Stufe 2: Debian-System für den Container ----------
FROM debian:bookworm AS rootfs
ARG MONGO_MAJOR
ENV DEBIAN_FRONTEND=noninteractive

# Grundsystem für einen Proxmox-Container + Python + MongoDB
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      systemd systemd-sysv dbus \
      ifupdown isc-dhcp-client iproute2 iputils-ping \
      ca-certificates curl gnupg tzdata less nano procps \
      unattended-upgrades \
      python3 python3-venv \
 && curl -fsSL "https://pgp.mongodb.com/server-${MONGO_MAJOR}.asc" \
      | gpg --dearmor -o /usr/share/keyrings/mongodb-server.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/mongodb-server.gpg] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/${MONGO_MAJOR} main" \
      > /etc/apt/sources.list.d/mongodb-org.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends mongodb-org-server mongodb-database-tools \
 && apt-get purge -y --auto-remove gnupg \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Python-Umgebung der App (Debian 12 bringt Python 3.11 mit)
COPY docker/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/pizzaorder/venv \
 && /opt/pizzaorder/venv/bin/pip install --no-cache-dir --no-compile --disable-pip-version-check \
      -r /tmp/requirements.txt \
 && rm /tmp/requirements.txt

# App-Dateien
COPY backend/server.py docker/main.py /opt/pizzaorder/app/
COPY --from=frontend /build/build /opt/pizzaorder/app/static

# systemd-Units, Konfiguration und Einrichtungs-Skript
COPY lxc/rootfs/ /

# - eigener Nutzer für die Web-App
# - unsere Dienste aktivieren, den MongoDB-Standarddienst sperren
#   (pizzaorder-db.service ersetzt ihn)
# - Docker-spezifische apt/dpkg-Einstellungen entfernen
# - leere machine-id: jeder Container erzeugt beim ersten Start seine eigene
RUN useradd --system --home-dir /nonexistent --no-create-home \
      --shell /usr/sbin/nologin pizzaorder \
 && chmod 755 /opt/pizzaorder/setup.sh \
 && install -d -m 755 /var/lib/pizzaorder \
 && systemctl enable pizzaorder-setup.service pizzaorder-db.service pizzaorder.service \
 && systemctl mask mongod.service \
 && rm -f /etc/apt/apt.conf.d/docker-* /etc/dpkg/dpkg.cfg.d/docker-* \
 && : > /etc/machine-id \
 && rm -f /var/lib/dbus/machine-id
