import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, sizeLabel } from "@/lib/format";

export const Confirmation = ({ order, paypalLink, onNew }) => (
  <section data-testid="order-confirmation" className="rise relative z-10 mx-auto grid max-w-5xl gap-10 px-5 pb-20 pt-4 sm:px-8 md:grid-cols-[1.1fr_1fr] md:pt-10">
    <div>
      <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--basil-soft))] px-3 py-1 text-sm font-semibold text-[hsl(var(--basil))]">
        <CheckCircle2 className="h-4 w-4" /> Bestellung eingegangen
      </span>
      <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
        Danke, <span data-testid="confirmation-name">{order.name}</span>!
      </h1>
      <p className="mt-3 text-muted-foreground">
        Bestellnummer <span className="font-mono text-foreground" data-testid="confirmation-number">#{String(order.number).padStart(3, "0")}</span>. Bitte jetzt per PayPal bezahlen.
      </p>
      <ul className="mt-8 divide-y rounded-2xl border bg-card" data-testid="confirmation-items">
        {order.items.map((it, i) => (
          <li key={i} className="flex justify-between gap-3 px-4 py-3 text-sm">
            <span><b className="tabular">{it.quantity}×</b> {it.pizza_name} <span className="text-muted-foreground">({sizeLabel(it.size)})</span></span>
            <span className="tabular font-semibold">{money(it.line_total)}</span>
          </li>
        ))}
      </ul>
      <Button variant="outline" onClick={onNew} data-testid="confirmation-new-order-button" className="mt-6 rounded-full">
        Weitere Bestellung aufgeben
      </Button>
    </div>
    <div className="flex flex-col items-center rounded-[2rem] bg-foreground p-8 text-background">
      <p className="text-sm font-medium uppercase tracking-widest opacity-70">Zu zahlen</p>
      <p className="tabular mt-1 font-display text-5xl font-extrabold" data-testid="confirmation-total">{money(order.total)}</p>
      <div className="mt-6 rounded-3xl bg-white p-4" data-testid="confirmation-qr">
        <QRCodeSVG value={paypalLink} size={208} level="M" />
      </div>
      <p className="mt-4 text-center text-sm opacity-80">Mit der Handy-Kamera scannen und den Betrag senden.</p>
      <a href={`${paypalLink}/${order.total.toFixed(2)}EUR`} target="_blank" rel="noopener noreferrer" data-testid="confirmation-paypal-link"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">
        In PayPal öffnen <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  </section>
);
