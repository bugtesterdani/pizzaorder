# MittwochsPizza mit Docker betreiben

Das Setup besteht aus zwei Containern (plus optional einem dritten):

| Container | Aufgabe | Nach außen erreichbar |
|-----------|---------|-----------------------|
| `app`     | FastAPI-Backend + fertig gebautes React-Frontend auf **einem** Port | ja, Port 8080 (änderbar) |
| `mongo`   | MongoDB mit den Bestellungen, Pizzen und Einstellungen | nein – eigenes Netz ohne Internet |
| `caddy`   | *optional:* HTTPS mit automatischem Let's-Encrypt-Zertifikat | Port 80/443 |

## 1. VM vorbereiten

Auf der VM (z. B. Debian/Ubuntu) Docker Engine mit Compose-Plugin installieren:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # danach einmal ab- und wieder anmelden
```

> **CPU-Hinweis:** MongoDB ab 5.0 braucht die CPU-Erweiterung **AVX**. Manche
> VirtualBox-Setups (besonders mit aktivem Hyper-V unter Windows) reichen AVX
> nicht durch. Prüfen mit `grep -o avx /proc/cpuinfo | head -1`. Kommt nichts
> zurück, in der `.env` `MONGO_VERSION=4.4` setzen (läuft, bekommt aber keine
> Sicherheitsupdates mehr) – besser ist, AVX für die VM verfügbar zu machen.

## 2. Projekt holen und konfigurieren

```bash
git clone https://github.com/bugtesterdani/pizzaorder.git
cd pizzaorder
cp env.example .env
openssl rand -hex 32          # Ausgabe als JWT_SECRET in .env eintragen
nano .env                     # ADMIN_PASSWORD, JWT_SECRET, PUBLIC_URL setzen
```

Der Container startet absichtlich **nicht**, wenn `ADMIN_PASSWORD` ein Platzhalter,
das alte Passwort aus der Entwicklung oder kürzer als 12 Zeichen ist bzw.
`JWT_SECRET` kürzer als 32 Zeichen.

## 3. Starten

```bash
docker compose up -d --build
docker compose ps             # beide Container sollten "healthy" sein
```

Seite: `http://<IP-der-VM>:8080` · Admin: `http://<IP-der-VM>:8080/admin`

Beim ersten Start legt das Backend die Beispiel-Pizzen an. Danach im Admin unter
**Einstellungen** den echten PayPal.me-Link eintragen.

## HTTPS (empfohlen, sobald die Seite aus dem Internet erreichbar ist)

Ohne HTTPS geht das Admin-Passwort im Klartext übers Netz. Wenn du eine Domain
hast, die auf deine öffentliche IP zeigt, und Port 80 + 443 zur VM weitergeleitet
sind:

```bash
# in .env:
DOMAIN=pizza.deinedomain.de
PUBLIC_URL=https://pizza.deinedomain.de
HTTP_PORT=127.0.0.1:8080      # App nur noch über Caddy erreichbar

docker compose --profile https up -d --build
```

## Alltag

```bash
# Update nach Änderungen im Repo
git pull && docker compose up -d --build     # bei HTTPS: --profile https

# Logs ansehen
docker compose logs -f app

# Backup der Datenbank
docker compose exec -T mongo mongodump --archive --db pizzaorder > backup-$(date +%F).archive

# Backup zurückspielen (überschreibt die vorhandenen Daten!)
docker compose exec -T mongo mongorestore --archive --drop < backup-2026-11-24.archive

# Stoppen (Daten bleiben im Volume erhalten)
docker compose down
```

## Was das Setup absichert

- **Kleines Image:** Node und der Quellcode des Frontends sind nur im Build-Schritt
  vorhanden. Im fertigen Image liegen nur Python, 9 direkt benötigte Pakete
  (`docker/requirements.txt`), `server.py` und die statischen Dateien. Die vielen
  ungenutzten Pakete aus `backend/requirements.txt` (pandas, boto3, …) fehlen.
- **Aktuelle Versionen:** FastAPI/Starlette sind auf aktuellem Stand (die
  Version aus Emergent hatte bekannte Lücken in Starlette).
- **Kein root:** `app` läuft als Nutzer `app` (UID 10001), `mongo` als UID 999.
- **Minimale Rechte:** alle Linux-Capabilities entzogen, `no-new-privileges`,
  Dateisystem von `app` schreibgeschützt, Speicher- und Prozesslimits.
- **Datenbank isoliert:** MongoDB hängt in einem internen Docker-Netz ohne
  Internetzugang und ohne veröffentlichten Port.
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
  zu neue Basis-Images holen:
  `docker compose build --pull && docker compose pull mongo && docker compose up -d`
- **Login-Versuche:** Der Admin-Login hat noch keine Begrenzung gegen
  Durchprobieren – deshalb ein langes Passwort verwenden.
- **Google Fonts:** Schriften werden von Google geladen. Für eine öffentliche
  Seite in Deutschland gilt das datenschutzrechtlich als heikel; besser wäre,
  die Schriften lokal mitzuliefern.

## Dateien

| Datei | Zweck |
|-------|-------|
| `Dockerfile` | Zweistufiger Build (Frontend bauen → schlankes Python-Image) |
| `docker-compose.yml` | App, MongoDB, optional Caddy, inkl. Härtung |
| `env.example` | Vorlage für `.env` |
| `docker/main.py` | Startet die unveränderte `backend/server.py` und liefert das Frontend aus |
| `docker/requirements.txt` | Minimale Python-Abhängigkeiten |
| `docker/prepare-frontend.mjs` | Entfernt Emergent-Pakete und Tracking vor dem Build |
| `docker/Caddyfile` | HTTPS-Reverse-Proxy |

Die Dateien in `backend/` und `frontend/` bleiben unverändert – du kannst das
Projekt also weiter in Emergent bearbeiten.
