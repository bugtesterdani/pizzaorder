import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, errorText } from "@/lib/api";
import { Header } from "@/components/Header";
import { ClosedNotice } from "@/components/ClosedNotice";
import { PizzaCard } from "@/components/PizzaCard";
import { CartBar } from "@/components/CartBar";
import { CheckoutDialog } from "@/components/CheckoutDialog";
import { Confirmation } from "@/components/Confirmation";

const Menu = ({ pizzas, onAdd, inWindow }) => (
  <section className="relative z-10 mx-auto max-w-5xl px-5 pb-36 sm:px-8">
    <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--basil-soft))] px-3 py-1 text-sm font-semibold text-[hsl(var(--basil))]" data-testid="status-open-badge">
      <span className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--basil))]" /> {inWindow ? "Geöffnet bis 10:30 Uhr" : "Vom Admin freigeschaltet"}
    </span>
    <h1 className="rise mt-5 max-w-2xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
      Such dir deine Mittwochs&shy;pizza aus.
    </h1>
    <p className="mt-4 max-w-lg text-base text-muted-foreground md:text-lg">Sorte, Größe und Menge wählen – danach bezahlst du per QR-Code.</p>
    <div className="mt-10 grid gap-4 lg:grid-cols-2" data-testid="pizza-list">
      {pizzas.map((p, i) => <PizzaCard key={p.id} pizza={p} index={i} onAdd={onAdd} />)}
    </div>
  </section>
);

export default function OrderPage() {
  const [status, setStatus] = useState(null);
  const [pizzas, setPizzas] = useState([]);
  const [paypal, setPaypal] = useState("");
  const [cart, setCart] = useState([]);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState(null);

  useEffect(() => {
    Promise.all([api.get("/status"), api.get("/pizzas"), api.get("/settings")])
      .then(([s, p, st]) => { setStatus(s.data); setPizzas(p.data); setPaypal(st.data.paypal_link); })
      .catch((e) => toast.error(errorText(e)));
  }, []);

  const total = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);
  const count = cart.reduce((s, i) => s + i.quantity, 0);

  const add = (pizza, size, qty) => {
    const key = `${pizza.id}-${size}`;
    setCart((c) => c.some((i) => i.key === key)
      ? c.map((i) => (i.key === key ? { ...i, quantity: Math.min(20, i.quantity + qty) } : i))
      : [...c, { key, pizza_id: pizza.id, name: pizza.name, size, price: pizza.prices[size], quantity: qty }]);
    toast.success(`${qty}× ${pizza.name} im Korb`);
  };
  const setQty = (key, q) => setCart((c) => c.map((i) => (i.key === key ? { ...i, quantity: q } : i)));
  const remove = (key) => setCart((c) => { const n = c.filter((i) => i.key !== key); if (!n.length) setOpen(false); return n; });

  const submit = async (name) => {
    setSubmitting(true);
    try {
      const { data } = await api.post("/orders", { name, items: cart.map(({ pizza_id, size, quantity }) => ({ pizza_id, size, quantity })) });
      setOrder(data); setCart([]); setOpen(false); window.scrollTo(0, 0);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  let body = <div className="p-10 text-center text-muted-foreground" data-testid="order-loading">Lädt …</div>;
  if (order) body = <Confirmation order={order} paypalLink={paypal} onNew={() => setOrder(null)} />;
  else if (status && !status.open) body = <ClosedNotice nextOpen={status.next_open} />;
  else if (status) body = <Menu pizzas={pizzas} onAdd={add} inWindow={status.in_window} />;

  return (
    <main>
      <Header />
      {body}
      {!order && status?.open && (
        <>
          <CartBar count={count} total={total} onOpen={() => setOpen(true)} />
          <CheckoutDialog open={open} onOpenChange={setOpen} cart={cart} total={total} onQty={setQty} onRemove={remove} onSubmit={submit} submitting={submitting} />
        </>
      )}
    </main>
  );
}
