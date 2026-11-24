# MittwochsPizza – PRD

## Original problem statement
"Baue mir eine Pizza Bestellseite wo man nur auswählt aus bestimmten Pizzas, die Menge, und Größe. Danach sieht man ein festen QR Code zum bezahlen und den gesamt Preis. Namen sollte man auch angeben. Ein Admin Login sollte dann die heutigen Bestellungen sehen können und es darf nur mittwochs von 7-10.30 bestellt werden"

User choices: no user accounts; admin password login ("c#guru"); QR from PayPal.me link (admin setting); sample pizzas editable in admin; outside window only a notice.

## Architecture
- FastAPI (server.py) + MongoDB (pizzas, orders, settings, counters); Europe/Berlin window check server-side; JWT (HS256, 12h) for admin, password in env ADMIN_PASSWORD.
- React: / (OrderPage: menu/closed notice/checkout/confirmation with QRCodeSVG), /admin (login, Bestellungen, Pizzas, Einstellungen).

## Personas
- Gast (mobile): orders Wednesday morning, pays via PayPal QR.
- Admin/Organisator: sees today's orders, kitchen summary, paid status, manages pizzas & PayPal link.

## Implemented (2026-11-24)
- Pizza menu with size Klein/Mittel/Groß + quantity, cart, name required, server-side pricing
- Confirmation with fixed PayPal QR + total + "In PayPal öffnen" link (amount prefilled)
- Order window Wed 07:00–10:30 Berlin, closed notice with countdown; admin "force open" toggle for testing
- Admin: today's orders (date picker), KPIs, kitchen summary, paid toggle, delete; pizza CRUD; PayPal link settings
- Atomic per-day order numbers

## Backlog
- P1: Real PayPal.me link must be set by owner (placeholder https://paypal.me/DEINNAME)
- P2: Print view for kitchen, CSV export
