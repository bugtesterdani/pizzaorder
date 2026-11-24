# Pizza ordering API regression tests (status window, orders, admin auth, pizzas, settings)
# Plain module-level functions so xdist loadscope keeps them sequential on one worker (shared force_open state).
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"
ADMIN_PW = "c#guru"
DEFAULT_LINK = "https://paypal.me/DEINNAME"

S = requests.Session()
_state = {"orders": [], "pizzas": []}


def _token():
    r = S.post(f"{API}/admin/login", json={"password": ADMIN_PW})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _set_open(h, val, link=DEFAULT_LINK):
    r = S.put(f"{API}/admin/settings", json={"paypal_link": link, "force_open": val}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def h():
    hdr = _token()
    yield hdr
    # cleanup
    for oid in _state["orders"]:
        S.delete(f"{API}/admin/orders/{oid}", headers=hdr)
    for pid in _state["pizzas"]:
        S.delete(f"{API}/admin/pizzas/{pid}", headers=hdr)
    _set_open(hdr, False)


@pytest.fixture(scope="module")
def pizzas():
    r = S.get(f"{API}/pizzas")
    assert r.status_code == 200
    return r.json()


# --- Status / closed window ---
def test_status_closed_tuesday(h):
    _set_open(h, False)
    d = S.get(f"{API}/status").json()
    assert d["open"] is False and d["in_window"] is False and d["force_open"] is False
    assert d["next_open"].startswith("2026-11-25T07:00")


def test_order_forbidden_when_closed(h, pizzas):
    r = S.post(f"{API}/orders", json={"name": "TEST_closed", "items": [{"pizza_id": pizzas[0]["id"], "size": "klein", "quantity": 1}]})
    assert r.status_code == 403
    assert "mittwochs" in r.json()["detail"]


# --- Admin auth ---
def test_login_wrong_pw():
    r = S.post(f"{API}/admin/login", json={"password": "wrong"})
    assert r.status_code == 401


@pytest.mark.parametrize("method,path", [("get", "/admin/orders"), ("get", "/admin/pizzas"), ("get", "/admin/settings"),
                                         ("put", "/admin/settings"), ("post", "/admin/pizzas"),
                                         ("delete", "/admin/orders/x"), ("patch", "/admin/orders/x")])
def test_admin_no_token_401(method, path):
    r = getattr(requests, method)(f"{API}{path}", json={})
    assert r.status_code == 401, f"{method} {path} -> {r.status_code}"


def test_admin_bad_token_401():
    r = requests.get(f"{API}/admin/orders", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401


# --- Settings ---
def test_settings_link_must_be_https(h):
    r = S.put(f"{API}/admin/settings", json={"paypal_link": "http://paypal.me/x", "force_open": False}, headers=h)
    assert r.status_code == 422


def test_settings_update_link_and_public(h):
    d = _set_open(h, False, "https://paypal.me/TESTNAME/")
    assert d["paypal_link"] == "https://paypal.me/TESTNAME"
    assert S.get(f"{API}/settings").json()["paypal_link"] == "https://paypal.me/TESTNAME"
    _set_open(h, False)
    assert S.get(f"{API}/settings").json()["paypal_link"] == DEFAULT_LINK


# --- Orders when force open ---
def test_force_open_and_order_server_prices(h, pizzas):
    _set_open(h, True)
    assert S.get(f"{API}/status").json()["open"] is True
    p0, p1 = pizzas[0], pizzas[1]
    body = {"name": "  TEST_Alice  ", "total": 0.01,
            "items": [{"pizza_id": p0["id"], "size": "gross", "quantity": 2, "unit_price": 0.01},
                      {"pizza_id": p1["id"], "size": "klein", "quantity": 3}]}
    r = S.post(f"{API}/orders", json=body)
    assert r.status_code == 200, r.text
    o = r.json()
    _state["orders"].append(o["id"])
    exp = round(p0["prices"]["gross"] * 2 + p1["prices"]["klein"] * 3, 2)
    assert o["total"] == exp
    assert o["name"] == "TEST_Alice"
    assert o["paid"] is False and isinstance(o["number"], int)
    assert o["items"][0]["unit_price"] == p0["prices"]["gross"]


def test_order_validation(h, pizzas):
    pid = pizzas[0]["id"]
    cases = [
        {"name": "   ", "items": [{"pizza_id": pid, "size": "klein", "quantity": 1}]},
        {"name": "", "items": [{"pizza_id": pid, "size": "klein", "quantity": 1}]},
        {"name": "TEST_x", "items": []},
        {"name": "TEST_x", "items": [{"pizza_id": pid, "size": "xxl", "quantity": 1}]},
        {"name": "TEST_x", "items": [{"pizza_id": pid, "size": "klein", "quantity": 0}]},
        {"name": "TEST_x", "items": [{"pizza_id": pid, "size": "klein", "quantity": 21}]},
    ]
    for c in cases:
        r = S.post(f"{API}/orders", json=c)
        assert r.status_code == 422, f"{c} -> {r.status_code}"
    r = S.post(f"{API}/orders", json={"name": "TEST_x", "items": [{"pizza_id": "nope", "size": "klein", "quantity": 1}]})
    assert r.status_code == 400


def test_admin_orders_list_paid_delete(h, pizzas):
    r = S.get(f"{API}/admin/orders", headers=h)
    assert r.status_code == 200
    oid = _state["orders"][0]
    assert any(o["id"] == oid for o in r.json())
    r = S.patch(f"{API}/admin/orders/{oid}", json={"paid": True}, headers=h)
    assert r.status_code == 200 and r.json()["paid"] is True
    got = [o for o in S.get(f"{API}/admin/orders", headers=h).json() if o["id"] == oid][0]
    assert got["paid"] is True
    assert "_id" not in got
    # delete a fresh order
    o2 = S.post(f"{API}/orders", json={"name": "TEST_Del", "items": [{"pizza_id": pizzas[0]["id"], "size": "mittel", "quantity": 1}]}).json()
    assert S.delete(f"{API}/admin/orders/{o2['id']}", headers=h).status_code == 200
    assert S.delete(f"{API}/admin/orders/{o2['id']}", headers=h).status_code == 404
    assert S.patch(f"{API}/admin/orders/nope", json={"paid": True}, headers=h).status_code == 404


def test_admin_orders_other_date_empty(h):
    r = S.get(f"{API}/admin/orders", params={"date": "2000-01-01"}, headers=h)
    assert r.status_code == 200 and r.json() == []


# --- Pizzas CRUD ---
def test_pizza_crud_and_visibility(h, pizzas):
    body = {"name": "TEST_Diavola", "description": "scharf", "image_url": "/pizzas/salami.jpg",
            "prices": {"klein": 9, "mittel": 11, "gross": 14}, "active": True}
    r = S.post(f"{API}/admin/pizzas", json=body, headers=h)
    assert r.status_code == 200, r.text
    p = r.json()
    _state["pizzas"].append(p["id"])
    assert any(x["id"] == p["id"] for x in S.get(f"{API}/pizzas").json())
    body["prices"]["mittel"] = 12.5
    body["active"] = False
    r = S.put(f"{API}/admin/pizzas/{p['id']}", json=body, headers=h)
    assert r.status_code == 200 and r.json()["prices"]["mittel"] == 12.5 and r.json()["active"] is False
    assert not any(x["id"] == p["id"] for x in S.get(f"{API}/pizzas").json())
    # hidden pizza cannot be ordered
    r = S.post(f"{API}/orders", json={"name": "TEST_h", "items": [{"pizza_id": p["id"], "size": "klein", "quantity": 1}]})
    assert r.status_code == 400
    assert any(x["id"] == p["id"] for x in S.get(f"{API}/admin/pizzas", headers=h).json())


def test_pizza_validation(h):
    bad = [{"name": "", "prices": {"klein": 1, "mittel": 1, "gross": 1}},
           {"name": "TEST_x", "prices": {"klein": 1, "mittel": 1}},
           {"name": "TEST_x", "prices": {"klein": 0, "mittel": 1, "gross": 1}}]
    for b in bad:
        assert S.post(f"{API}/admin/pizzas", json=b, headers=h).status_code == 422
    assert S.put(f"{API}/admin/pizzas/nope", json={"name": "TEST_x", "prices": {"klein": 1, "mittel": 1, "gross": 1}}, headers=h).status_code == 404


def test_zz_restore_closed(h):
    _set_open(h, False)
    assert S.get(f"{API}/status").json()["open"] is False
