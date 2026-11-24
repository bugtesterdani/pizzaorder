import { useState } from "react";
import { LogOut } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Header } from "@/components/Header";
import { getToken, setToken } from "@/lib/api";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { OrdersPanel } from "@/components/admin/OrdersPanel";
import { PizzasPanel } from "@/components/admin/PizzasPanel";
import { SettingsPanel } from "@/components/admin/SettingsPanel";

export default function AdminPage() {
  const [token, setTok] = useState(getToken());
  const login = (t) => { setToken(t); setTok(t); };
  const logout = () => { setToken(null); setTok(null); };

  if (!token) return <main><Header /><AdminLogin onLogin={login} /></main>;

  const logoutBtn = (
    <button onClick={logout} data-testid="admin-logout-button"
      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
      <LogOut className="h-4 w-4" /> Abmelden
    </button>
  );
  return (
    <main>
      <Header right={logoutBtn} />
      <section className="relative z-10 mx-auto max-w-5xl px-5 pb-20 sm:px-8" data-testid="admin-dashboard">
        <Tabs defaultValue="orders">
          <TabsList className="rounded-full">
            <TabsTrigger value="orders" className="rounded-full" data-testid="admin-tab-orders">Bestellungen</TabsTrigger>
            <TabsTrigger value="pizzas" className="rounded-full" data-testid="admin-tab-pizzas">Pizzas</TabsTrigger>
            <TabsTrigger value="settings" className="rounded-full" data-testid="admin-tab-settings">Einstellungen</TabsTrigger>
          </TabsList>
          <TabsContent value="orders"><OrdersPanel onAuthError={logout} /></TabsContent>
          <TabsContent value="pizzas"><PizzasPanel onAuthError={logout} /></TabsContent>
          <TabsContent value="settings"><SettingsPanel onAuthError={logout} /></TabsContent>
        </Tabs>
      </section>
    </main>
  );
}
