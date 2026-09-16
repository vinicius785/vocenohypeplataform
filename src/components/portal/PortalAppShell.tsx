import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { PortalTopBar } from "./PortalTopBar";
import { PortalSidebar } from "./PortalSidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { collectPendingApprovals } from "./portal-widgets";
import type { PortalContextValue } from "./portal-context";

const COLLAPSED_KEY = "portal:sidebar:collapsed";

/**
 * Shell do Portal do Cliente — volta a usar sidebar (mesmo padrão visual/
 * estrutural do `AppShell.tsx` interno: `w-64`/`md:w-[68px]` recolhida,
 * `border-r border-border bg-background`, item ativo `bg-brand-subtle
 * text-brand`) em vez da topbar+bottom-nav da correção anterior. Mobile
 * vira `Sheet` (drawer) — foco preso/Escape/scroll-lock de graça via
 * Radix, sem precisar replicar o mecanismo manual do AppShell interno.
 * Topbar volta a ser só uma barra de apoio (toggle de sidebar + título +
 * sino + idioma), sem navegação horizontal.
 */
export function PortalAppShell({
  ctx,
  children,
}: {
  ctx: PortalContextValue;
  children: ReactNode;
}) {
  const { token, data, lang, setLang, ws } = ctx;
  const pendingItems = collectPendingApprovals(data);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  const sidebar = (
    <PortalSidebar
      token={token}
      ws={ws}
      clienteNome={data.clienteNome}
      clienteFoto={data.clienteFoto}
      campanhas={data.campanhas}
      lang={lang}
      collapsed={collapsed}
    />
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r border-border bg-background transition-[width] duration-150 md:block ${
          collapsed ? "md:w-[68px]" : "md:w-64"
        }`}
      >
        {sidebar}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navegação do portal</SheetTitle>
          <PortalSidebar
            token={token}
            ws={ws}
            clienteNome={data.clienteNome}
            clienteFoto={data.clienteFoto}
            campanhas={data.campanhas}
            lang={lang}
            collapsed={false}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <PortalTopBar
          ws={ws}
          lang={lang}
          onLangChange={setLang}
          token={token}
          data={data}
          pendingItems={pendingItems}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          onOpenMobileSidebar={() => setMobileOpen(true)}
        />
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
