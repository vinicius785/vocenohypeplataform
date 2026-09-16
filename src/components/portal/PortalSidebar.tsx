import { useEffect, useState } from "react";
import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { ChevronDown, LayoutGrid, Megaphone } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { campanhaStatus } from "@/components/campanhas/campanha-ui";
import { pendingReason } from "./portal-widgets";
import type { PortalLang } from "@/lib/portal-i18n";
import type { PublicCampanha } from "@/lib/portal-types";
import type { Workspace } from "@/lib/workspace-store";

function toStatusShim(c: PublicCampanha) {
  return {
    prazo: c.prazo,
    pagClienteTipo: c.isRecorrente ? ("Recorrente" as const) : undefined,
  } as Parameters<typeof campanhaStatus>[0];
}

/** Prefixo próprio (`portal:sidebar:*`) pra não colidir com as chaves
 * `sidebar:collapsed`/`sidebar:expanded` do AppShell interno, caso o time
 * abra o portal no mesmo navegador. */
const ENCERRADAS_KEY = "portal:sidebar:encerradasOpen";

function NavItem({
  to,
  params,
  active,
  icon,
  label,
  collapsed,
  badge,
}: {
  to: string;
  params: Record<string, string>;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  badge?: boolean;
}) {
  return (
    <Link
      to={to}
      params={params}
      title={collapsed ? label : undefined}
      className={`relative flex min-h-10 items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        active
          ? "bg-brand-subtle font-medium text-brand"
          : "text-muted-foreground hover:bg-muted/60"
      }`}
    >
      {active && (
        <span aria-hidden className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand" />
      )}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && badge && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />}
    </Link>
  );
}

export function PortalSidebar({
  token,
  ws,
  clienteNome,
  clienteFoto,
  campanhas,
  lang,
  collapsed,
  onNavigate,
}: {
  token: string;
  ws: Workspace;
  clienteNome: string;
  clienteFoto?: string;
  campanhas: PublicCampanha[];
  lang: PortalLang;
  collapsed: boolean;
  /** Chamado após qualquer navegação — o call site mobile usa isso pra
   * fechar o `Sheet`. */
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false });
  const activeCampanhaId = (params as { campanhaId?: string }).campanhaId;
  const [encerradasOpen, setEncerradasOpen] = useState(false);

  useEffect(() => {
    setEncerradasOpen(localStorage.getItem(ENCERRADAS_KEY) === "1");
  }, []);

  const today = new Date();
  const ativas = campanhas.filter((c) => campanhaStatus(toStatusShim(c), today) !== "encerrada");
  const encerradas = campanhas.filter(
    (c) => campanhaStatus(toStatusShim(c), today) === "encerrada",
  );

  const toggleEncerradas = () => {
    setEncerradasOpen((prev) => {
      const next = !prev;
      localStorage.setItem(ENCERRADAS_KEY, next ? "1" : "0");
      return next;
    });
  };

  const campanhaItem = (c: PublicCampanha) => {
    const pendente = c.influencers.some((i) => !!pendingReason(i, lang));
    return (
      <div key={c.id} onClick={onNavigate}>
        <NavItem
          to="/portal/$token/campanhas/$campanhaId"
          params={{ token, campanhaId: c.id }}
          active={activeCampanhaId === c.id}
          icon={<Megaphone className="h-4 w-4" />}
          label={c.nome}
          collapsed={collapsed}
          badge={pendente}
        />
      </div>
    );
  };

  return (
    <nav className="flex h-full flex-col overflow-y-auto py-3">
      {/* CABEÇALHO */}
      <div
        className="flex items-center gap-2.5 px-3 pb-3"
        title={collapsed ? "Você no Hype" : undefined}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foreground text-background">
          {ws.logo ? (
            <img src={ws.logo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-bold">{ws.nome.charAt(0).toUpperCase()}</span>
          )}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{ws.nome}</p>
            <p className="truncate text-[11px] text-muted-foreground">Portal do cliente</p>
          </div>
        )}
      </div>

      {/* IDENTIDADE DO CLIENTE — estática, sem chevron (1 cliente por token) */}
      <div
        className="mx-2 mb-3 flex items-center gap-2.5 rounded-lg border border-border/60 px-2 py-2"
        title={collapsed ? clienteNome : undefined}
      >
        <Avatar className="h-7 w-7 shrink-0">
          {clienteFoto && <AvatarImage src={clienteFoto} alt={clienteNome} />}
          <AvatarFallback className="text-[10px] font-semibold">
            {clienteNome.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {clienteNome}
          </span>
        )}
      </div>

      {/* GERAL */}
      {!collapsed && (
        <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Geral
        </p>
      )}
      <div className="space-y-0.5 px-2" onClick={onNavigate}>
        <NavItem
          to="/portal/$token/inicio"
          params={{ token }}
          active={pathname.endsWith("/inicio")}
          icon={<LayoutGrid className="h-4 w-4" />}
          label="Início"
          collapsed={collapsed}
        />
      </div>

      {/* CAMPANHAS */}
      {!collapsed && (
        <p className="mt-4 px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Campanhas
        </p>
      )}
      <div className="space-y-0.5 px-2">
        {ativas.map(campanhaItem)}
        {ativas.length === 0 && !collapsed && (
          <p className="px-2.5 py-1.5 text-xs text-muted-foreground">Nenhuma campanha ativa.</p>
        )}
        {!collapsed && (
          <Link
            to="/portal/$token/campanhas"
            params={{ token }}
            onClick={onNavigate}
            className="block px-2.5 py-1.5 text-xs font-medium text-brand hover:underline"
          >
            Ver todas
          </Link>
        )}
      </div>

      {encerradas.length > 0 && !collapsed && (
        <div className="mt-1 px-2">
          <button
            type="button"
            onClick={toggleEncerradas}
            className="flex min-h-9 w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${encerradasOpen ? "rotate-180" : ""}`}
            />
            Campanhas encerradas ({encerradas.length})
          </button>
          {encerradasOpen && <div className="space-y-0.5">{encerradas.map(campanhaItem)}</div>}
        </div>
      )}
    </nav>
  );
}
