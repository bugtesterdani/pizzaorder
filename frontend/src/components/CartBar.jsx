import { ShoppingBag } from "lucide-react";
import { money } from "@/lib/format";

export const CartBar = ({ count, total, onOpen }) => {
  if (!count) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:pb-6">
      <button onClick={onOpen} data-testid="cart-bar-open-button"
        className="rise mx-auto flex w-full max-w-xl items-center justify-between rounded-full bg-foreground px-6 py-4 text-background shadow-2xl transition-transform hover:-translate-y-0.5 active:scale-[.98]">
        <span className="flex items-center gap-3 font-semibold">
          <ShoppingBag className="h-5 w-5" />
          <span data-testid="cart-bar-count">{count} {count === 1 ? "Pizza" : "Pizzen"}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="tabular text-lg font-bold" data-testid="cart-bar-total">{money(total)}</span>
          <span className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground">Bestellen</span>
        </span>
      </button>
    </div>
  );
};
