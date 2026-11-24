import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SIZES, money } from "@/lib/format";
import { QtyStepper } from "@/components/QtyStepper";

export const PizzaCard = ({ pizza, onAdd, index }) => {
  const [size, setSize] = useState("mittel");
  const [qty, setQty] = useState(1);
  const add = () => { onAdd(pizza, size, qty); setQty(1); };
  return (
    <article data-testid={`pizza-card-${pizza.id}`} style={{ animationDelay: `${index * 70}ms` }}
      className="rise flex gap-4 rounded-3xl border bg-card p-3 shadow-[0_1px_0_hsl(32_18%_85%),0_12px_30px_-18px_hsl(20_40%_20%/.35)] sm:p-4">
      <img src={pizza.image_url} alt={pizza.name} className="h-28 w-28 shrink-0 rounded-2xl object-cover sm:h-36 sm:w-36" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-xl font-extrabold leading-tight">{pizza.name}</h3>
          <span className="tabular whitespace-nowrap text-lg font-bold text-primary" data-testid={`pizza-price-${pizza.id}`}>{money(pizza.prices[size] * qty)}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{pizza.description}</p>
        <div className="mt-3 inline-flex w-fit rounded-full bg-secondary p-1" role="radiogroup">
          {SIZES.map((s) => (
            <button key={s.key} type="button" role="radio" aria-checked={size === s.key} onClick={() => setSize(s.key)}
              data-testid={`pizza-size-${pizza.id}-${s.key}`}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${size === s.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
              {s.label} <span className="hidden font-normal opacity-70 sm:inline">{s.cm}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <QtyStepper value={qty} onChange={setQty} testId={`pizza-qty-${pizza.id}`} />
          <Button onClick={add} data-testid={`pizza-add-${pizza.id}`} className="h-10 rounded-full px-4 font-semibold transition-transform active:scale-95">
            <Plus className="mr-1 h-4 w-4" /> In den Korb
          </Button>
        </div>
      </div>
    </article>
  );
};
