import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardList, LayoutGrid, Megaphone } from "lucide-react";

const ITEMS = [
  { to: "/portal/$token/inicio", label: "Início", match: "/inicio", Icon: LayoutGrid },
  { to: "/portal/$token/campanhas", label: "Campanhas", match: "/campanhas", Icon: Megaphone },
  {
    to: "/portal/$token/solicitacoes",
    label: "Solicitações",
    match: "/solicitacoes",
    Icon: ClipboardList,
  },
] as const;

/**
 * Navegação inferior do mobile — substitui a sidebar/drawer removida na
 * correção visual/estrutural. Só os 3 destinos globais (Início/Campanhas/
 * Solicitações); Aprovações e Relatórios são contextuais (sino do topbar
 * + seções dentro de Início/campanha), nunca um destino aqui.
 */
export function PortalBottomNav({ token }: { token: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {ITEMS.map(({ to, label, match, Icon }) => {
        const active = pathname.includes(match);
        return (
          <Link
            key={to}
            to={to}
            params={{ token }}
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              active ? "text-brand" : "text-muted-foreground"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
