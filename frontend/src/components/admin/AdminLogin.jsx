import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorText } from "@/lib/api";

export const AdminLogin = ({ onLogin }) => {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const { data } = await api.post("/admin/login", { password: pw });
      onLogin(data.token);
    } catch (ex) {
      setErr(errorText(ex));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rise relative z-10 mx-auto max-w-sm px-5 pt-10">
      <form onSubmit={submit} className="rounded-3xl border bg-card p-7 shadow-sm" data-testid="admin-login-form">
        <h1 className="font-display text-3xl font-extrabold">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">Melde dich an, um die heutigen Bestellungen zu sehen.</p>
        <Label htmlFor="pw" className="mt-6 block">Passwort</Label>
        <div className="relative mt-1.5">
          <Input id="pw" type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)}
            className="h-12 rounded-xl pr-12" data-testid="admin-login-password-input" autoFocus />
          <button type="button" onClick={() => setShow(!show)} aria-label="Passwort anzeigen" data-testid="admin-login-toggle-visibility"
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {err && <p className="mt-2 text-sm text-destructive" data-testid="admin-login-error">{err}</p>}
        <Button type="submit" disabled={busy || !pw} className="mt-5 h-12 w-full rounded-full font-semibold" data-testid="admin-login-submit-button">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Anmelden
        </Button>
      </form>
    </section>
  );
};
