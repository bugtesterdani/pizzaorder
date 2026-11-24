import asyncio
import hmac
import logging
import os
import uuid
from contextlib import suppress
from datetime import datetime, timedelta, timezone, time as dtime
from pathlib import Path
from typing import Dict, List, Literal, Optional
from zoneinfo import ZoneInfo

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, field_validator
from pymongo import ASCENDING, DESCENDING, IndexModel
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
ADMIN_PASSWORD = os.environ['ADMIN_PASSWORD']
JWT_SECRET = os.environ['JWT_SECRET']
TZ = ZoneInfo("Europe/Berlin")
OPEN_FROM, OPEN_UNTIL = dtime(7, 0), dtime(10, 30)
WEDNESDAY = 2
Size = Literal["klein", "mittel", "gross"]

INDEXES: dict[str, list[IndexModel]] = {
    "pizzas": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "orders": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("date", ASCENDING), ("created_at", DESCENDING)], name="date_created"),
    ],
}

SEED_PIZZAS = [
    ("Margherita", "Tomatensauce, Mozzarella, Basilikum", "/pizzas/margherita.jpg", 7.5, 9.0, 11.0),
    ("Salami", "Tomatensauce, Mozzarella, Salami", "/pizzas/salami.jpg", 8.5, 10.0, 12.5),
    ("Funghi", "Tomatensauce, Mozzarella, frische Champignons", "/pizzas/funghi.jpg", 8.0, 9.5, 12.0),
    ("Hawaii", "Tomatensauce, Mozzarella, Kochschinken, Ananas", "/pizzas/hawaii.jpg", 9.0, 10.5, 13.0),
    ("Rucola", "Tomatensauce, Mozzarella, Rucola, Parmesan", "/pizzas/rucola.jpg", 9.5, 11.0, 13.5),
]


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logging.getLogger(__name__).error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


async def seed() -> None:
    if await db.pizzas.count_documents({}) == 0:
        for i, (name, desc, img, s, m, l) in enumerate(SEED_PIZZAS):
            await db.pizzas.insert_one(Pizza(
                name=name, description=desc, image_url=img, sort=i,
                prices={"klein": s, "mittel": m, "gross": l},
            ).model_dump())
    if not await db.settings.find_one({"key": "main"}):
        await db.settings.insert_one({"key": "main", "paypal_link": "https://paypal.me/DEINNAME", "force_open": False})


app = FastAPI()
api = APIRouter(prefix="/api")


class Pizza(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    image_url: str = ""
    prices: Dict[Size, float]
    active: bool = True
    sort: int = 0


class PizzaIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str = Field("", max_length=200)
    image_url: str = ""
    prices: Dict[Size, float]
    active: bool = True

    @field_validator("prices")
    @classmethod
    def all_sizes(cls, v):
        if set(v) != {"klein", "mittel", "gross"} or any(p <= 0 for p in v.values()):
            raise ValueError("Preise für Klein, Mittel und Groß müssen größer als 0 sein")
        return v


class OrderItemIn(BaseModel):
    pizza_id: str
    size: Size
    quantity: int = Field(ge=1, le=20)


class OrderIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    items: List[OrderItemIn] = Field(min_length=1, max_length=30)


class OrderItem(BaseModel):
    pizza_id: str
    pizza_name: str
    size: Size
    quantity: int
    unit_price: float
    line_total: float


class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: int
    name: str
    items: List[OrderItem]
    total: float
    paid: bool = False
    date: str
    created_at: str


class SettingsIn(BaseModel):
    paypal_link: str = Field(min_length=8, max_length=200)
    force_open: bool = False


class LoginIn(BaseModel):
    password: str


class PaidIn(BaseModel):
    paid: bool


def now_berlin() -> datetime:
    return datetime.now(TZ)


def in_window(now: datetime) -> bool:
    return now.weekday() == WEDNESDAY and OPEN_FROM <= now.time() < OPEN_UNTIL


def next_open(now: datetime) -> datetime:
    days = (WEDNESDAY - now.weekday()) % 7
    candidate = datetime.combine(now.date() + timedelta(days=days), OPEN_FROM, TZ)
    if candidate <= now:
        candidate += timedelta(days=7)
    return candidate


async def get_settings() -> dict:
    return await db.settings.find_one({"key": "main"}, {"_id": 0, "key": 0})


def require_admin(request: Request) -> None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Nicht angemeldet")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Sitzung abgelaufen")
    if payload.get("role") != "admin":
        raise HTTPException(403, "Kein Zugriff")


@api.get("/status")
async def status():
    now = now_berlin()
    s = await get_settings()
    return {
        "open": in_window(now) or s["force_open"],
        "in_window": in_window(now),
        "force_open": s["force_open"],
        "now": now.isoformat(),
        "closes_at": datetime.combine(now.date(), OPEN_UNTIL, TZ).isoformat(),
        "next_open": next_open(now).isoformat(),
    }


