# MittwochsPizza mit Docker betreiben

Alles läuft in **einem** Container: die Web-App (FastAPI + fertig gebautes
React-Frontend) und die MongoDB-Datenbank. Die Daten liegen in einem eigenen
Docker-Volume namens **`pizzaorder-data`** – sie bleiben also erhalten, wenn der
Container gelöscht, neu gebaut oder aktualisiert wird.

> Für Proxmox gibt es zusätzlich ein fertiges CT-Template ohne Docker –
> siehe [PROXMOX.md](PROXMOX.md).

```
┌──────────────── Container "pizzaorder" ───────────────┐
│  tini → entrypoint.sh                                 │
│          ├─ mongod   (nur 127.0.0.1, nicht von außen) │──► Volume pizzaorder-data (/data/db)
│          └─ uvicorn  (Web-App + API, Port 8000)       │──► Port 8080 auf der VM
└───────────────────────────────────────────────────────┘
```

Stürzt einer der beiden Prozesse ab, beendet das Start-Skript den anderen
sauber und Docker startet den Container neu. Bei `docker stop` wird zuerst die
Web-App und dann MongoDB ordentlich heruntergefahren.

## 1. VM vorbereiten

Auf der VM (z. B. Debian/Ubuntu) Docker installieren:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # danach einmal ab- und wieder anmelden
```

> **CPU-Hinweis (wichtig bei VirtualBox):** MongoDB braucht die
> CPU-Erweiterung **AVX**. Prüfen mit `grep -o -m1 avx /proc/cpuinfo`.
> Kommt nichts zurück, startet der Container nicht und meldet das im Log.
> Unter Windows liegt das meist daran, dass Hyper-V/„Speicherintegrität“ aktiv
> ist und VirtualBox dann AVX nicht an die VM weitergibt.

## 2. Projekt holen und konfigurieren

```bash
git clone https://github.com/bugtesterdani/pizzaorder.git
cd pizzaorder
cp env.example .env
openssl rand -hex 32          # Ausgabe als JWT_SECRET in .env eintragen
nano .env                     # ADMIN_PASSWORD, JWT_SECRET, CORS_ORIGINS setzen
```

Der Container startet absichtlich **nicht**, wenn `ADMIN_PASSWORD` ein Platzhalter,
das alte Passwort aus der Entwicklung oder kürzer als 12 Zeichen ist bzw.
`JWT_SECRET` kürzer als 32 Zeichen.

## 3. Starten

### Variante A: mit Docker Compose (empfohlen)

```bash
docker compose up -d --build
docker compose ps             # Status sollte nach ~1 Minute "healthy" sein
```

### Variante B: nur mit `docker`

```bash
docker build -t pizzaorder .
docker volume create pizzaorder-data
docker run -d --name pizzaorder --restart unless-stopped \
  -p 8080:8000 \
  -v pizzaorder-data:/data/db \
  --env-file .env \
  --read-only --tmpfs /tmp:size=16m,noexec,nosuid \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 1g --pids-limit 512 --stop-timeout 30 \
  pizzaorder
```

Seite: `http://<IP-der-VM>:8080` · Admin: `http://<IP-der-VM>:8080/admin`

Beim ersten Start legt das Backend die Beispiel-Pizzen an. Danach im Admin unter
**Einstellungen** den echten PayPal.me-Link eintragen.

## HTTPS (empfohlen, sobald die Seite aus dem Internet erreichbar ist)

Ohne HTTPS geht das Admin-Passwort im Klartext übers Netz. Wenn du eine Domain
hast, die auf deine öffentliche IP zeigt, und Port 80 + 443 zur VM weitergeleitet
sind, startet dieses Profil zusätzlich einen kleinen Caddy-Container, der das
Zertifikat automatisch holt:

```bash
# in .env:
DOMAIN=pizza.deinedomain.de
CORS_ORIGINS=https://pizza.deinedomain.de
HTTP_PORT=127.0.0.1:8080      # App nur noch über Caddy erreichbar

docker compose --profile https up -d --build
```

## Alltag

```bash
# Update nach Änderungen im Repo (Daten im Volume bleiben erhalten)
git pull && docker compose up -d --build     # bei HTTPS: --profile https

# Logs ansehen (Web-App und MongoDB zusammen)
docker logs -f pizzaorder

# Backup im laufenden Betrieb
docker exec pizzaorder mongodump --archive --db pizzaorder > backup-$(date +%F).archive

# Backup zurückspielen (überschreibt die vorhandenen Daten!)
docker exec -i pizzaorder mongorestore --archive --drop < backup-2026-11-24.archive

# Stoppen (Daten bleiben im Volume)
docker compose down

# Alles inklusive Daten löschen – Vorsicht, nicht rückgängig zu machen!
docker compose down && docker volume rm pizzaorder-data
```

