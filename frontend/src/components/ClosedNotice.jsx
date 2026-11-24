import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { berlinDateTime } from "@/lib/format";

const parts = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), min: m % 60 };
};

export const ClosedNotice = ({ nextOpen }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const { d, h, min } = parts(new Date(nextOpen) - now);
  return (
    <section data-testid="closed-notice" className="rise relative z-10 mx-auto max-w-5xl px-5 pb-20 pt-6 sm:px-8 sm:pt-14">
      <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(9_70%_94%)] px-3 py-1 text-sm font-semibold text-[hsl(9_60%_35%)]">
        <Clock className="h-3.5 w-3.5" /> Gerade geschlossen
      </span>
      <h1 className="mt-6 max-w-2xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
        Bestellt wird nur mittwochs, 07:00 – 10:30 Uhr.
      </h1>
      <p className="mt-5 max-w-lg text-base text-muted-foreground md:text-lg" data-testid="closed-next-open">
        Nächstes Bestellfenster: {berlinDateTime(nextOpen, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}, 07:00 Uhr
      </p>
      <div className="mt-10 flex gap-3" data-testid="closed-countdown">
        {[[d, "Tage"], [h, "Std."], [min, "Min."]].map(([v, l]) => (
          <div key={l} className="w-24 rounded-2xl border bg-card px-4 py-4 shadow-sm">
            <div className="tabular font-display text-3xl font-extrabold">{v}</div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>
    </section>
  );
};
