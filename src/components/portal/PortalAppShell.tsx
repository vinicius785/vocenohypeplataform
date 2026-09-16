import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { PortalTopBar } from "./PortalTopBar";
import { PortalSidebar } from "./PortalSidebar";
import { pendingReason } from "./portal-widgets";
import type { PortalContextValue } from "./portal-context";

/**
 * Shell do Portal do Cliente (Etapa 2) — topbar compacta + navegação lateral
 * fixa no desktop / `Sheet` (drawer) no mobile, reusando `useIsMobile()`
 * (768px, já usado em outros pontos da plataforma). Reserva só a região de
 * layout pro conteúdo (`<main>`); cada página decide seu próprio
 * `PageContainer`/max-width nas etapas seguintes — não é aplicado aqui de
 * propósito, pra não travar a decisão de largura de conteúdo antes da hora.
 */
export function PortalAppShell({
  ctx,
  mobileOpen,
  onMobileOpenChange,
  children,
}: {
  ctx: PortalContextValue;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const { token, data, lang, setLang, ws } = ctx;

  const allInfluencers = data.campanhas.flatMap((c) => c.influencers);
  const totalAguardando = allInfluencers.filter((i) => pendingReason(i, lang)).length;
  const aguardandoPorCampanha = (c: (typeof data.campanhas)[number]) =>
    c.influencers.filter((i) => pendingReason(i, lang)).length;

  const sidebar = (
    <PortalSidebar
      token={token}
      campanhas={data.campanhas}
      totalAguardando={totalAguardando}
      aguardandoPorCampanha={aguardandoPorCampanha}
      lang={lang}
    />
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PortalTopBar
        ws={ws}
        clienteNome={data.clienteNome}
        clienteFoto={data.clienteFoto}
        lang={lang}
        onLangChange={setLang}
        onOpenMenu={isMobile ? () => onMobileOpenChange(true) : undefined}
      />

      <div className="flex flex-1 flex-col md:flex-row">
        {!isMobile && (
          <aside className="shrink-0 overflow-y-auto border-r border-border bg-muted/10 md:w-64">
            {sidebar}
          </aside>
        )}

        {isMobile && (
          <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Navegação do portal</SheetTitle>
              <div onClick={() => onMobileOpenChange(false)}>{sidebar}</div>
            </SheetContent>
          </Sheet>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
