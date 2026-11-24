"""Produktions-Einstiegspunkt für den Docker-Container.

Lädt die unveränderte FastAPI-App aus backend/server.py und liefert zusätzlich
das gebaute React-Frontend aus. Dadurch läuft alles über einen einzigen Port
und Frontend und API teilen sich denselben Origin (keine CORS-Probleme).
"""
import os
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse


def _check_secrets() -> None:
    """Startet nicht mit Platzhaltern oder zu schwachen Geheimnissen."""
    weak = {"bitte-aendern", "bitte-mit-openssl-rand-hex-32-erzeugen", "c#guru"}
    password = os.environ.get("ADMIN_PASSWORD", "")
    secret = os.environ.get("JWT_SECRET", "")
    problems = []
    if password in weak or len(password) < 12:
        problems.append("ADMIN_PASSWORD ist ein Platzhalter/bekannt oder kürzer als 12 Zeichen")
    if secret in weak or len(secret) < 32:
        problems.append("JWT_SECRET ist kürzer als 32 Zeichen (openssl rand -hex 32)")
    if problems:
        raise SystemExit("Unsichere Konfiguration in .env: " + "; ".join(problems))


_check_secrets()

from server import app  # noqa: E402  (backend/server.py)

STATIC_DIR = Path(os.environ.get("STATIC_DIR", "/app/static")).resolve()
INDEX_HTML = STATIC_DIR / "index.html"

# Swagger-UI / OpenAPI-Schema im Betrieb nicht öffentlich anbieten.
_HIDDEN = {"/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json"}
app.router.routes = [r for r in app.router.routes if getattr(r, "path", None) not in _HIDDEN]

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for key, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(key, value)
    path = request.url.path
    if path.startswith("/static/"):
        # Dateinamen enthalten einen Hash -> dürfen lange gecacht werden.
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif not path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-cache")
    return response


@app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
async def frontend(full_path: str):
    # Unbekannte API-Pfade sollen ein echtes 404 liefern, nicht die React-Seite.
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(404, "Not Found")
    if full_path:
        candidate = (STATIC_DIR / full_path).resolve()
        # Schutz gegen Path-Traversal: nur Dateien innerhalb von STATIC_DIR.
        if candidate.is_file() and STATIC_DIR in candidate.parents:
            return FileResponse(candidate)
    # Alles andere (/, /admin, ...) übernimmt der React-Router.
    return FileResponse(INDEX_HTML)
