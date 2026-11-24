import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAdmin } from "@/components/admin/useAdmin";

export const SettingsPanel = ({ onAuthError }) => {
  const run = useAdmin(onAuthError);
  const [s, setS] = useState(null);
  useEffect(() => { run(async (a) => setS((await a.get("/settings")).data)); }, [run]);
  if (!s) return null;
  const save = () => run(async (a) => { setS((await a.put("/settings", s)).data); toast.success("Einstellungen gespeichert"); });
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-[1fr_auto]" data-testid="settings-panel">
      <div className="space-y-6 rounded-2xl border bg-card p-5">
        <h1 className="font-display text-3xl font-extrabold">Einstellungen</h1>
        <div className="space-y-1.5">
          <Label htmlFor="pp">PayPal.me-Link</Label>
          <Input id="pp" value={s.paypal_link} onChange={(e) => setS({ ...s, paypal_link: e.target.value })} placeholder="https://paypal.me/deinname" data-testid="settings-paypal-input" />
          <p className="text-xs text-muted-foreground">Aus diesem Link wird der feste Bezahl-QR-Code erzeugt.</p>
        </div>
        <label className="flex items-start gap-3">
          <Switch checked={s.force_open} onCheckedChange={(v) => setS({ ...s, force_open: v })} data-testid="settings-force-open-switch" />
          <span className="text-sm"><b>Bestellungen jetzt freischalten</b><br /><span className="text-muted-foreground">Öffnet die Bestellung auch außerhalb von Mittwoch 07:00–10:30 Uhr (z. B. zum Testen).</span></span>
        </label>
        <Button onClick={save} className="rounded-full" data-testid="settings-save-button">Speichern</Button>
      </div>
      <div className="flex flex-col items-center rounded-2xl border bg-white p-5" data-testid="settings-qr-preview">
        <QRCodeSVG value={s.paypal_link || " "} size={180} />
        <span className="mt-3 text-xs text-muted-foreground">Vorschau</span>
      </div>
    </div>
  );
};
