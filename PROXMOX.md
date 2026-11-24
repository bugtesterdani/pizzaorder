# MittwochsPizza als Proxmox-Container (LXC)

Zu jedem Release baut GitHub automatisch ein fertiges **CT-Template**
(`pizzaorder_<version>_amd64.tar.zst`) und hängt es an das Release an.
Daraus legst du in Proxmox einen normalen, unprivilegierten Container an –
ohne Docker.

Im Container (Debian 12) laufen per systemd:

| Dienst | Aufgabe |
|--------|---------|
| `pizzaorder-setup` | bei jedem Start: Datenordner prüfen; beim ersten Start Passwort + Schlüssel erzeugen |
| `pizzaorder-db` | MongoDB 8.0, nur innerhalb des Containers erreichbar |
| `pizzaorder` | Web-App auf **Port 80** (läuft als eigener Nutzer, nicht als root) |

Alle Daten liegen unter **`/var/lib/pizzaorder`** – am besten auf einem
eigenen Proxmox-Datenträger (Mountpoint), damit sie unabhängig vom Container
sind:

```
/var/lib/pizzaorder/
├── db/                 MongoDB-Dateien
└── pizzaorder.env      Admin-Passwort, JWT-Schlüssel, Einstellungen
```

## 1. Release erstellen (einmalig pro Version)

Auf GitHub unter **Releases → Draft a new release** einen Tag wie `v1.0.0`
anlegen und **Publish release** klicken – oder per CLI:

```bash
gh release create v1.0.0 --generate-notes
```

Nach etwa 10–15 Minuten hängen am Release die Dateien
`pizzaorder_1.0.0_amd64.tar.zst` und `.sha256`. Vorher wird das Template
automatisch gebootet und getestet; schlägt der Test fehl, wird nichts angehängt.

## 2. Template nach Proxmox bringen

Das Repo ist privat, deshalb das Template im Browser (eingeloggt) vom Release
herunterladen und in Proxmox hochladen:
**Rechenzentrum → dein Node → `local` → CT-Vorlagen → Hochladen**.

Alternativ direkt auf dem Proxmox-Host (mit installiertem und angemeldetem `gh`):

```bash
gh release download v1.0.0 -R bugtesterdani/pizzaorder -p 'pizzaorder_*' -D /var/lib/vz/template/cache/
cd /var/lib/vz/template/cache && sha256sum -c pizzaorder_1.0.0_amd64.tar.zst.sha256
```

## 3. Container anlegen

**Per Oberfläche:** „Erstelle CT“ → *Unprivilegierter Container* angehakt
lassen → Template `pizzaorder_…` wählen → Disk 4 GB → 1 CPU-Kern →
1024 MB RAM → Netzwerk (DHCP oder feste IP) → **noch nicht starten**.
Dann unter **Ressourcen → Hinzufügen → Einhängepunkt**: Pfad
`/var/lib/pizzaorder`, Größe z. B. 2 GB, *Backup* angehakt. Jetzt starten.

**Per Shell auf dem Proxmox-Host** (ID, Storage und Bridge anpassen):

```bash
pct create 120 local:vztmpl/pizzaorder_1.0.0_amd64.tar.zst \
  --hostname pizzaorder --ostype debian --unprivileged 1 \
  --cores 1 --memory 1024 --swap 512 \
  --rootfs local-lvm:4 \
  --mp0 local-lvm:2,mp=/var/lib/pizzaorder,backup=1 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --onboot 1
pct start 120
```

## 4. Zugangsdaten abholen

Beim ersten Start werden ein zufälliges Admin-Passwort und ein JWT-Schlüssel
erzeugt:

```bash
pct exec 120 -- cat /root/pizzaorder-zugangsdaten.txt
```

Seite: `http://<IP-des-Containers>/` · Admin: `http://<IP-des-Containers>/admin`
– dort unter **Einstellungen** den PayPal.me-Link eintragen.

Passwort ändern oder die Adresse für CORS setzen:

```bash
pct enter 120
nano /var/lib/pizzaorder/pizzaorder.env    # ADMIN_PASSWORD, CORS_ORIGINS
systemctl restart pizzaorder
```

## Alltag

```bash
pct enter 120                                  # Shell im Container
systemctl status pizzaorder pizzaorder-db      # Status
journalctl -u pizzaorder -u pizzaorder-db -f   # Logs
mongodump --archive --db pizzaorder > /var/lib/pizzaorder/backup.archive   # Backup
```

Proxmox-Backups (vzdump) sichern den Einhängepunkt mit, solange dort *Backup*
angehakt ist. Debian-Sicherheitsupdates spielt der Container automatisch ein
(`unattended-upgrades`).

## Update auf eine neue Version

Weil alle Daten und die Konfiguration auf dem eigenen Datenträger liegen,
wird nicht im Container aktualisiert, sondern einfach umgezogen:

1. Neues Template hochladen und daraus einen neuen Container anlegen
   (z. B. ID 121) – **ohne** eigenen Einhängepunkt, noch nicht starten.
2. Alten Container stoppen: `pct stop 120`
3. Datenträger umhängen:
   `pct move-volume 120 mp0 --target-vmid 121 --target-volume mp0`
   (in der Oberfläche: beim alten Container *Ressourcen → Einhängepunkt →
   Volume Action → Reassign Owner*)
4. Neuen Container starten: `pct start 121` – Passwort, Bestellungen und
   Einstellungen sind übernommen. Läuft alles, den alten Container löschen.

## Sicherheit

- **Netz trennen:** Den Container am besten in ein eigenes VLAN bzw. eine
  eigene Bridge hängen (Netzwerk-Einstellung *VLAN-Tag*) und in der
  Proxmox-Firewall des Containers eingehend nur TCP 80 erlauben und ausgehende
  Verbindungen ins Heimnetz (z. B. `192.168.0.0/16`) sperren.
- **HTTPS:** Das Template spricht nur HTTP. Wird die Seite aus dem Internet
  erreichbar, einen Reverse-Proxy mit Zertifikat davorsetzen (z. B. Caddy oder
  Nginx Proxy Manager in einem eigenen Container), sonst geht das
  Admin-Passwort im Klartext übers Netz.
- **Unprivilegiert lassen:** Der Container braucht weder *Nesting* noch
  andere Sonderfunktionen.
- **CPU:** MongoDB braucht AVX. Fast alle Proxmox-Hosts haben das; sehr alte
  oder sparsame CPUs (z. B. Celeron J4105/J4125) nicht. Dann meldet
  `journalctl -u pizzaorder-db` das deutlich.

## Template selbst bauen

Auf jedem Linux-Rechner mit Docker, auch direkt auf dem Proxmox-Host:

```bash
sudo lxc/build-template.sh 1.0.0 dist        # → dist/pizzaorder_1.0.0_amd64.tar.zst
sudo ci/lxc-smoke-test.sh dist/pizzaorder_1.0.0_amd64.tar.zst   # optionaler Boot-Test
```

| Datei | Zweck |
|-------|-------|
| `lxc/Dockerfile` | Baut das Debian-Dateisystem (Frontend, Python, MongoDB, systemd-Units) |
| `lxc/rootfs/` | Dateien, die ins Template kopiert werden (Units, `setup.sh`, MongoDB-Konfiguration) |
| `lxc/build-template.sh` | Exportiert das Dateisystem und packt es als `.tar.zst` |
| `ci/lxc-smoke-test.sh` | Bootet das Template unprivilegiert mit `systemd-nspawn` und prüft es |
| `.github/workflows/proxmox-template.yml` | Baut, testet und hängt das Template an Releases |
