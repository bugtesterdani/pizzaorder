# MittwochsPizza – Produktions-Image (alles in einem Container)
# Stufe 1 baut das React-Frontend. Stufe 2 enthält Python + FastAPI, MongoDB und
# die fertigen statischen Dateien. Node, Quellcode und Build-Werkzeuge landen
# nicht im finalen Image. Die Datenbank-Dateien liegen im Volume /data/db.

ARG NODE_VERSION=22
ARG PYTHON_VERSION=3.13
ARG MONGO_MAJOR=8.0

# ---------- Stufe 1: Frontend bauen ----------
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
# COPY hat package.json und index.html wieder überschrieben -> erneut bereinigen
RUN APP_TITLE="${APP_TITLE}" node /tmp/prepare-frontend.mjs

# Leere Backend-URL => das Frontend ruft relativ /api auf (gleicher Server).
ENV REACT_APP_BACKEND_URL="" \
    GENERATE_SOURCEMAP=false \
    DISABLE_EMERGENT_OVERLAY=true \
    ENABLE_HEALTH_CHECK=false \
    CI=false
RUN NODE_ENV=production yarn build


# ---------- Stufe 2: Laufzeit ----------
# Debian 12 (bookworm), weil MongoDB dafür offizielle Pakete anbietet.
FROM python:${PYTHON_VERSION}-slim-bookworm AS runtime
ARG MONGO_MAJOR

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    STATIC_DIR=/app/static \
    DB_PATH=/data/db \
    TZ=Europe/Berlin

# MongoDB-Server und Backup-Werkzeuge (mongodump/mongorestore) aus dem
# offiziellen MongoDB-Repository, tini als schlanker Init-Prozess.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg tini \
 && curl -fsSL "https://pgp.mongodb.com/server-${MONGO_MAJOR}.asc" \
      | gpg --dearmor -o /usr/share/keyrings/mongodb-server.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/mongodb-server.gpg] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/${MONGO_MAJOR} main" \
      > /etc/apt/sources.list.d/mongodb-org.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends mongodb-org-server mongodb-database-tools \
 && apt-get purge -y --auto-remove curl gnupg \
 && rm -rf /var/lib/apt/lists/* /var/log/mongodb /var/lib/mongodb

WORKDIR /app

COPY docker/requirements.txt /tmp/requirements.txt
RUN pip install --no-compile -r /tmp/requirements.txt \
 && rm /tmp/requirements.txt \
 && groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app \
 && mkdir -p /data/db \
 && chown app:app /data/db \
 && chmod 700 /data/db

COPY --chown=root:root --chmod=755 docker/entrypoint.sh ./entrypoint.sh
COPY --chown=root:root backend/server.py docker/main.py ./
COPY --chown=root:root --from=frontend /build/build ./static

# Datenbank-Dateien gehören in ein eigenes Docker-Volume.
VOLUME ["/data/db"]

# Läuft als unprivilegierter Nutzer; Code und Dateien gehören root und sind
# für den App-Nutzer nur lesbar. Schreiben darf er nur in /data/db.
USER app

EXPOSE 8000

# /api/status liest aus der Datenbank -> prüft Web-App und MongoDB zugleich.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/status', timeout=4).status == 200 else 1)"]

STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
