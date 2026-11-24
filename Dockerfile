# MittwochsPizza – Produktions-Image
# Stufe 1 baut das React-Frontend, Stufe 2 enthält nur Python + FastAPI + die
# fertigen statischen Dateien. Node, Quellcode und Build-Werkzeuge landen nicht
# im finalen Image.

ARG NODE_VERSION=22
ARG PYTHON_VERSION=3.13

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
FROM python:${PYTHON_VERSION}-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    STATIC_DIR=/app/static \
    TZ=Europe/Berlin

WORKDIR /app

COPY docker/requirements.txt /tmp/requirements.txt
RUN pip install --no-compile -r /tmp/requirements.txt \
 && rm /tmp/requirements.txt \
 && groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app

COPY --chown=root:root backend/server.py docker/main.py ./
COPY --chown=root:root --from=frontend /build/build ./static

# Läuft als unprivilegierter Nutzer; Code und Dateien gehören root und sind
# für den App-Nutzer nur lesbar.
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/status', timeout=4).status == 200 else 1)"]

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
