import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { money, sizeLabel, berlinDateTime } from "@/lib/format";
import { useAdmin } from "@/components/admin/useAdmin";

const Kpi = ({ label, value, testId }) => (
  <div className="rounded-2xl border bg-card p-4">
    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="tabular mt-1 font-display text-3xl font-extrabold" data-testid={testId}>{value}</div>
  </div>
);

const todayBerlin = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());

export const OrdersPanel = ({ onAuthError }) => {
  const run = useAdmin(onAuthError);
  const [date, setDate] = useState(todayBerlin());
  const [orders, setOrders] = useState([]);
  const load = useCallback(() => run(async (a) => setOrders((await a.get("/orders", { params: { date } })).data)), [run, date]);
  useEffect(() => { load(); }, [load]);

  const kitchen = useMemo(() => {
    const m = {};
    orders.forEach((o) => o.items.forEach((i) => { const k = `${i.pizza_name} · ${sizeLabel(i.size)}`; m[k] = (m[k] || 0) + i.quantity; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [orders]);
  const total = orders.reduce((s, o) => s + o.total, 0);
  const paidSum = orders.filter((o) => o.paid).reduce((s, o) => s + o.total, 0);
  const pizzaCount = kitchen.reduce((s, [, n]) => s + n, 0);

  const togglePaid = (o) => run(async (a) => {
    const { data } = await a.patch(`/orders/${o.id}`, { paid: !o.paid });
    setOrders((os) => os.map((x) => (x.id === o.id ? data : x)));
  });
  const del = (o) => window.confirm(`Bestellung von ${o.name} löschen?`) && run(async (a) => {
    await a.delete(`/orders/${o.id}`);
    setOrders((os) => os.filter((x) => x.id !== o.id));
  });

  return (
    <div className="mt-6 space-y-6" data-testid="orders-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Bestellungen</h1>
          <p className="text-sm text-muted-foreground">{berlinDateTime(`${date}T12:00:00`, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}</p>
        </div>
        <div className="flex gap-2">
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-10 w-auto rounded-full" data-testid="orders-date-input" />
          <button onClick={load} aria-label="Aktualisieren" data-testid="orders-refresh-button" className="grid h-10 w-10 place-items-center rounded-full border bg-card hover:bg-secondary">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Bestellungen" value={orders.length} testId="kpi-orders" />
        <Kpi label="Pizzen" value={pizzaCount} testId="kpi-pizzas" />
        <Kpi label="Gesamt" value={money(total)} testId="kpi-total" />
        <Kpi label="Bezahlt" value={money(paidSum)} testId="kpi-paid" />
      </div>
      {kitchen.length > 0 && (
        <div className="rounded-2xl bg-foreground p-5 text-background" data-testid="kitchen-summary">
          <div className="text-xs font-medium uppercase tracking-wider opacity-70">Für den Ofen</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {kitchen.map(([k, n]) => <span key={k} className="rounded-full bg-background/10 px-3 py-1.5 text-sm"><b className="tabular">{n}×</b> {k}</span>)}
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border bg-card">
        {orders.length === 0 && <p className="p-8 text-center text-muted-foreground" data-testid="orders-empty">Noch keine Bestellungen an diesem Tag.</p>}
        <ul className="divide-y">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-start gap-4 p-4" data-testid={`order-row-${o.id}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-muted-foreground">#{String(o.number).padStart(3, "0")}</span>
                  <span className="font-semibold">{o.name}</span>
                  <span className="text-xs text-muted-foreground">{berlinDateTime(o.created_at, { hour: "2-digit", minute: "2-digit" })} Uhr</span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {o.items.map((i) => `${i.quantity}× ${i.pizza_name} (${sizeLabel(i.size)})`).join(", ")}
                </div>
              </div>
              <span className="tabular font-bold">{money(o.total)}</span>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={o.paid} onCheckedChange={() => togglePaid(o)} data-testid={`order-paid-switch-${o.id}`} />
                <span className={o.paid ? "font-semibold text-[hsl(var(--basil))]" : "text-muted-foreground"}>{o.paid ? "Bezahlt" : "Offen"}</span>
              </label>
              <button onClick={() => del(o)} aria-label="Löschen" data-testid={`order-delete-${o.id}`} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
