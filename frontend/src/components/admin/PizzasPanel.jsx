import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SIZES } from "@/lib/format";
import { useAdmin } from "@/components/admin/useAdmin";

const EMPTY = { name: "", description: "", image_url: "/pizzas/margherita.jpg", prices: { klein: 8, mittel: 10, gross: 12 }, active: true };

const PizzaRow = ({ pizza, onSave, onDelete }) => {
  const [p, setP] = useState(pizza);
  const id = pizza.id || "new";
  const setPrice = (k, v) => setP({ ...p, prices: { ...p.prices, [k]: v } });
  const save = () => onSave({ ...p, prices: Object.fromEntries(SIZES.map((s) => [s.key, parseFloat(String(p.prices[s.key]).replace(",", "."))])) });
  return (
    <div className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-[1fr_auto]" data-testid={`admin-pizza-${id}`}>
      <div className="space-y-2">
        <Input value={p.name} placeholder="Name" onChange={(e) => setP({ ...p, name: e.target.value })} data-testid={`admin-pizza-name-${id}`} />
        <Input value={p.description} placeholder="Zutaten" onChange={(e) => setP({ ...p, description: e.target.value })} data-testid={`admin-pizza-desc-${id}`} />
        <Input value={p.image_url} placeholder="Bild-URL" onChange={(e) => setP({ ...p, image_url: e.target.value })} data-testid={`admin-pizza-image-${id}`} />
        <div className="grid grid-cols-3 gap-2">
          {SIZES.map((s) => (
            <label key={s.key} className="text-xs font-medium text-muted-foreground">{s.label} (€)
              <Input inputMode="decimal" value={p.prices[s.key]} onChange={(e) => setPrice(s.key, e.target.value)} className="mt-1" data-testid={`admin-pizza-price-${id}-${s.key}`} />
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 md:flex-col md:items-end md:justify-between">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={p.active} onCheckedChange={(v) => setP({ ...p, active: v })} data-testid={`admin-pizza-active-${id}`} /> Sichtbar
        </label>
        <div className="flex gap-2">
          {pizza.id && <Button variant="ghost" size="icon" onClick={() => onDelete(pizza)} data-testid={`admin-pizza-delete-${id}`}><Trash2 className="h-4 w-4" /></Button>}
          <Button onClick={save} className="rounded-full" data-testid={`admin-pizza-save-${id}`}>{pizza.id ? "Speichern" : "Hinzufügen"}</Button>
        </div>
      </div>
    </div>
  );
};

export const PizzasPanel = ({ onAuthError }) => {
  const run = useAdmin(onAuthError);
  const [pizzas, setPizzas] = useState([]);
  const [adding, setAdding] = useState(false);
  const load = () => run(async (a) => setPizzas((await a.get("/pizzas")).data));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (p) => run(async (a) => {
    const body = { name: p.name, description: p.description, image_url: p.image_url, prices: p.prices, active: p.active };
    if (p.id) await a.put(`/pizzas/${p.id}`, body); else { await a.post("/pizzas", body); setAdding(false); }
    toast.success("Gespeichert"); load();
  });
  const del = (p) => window.confirm(`${p.name} löschen?`) && run(async (a) => { await a.delete(`/pizzas/${p.id}`); load(); });

  return (
    <div className="mt-6 space-y-4" data-testid="pizzas-panel">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Pizzas & Preise</h1>
        {!adding && <Button onClick={() => setAdding(true)} className="rounded-full" data-testid="admin-pizza-add-button"><Plus className="mr-1 h-4 w-4" /> Neue Pizza</Button>}
      </div>
      {adding && <PizzaRow pizza={EMPTY} onSave={save} />}
      {pizzas.map((p) => <PizzaRow key={p.id + JSON.stringify(p)} pizza={p} onSave={save} onDelete={del} />)}
    </div>
  );
};