## Umstieg vom alten Zwei-Container-Setup

Falls du die erste Version (getrennter `mongo`-Container) schon laufen hattest,
die Daten **vor** dem `git pull` sichern und danach einspielen:

```bash
docker compose exec -T mongo mongodump --archive --db pizzaorder > umzug.archive
docker compose down --remove-orphans
git pull
docker compose up -d --build
# warten, bis "docker compose ps" healthy zeigt, dann:
docker exec -i pizzaorder mongorestore --archive --drop < umzug.archive
```

Die alten Volumes (`pizzaorder_mongo-data`, `pizzaorder_mongo-config`) kannst du
danach mit `docker volume rm` entfernen.

## Was das Setup absichert

- **Kleines Image:** Node und der Quellcode des Frontends sind nur im Build-Schritt
  vorhanden. Im fertigen Image liegen Python mit 9 direkt benötigten Paketen
  (`docker/requirements.txt`), der MongoDB-Server samt Backup-Werkzeugen,
  `server.py` und die statischen Dateien.
- **Aktuelle Versionen:** FastAPI/Starlette auf aktuellem Stand, MongoDB 8.0 aus
  dem offiziellen Repository.
- **Datenbank nicht erreichbar:** MongoDB lauscht nur innerhalb des Containers
  auf `127.0.0.1`; nach außen ist nur der Web-Port offen.
- **Kein root:** Web-App und MongoDB laufen als Nutzer `app` (UID 10001).
  Schreiben darf er nur ins Daten-Volume, der Rest des Dateisystems ist
  schreibgeschützt.
- **Minimale Rechte:** alle Linux-Capabilities entzogen, `no-new-privileges`,
  Speicher- und Prozesslimits.
- **Kein Tracking:** Das Emergent-Skript und das PostHog-Session-Recording aus
  `index.html` werden beim Build entfernt. Swagger (`/docs`) ist abgeschaltet.
- **Security-Header** (nosniff, kein Einbetten in fremde Seiten, …).

## Was Docker allein nicht abdeckt

Docker trennt die App vom Rest der VM, aber die VM steht trotzdem in deinem
Netz. Damit ein Angreifer auch nach einem Ausbruch nicht ins Heimnetz kommt:

- **VM vom Heimnetz trennen:** VM in ein eigenes Netz hängen (Gast-Netz, VLAN
  oder DMZ am Router) und im Router Verbindungen *von* der VM *ins* Heimnetz
  sperren. Aus dem Internet nur den einen Port (443, bzw. 8080) zur VM freigeben.
- **Achtung bei `ufw`:** Von Docker veröffentlichte Ports umgehen `ufw`-Regeln.
  Was nicht erreichbar sein soll, über `HTTP_PORT=127.0.0.1:…` binden oder am
  Router/Hypervisor filtern.
- **VM aktuell halten:** z. B. `sudo apt install unattended-upgrades`, und ab und
  zu das Image mit neuen Basis-Paketen neu bauen:
  `docker compose build --pull --no-cache && docker compose up -d`
- **Login-Versuche:** Der Admin-Login hat noch keine Begrenzung gegen
  Durchprobieren – deshalb ein langes Passwort verwenden.
- **Google Fonts:** Schriften werden von Google geladen. Für eine öffentliche
  Seite in Deutschland gilt das datenschutzrechtlich als heikel; besser wäre,
  die Schriften lokal mitzuliefern.

## Dateien

| Datei | Zweck |
|-------|-------|
| `Dockerfile` | Zweistufiger Build (Frontend bauen → Python + MongoDB in einem Image) |
| `docker/entrypoint.sh` | Startet MongoDB und Web-App, überwacht beide, fährt sauber herunter |
| `docker-compose.yml` | Ein Dienst + Volume `pizzaorder-data`, optional Caddy für HTTPS |
| `env.example` | Vorlage für `.env` |
| `docker/main.py` | Startet die unveränderte `backend/server.py` und liefert das Frontend aus |
| `docker/requirements.txt` | Minimale Python-Abhängigkeiten |
| `docker/prepare-frontend.mjs` | Entfernt Emergent-Pakete und Tracking vor dem Build |
| `docker/Caddyfile` | HTTPS-Reverse-Proxy (nur mit `--profile https`) |

Die Dateien in `backend/` und `frontend/` bleiben unverändert – du kannst das
Projekt also weiter in Emergent bearbeiten.