@api.get("/pizzas", response_model=List[Pizza])
async def list_pizzas():
    return await db.pizzas.find({"active": True}, {"_id": 0}).sort("sort", 1).to_list(200)


@api.get("/settings")
async def public_settings():
    s = await get_settings()
    return {"paypal_link": s["paypal_link"]}


@api.post("/orders", response_model=Order)
async def create_order(body: OrderIn):
    now = now_berlin()
    s = await get_settings()
    if not (in_window(now) or s["force_open"]):
        raise HTTPException(403, "Bestellungen sind nur mittwochs von 07:00 bis 10:30 Uhr möglich")
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Bitte gib deinen Namen an")
    ids = list({i.pizza_id for i in body.items})
    pizzas = {p["id"]: p for p in await db.pizzas.find({"id": {"$in": ids}, "active": True}, {"_id": 0}).to_list(100)}
    items = []
    for i in body.items:
        p = pizzas.get(i.pizza_id)
        if not p:
            raise HTTPException(400, "Diese Pizza ist nicht mehr verfügbar")
        unit = p["prices"][i.size]
        items.append(OrderItem(pizza_id=p["id"], pizza_name=p["name"], size=i.size, quantity=i.quantity,
                               unit_price=unit, line_total=round(unit * i.quantity, 2)))
    today = now.date().isoformat()
    number = await db.orders.count_documents({"date": today}) + 1
    order = Order(number=number, name=name, items=items, total=round(sum(x.line_total for x in items), 2),
                  date=today, created_at=datetime.now(timezone.utc).isoformat())
    await db.orders.insert_one(order.model_dump())
    return order


@api.post("/admin/login")
async def admin_login(body: LoginIn):
    if not hmac.compare_digest(body.password.encode(), ADMIN_PASSWORD.encode()):
        raise HTTPException(401, "Falsches Passwort")
    token = jwt.encode({"role": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=12)}, JWT_SECRET, algorithm="HS256")
    return {"token": token}


@api.get("/admin/orders", response_model=List[Order], dependencies=[Depends(require_admin)])
async def admin_orders(date: Optional[str] = None):
    day = date or now_berlin().date().isoformat()
    return await db.orders.find({"date": day}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.patch("/admin/orders/{order_id}", response_model=Order, dependencies=[Depends(require_admin)])
async def set_paid(order_id: str, body: PaidIn):
    doc = await db.orders.find_one_and_update({"id": order_id}, {"$set": {"paid": body.paid}},
                                              projection={"_id": 0}, return_document=True)
    if not doc:
        raise HTTPException(404, "Bestellung nicht gefunden")
    return doc


@api.delete("/admin/orders/{order_id}", dependencies=[Depends(require_admin)])
async def delete_order(order_id: str):
    res = await db.orders.delete_one({"id": order_id})
    if not res.deleted_count:
        raise HTTPException(404, "Bestellung nicht gefunden")
    return {"ok": True}


@api.get("/admin/pizzas", response_model=List[Pizza], dependencies=[Depends(require_admin)])
async def admin_pizzas():
    return await db.pizzas.find({}, {"_id": 0}).sort("sort", 1).to_list(200)


@api.post("/admin/pizzas", response_model=Pizza, dependencies=[Depends(require_admin)])
async def add_pizza(body: PizzaIn):
    pizza = Pizza(**body.model_dump(), sort=await db.pizzas.count_documents({}))
    await db.pizzas.insert_one(pizza.model_dump())
    return pizza


@api.put("/admin/pizzas/{pizza_id}", response_model=Pizza, dependencies=[Depends(require_admin)])
async def update_pizza(pizza_id: str, body: PizzaIn):
    doc = await db.pizzas.find_one_and_update({"id": pizza_id}, {"$set": body.model_dump()},
                                              projection={"_id": 0}, return_document=True)
    if not doc:
        raise HTTPException(404, "Pizza nicht gefunden")
    return doc


@api.delete("/admin/pizzas/{pizza_id}", dependencies=[Depends(require_admin)])
async def delete_pizza(pizza_id: str):
    res = await db.pizzas.delete_one({"id": pizza_id})
    if not res.deleted_count:
        raise HTTPException(404, "Pizza nicht gefunden")
    return {"ok": True}


@api.get("/admin/settings", dependencies=[Depends(require_admin)])
async def admin_settings():
    return await get_settings()


@api.put("/admin/settings", dependencies=[Depends(require_admin)])
async def update_settings(body: SettingsIn):
    link = body.paypal_link.strip().rstrip("/")
    if not link.startswith("https://"):
        raise HTTPException(422, "Der Link muss mit https:// beginnen")
    await db.settings.update_one({"key": "main"}, {"$set": {"paypal_link": link, "force_open": body.force_open}})
    return await get_settings()


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


@app.on_event("startup")
async def startup():
    app.state.index_task = asyncio.create_task(ensure_indexes())
    await seed()


@app.on_event("shutdown")
async def shutdown_db_client():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
