import type { ReactNode } from "react";
import { PortalTopBar } from "./PortalTopBar";
import { PortalBottomNav } from "./PortalBottomNav";
import { collectPendingApprovals } from "./portal-widgets";
import type { PortalContextValue } from "./portal-context";

/**
 * Shell do Portal do Cliente — correção visual/estrutural: sem sidebar
 * (removida por completo, nada de versão recolhível ou espaço reservado)
 * e sem drawer mobile — a navegação vira topbar (desktop) + bottom nav
 * (mobile), reutilizando os mesmos tokens/estado ativo da nav interna
 * (`bg-brand-subtle text-brand`, ver `PortalTopBar.tsx`). Reserva só a
 * região de layout pro conteúdo (`<main>`); cada página decide seu
 * próprio `PageContainer`/max-width.
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PortalTopBar
        ws={ws}
        clienteNome={data.clienteNome}
        clienteFoto={data.clienteFoto}
        lang={lang}
        onLangChange={setLang}
        token={token}
        pendingItems={pendingItems}
      />

      <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-20 sm:p-6 md:pb-6">{children}</main>

      <PortalBottomNav token={token} />
    </div>
  );
}
