import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QtyStepper } from "@/components/QtyStepper";
import { money, sizeLabel } from "@/lib/format";

export const CheckoutDialog = ({ open, onOpenChange, cart, total, onQty, onRemove, onSubmit, submitting }) => {
  const [name, setName] = useState(localStorage.getItem("pizza_name") || "");
  const [error, setError] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Bitte gib deinen Namen an."); return; }
    localStorage.setItem("pizza_name", name.trim());
    onSubmit(name.trim());
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg" data-testid="checkout-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-extrabold">Dein Warenkorb</DialogTitle>
          <DialogDescription>Prüfe deine Auswahl und gib deinen Namen an.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y">
          {cart.map((it) => (
            <li key={it.key} className="flex items-center gap-3 py-3" data-testid={`cart-item-${it.key}`}>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{it.name}</div>
                <div className="text-sm text-muted-foreground">{sizeLabel(it.size)} · {money(it.price)}</div>
              </div>
              <QtyStepper value={it.quantity} onChange={(q) => onQty(it.key, q)} testId={`cart-qty-${it.key}`} />
              <button onClick={() => onRemove(it.key)} aria-label="Entfernen" data-testid={`cart-remove-${it.key}`}
                className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Dein Name</Label>
            <Input id="name" value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setError(""); }}
              placeholder="z. B. Max Mustermann" className="h-12 rounded-xl" data-testid="checkout-name-input" />
            {error && <p className="text-sm text-destructive" data-testid="checkout-name-error">{error}</p>}
          </div>
          <div className="flex items-baseline justify-between rounded-2xl bg-secondary px-4 py-3">
            <span className="font-medium">Gesamt</span>
            <span className="tabular font-display text-2xl font-extrabold" data-testid="checkout-total">{money(total)}</span>
          </div>
          <Button type="submit" disabled={submitting || !cart.length} data-testid="checkout-submit-button"
            className="h-12 w-full rounded-full text-base font-semibold">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Verbindlich bestellen
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
