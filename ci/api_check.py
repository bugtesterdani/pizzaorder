#!/usr/bin/env python3
"""Prüft eine laufende MittwochsPizza-Instanz über HTTP (nur Standardbibliothek).

Aufruf:
  api_check.py BASIS_URL ADMIN_PASSWORT            Grundfunktionen + Testbestellung
  api_check.py BASIS_URL ADMIN_PASSWORT --persist  prüft nach einem Neustart, ob
                                                   Login und Testbestellung noch da sind
"""
import json
import sys
import time
import urllib.error
import urllib.request

TEST_NAME = "Smoke-Test"


def call(method, url, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(request, timeout=15) as resp:
        raw = resp.read()
        ctype = resp.headers.get("Content-Type", "")
        if "json" in ctype:
            body = json.loads(raw)
        elif ctype.startswith("text/"):
            body = raw.decode("utf-8", errors="replace")
        else:
            body = raw  # z. B. Bilder
        return resp.status, body, resp.headers


def expect_status(code, method, url, data=None):
    try:
        call(method, url, data)
    except urllib.error.HTTPError as err:
        if err.code == code:
            return
        raise AssertionError(f"{method} {url}: erwartet {code}, bekommen {err.code}")
    raise AssertionError(f"{method} {url}: erwartet {code}, bekommen 2xx")


def wait_ready(base, timeout):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            if call("GET", base + "/api/status")[0] == 200:
                return
        except Exception as exc:  # noqa: BLE001
            last = exc
        time.sleep(2)
    raise SystemExit(f"Seite nach {timeout}s nicht erreichbar ({base}): {last}")


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    base, password = sys.argv[1].rstrip("/"), sys.argv[2]
    persist = "--persist" in sys.argv[3:]

    wait_ready(base, timeout=240)

    status, html, headers = call("GET", base + "/")
    assert status == 200 and "<title>MittwochsPizza</title>" in html, "Startseite falsch"
    assert "posthog" not in html.lower() and "emergent.sh" not in html, "Tracking noch enthalten"
    assert headers.get("X-Frame-Options") == "DENY", "Security-Header fehlen"
    assert call("GET", base + "/admin")[0] == 200, "/admin nicht erreichbar"
    assert "swagger" not in call("GET", base + "/docs")[1].lower(), "/docs ist noch offen"
    assert call("GET", base + "/pizzas/salami.jpg")[0] == 200, "Bilder fehlen"

    status, pizzas, _ = call("GET", base + "/api/pizzas")
    assert status == 200 and len(pizzas) == 5, f"erwartet 5 Pizzen, bekommen {len(pizzas)}"

    token = call("POST", base + "/api/admin/login", {"password": password})[1]["token"]
    expect_status(401, "POST", base + "/api/admin/login", {"password": "falsch"})
    expect_status(401, "GET", base + "/api/admin/orders")

    if not persist:
        settings = {"paypal_link": "https://paypal.me/test", "force_open": True}
        call("PUT", base + "/api/admin/settings", settings, token)
        pizza = pizzas[0]
        item = {"pizza_id": pizza["id"], "size": "mittel", "quantity": 2}
        order = call("POST", base + "/api/orders", {"name": TEST_NAME, "items": [item]})[1]
        assert order["total"] == round(pizza["prices"]["mittel"] * 2, 2), "Preis falsch"
        settings["force_open"] = False
        call("PUT", base + "/api/admin/settings", settings, token)

    orders = call("GET", base + "/api/admin/orders", token=token)[1]
    assert any(o["name"] == TEST_NAME for o in orders), "Testbestellung nicht gefunden"

    print(f"OK: {base} ({'nach Neustart' if persist else 'Grundfunktionen'})")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as err:
        raise SystemExit(f"FEHLER: {err}")
