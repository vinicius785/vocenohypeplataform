import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  Home,
  Megaphone,
  FileBarChart,
  FolderOpen,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { ClientSidebarHeader } from "../components/ClientSidebarHeader";
import { NotificationsPopover } from "../components/NotificationsPopover";
import { ClientThemeMenu } from "../components/ClientThemeMenu";
import { ClientSidebarProfile, CLIENT_ROLE_LABEL } from "../components/ClientSidebarProfile";
import { PendingNpsGate } from "../components/PendingNpsGate";
import {
  usePortalIdentity,
  usePortalNavigate,
  usePortalRuntime,
  type PortalNavItem,
} from "../runtime/portal-runtime";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shell da V2 — navegação própria (nunca os menus internos do time), na
 * MESMA linguagem visual do `AppShell.tsx` (sidebar `w-64`/colapsada
 * `w-[68px]`, `pill-nav-item`, topbar `h-16`). O topo da sidebar
 * identifica o CLIENTE ativo (nunca a marca Você no Hype), e a opção
 * "Ajuda" continua fora de toda a árvore.
 *
 * Rodada de simplificação de arquitetura: Aprovações/Conteúdos/
 * Notificações deixaram de ser destinos de menu — aprovação e conteúdo
 * acontecem dentro da campanha/drawer do influenciador, e notificações
 * viraram um popover no sino da topbar (`NotificationsPopover`), nunca
 * uma página própria. A sidebar fica só com Início/Campanhas/
 * Relatórios/Arquivos.
 *
 * Estrutura vertical: identidade do cliente → nav → espaço flexível →
 * perfil da pessoa → configurações — só a região central (`<nav>`) rola
 * se crescer, cabeçalho e rodapé continuam acessíveis.
 */

const NAV_ITEMS = [
  { key: "inicio", label: "Início", icon: Home, href: "/portal-v2/inicio" },
  { key: "campanhas", label: "Campanhas", icon: Megaphone, href: "/portal-v2/campanhas" },
  { key: "relatorios", label: "Relatórios", icon: FileBarChart, href: "/portal-v2/relatorios" },
  { key: "arquivos", label: "Arquivos", icon: FolderOpen, href: "/portal-v2/arquivos" },
] as const satisfies ReadonlyArray<{
  key: PortalNavItem;
  label: string;
  icon: typeof Home;
  href: string;
}>;

function NavButton({
  active,
  collapsed,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  icon: typeof Home;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={`nav-item relative flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
        collapsed ? "justify-center" : ""
      } ${active ? "bg-brand-subtle font-medium text-text-brand" : "pill-nav-item text-muted-foreground"}`}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand"
        />
      )}
      <span className="nav-icon relative shrink-0">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      {!collapsed && (
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">{label}</span>
      )}
    </button>
  );
}

function useMultiClientEnv(enabled: boolean): boolean {
  const [multiEnv, setMultiEnv] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;
      const { resolveUserEnvironment } = await import("@/lib/user-environment.server");
      const env = await resolveUserEnvironment(supabase, sessionData.session.user.id).catch(
        () => null,
      );
      if (!cancelled && env) setMultiEnv(env.type === "multiple");
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return multiEnv;
}

function useAuthIdentity(): { name: string; secondary: string; email: string } {
  const { data } = usePortalSessionData();
  return usePortalIdentity(CLIENT_ROLE_LABEL[data.role] ?? null);
}

function SidebarContent({
  collapsed,
  currentPath,
  onNavigate,
}: {
  collapsed: boolean;
  currentPath: string;
  onNavigate?: () => void;
}) {
  const { data } = usePortalSessionData();
  const navigate = usePortalNavigate();
  const { paths, capabilities } = usePortalRuntime();
  const multiEnv = useMultiClientEnv(capabilities.environmentSwitch);
  const { name: userName, secondary, email } = useAuthIdentity();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ClientSidebarHeader
        name={data.clienteNome}
        logoUrl={data.clienteFoto}
        collapsed={collapsed}
        showSwitch={multiEnv}
        onSwitchClick={() => navigate({ to: "/selecionar-ambiente" })}
      />

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3">
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.key}
            active={paths.isActive(currentPath, item.key)}
            collapsed={collapsed}
            icon={item.icon}
            label={item.label}
            onClick={() => {
              navigate({ to: paths[item.key]() });
              onNavigate?.();
            }}
          />
        ))}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <ClientSidebarProfile
          name={userName}
          secondary={secondary}
          email={email}
          collapsed={collapsed}
        />
      </div>
    </div>
  );
}

const COLLAPSE_KEY = "portal-v2:sidebar-collapsed";

/** `PendingNpsGate` envolve o shell INTEIRO (sidebar/topbar incluídos) —
 * enquanto houver NPS pendente, nada do menu de navegação é renderizado,
 * só o formulário; não basta esconder `{children}` deixando a sidebar
 * clicável por trás. */
export function PortalV2Shell({ children }: { children: ReactNode }) {
  return (
    <PendingNpsGate>
      <PortalV2ShellInner>{children}</PortalV2ShellInner>
    </PendingNpsGate>
  );
}

export function PortalV2ShellInner({ children }: { children: ReactNode }) {
  const { banner } = usePortalRuntime();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [currentPath]);

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      {/* Desktop sidebar — mesma largura/fundo/borda do AppShell.tsx */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-background transition-[width] duration-150 md:flex ${
          collapsed ? "w-[68px]" : "w-64"
        }`}
      >
        <SidebarContent collapsed={collapsed} currentPath={currentPath} />
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex shrink-0 items-center justify-center gap-2 border-t border-border py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-border bg-background"
            style={{
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            <div className="flex shrink-0 justify-end p-2">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent
              collapsed={false}
              currentPath={currentPath}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex h-screen min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar — mesma altura/borda/padding do AppShell.tsx */}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <PortalV2Breadcrumb currentPath={currentPath} />
          </div>
          <div className="flex items-center gap-1">
            {banner}
            <ClientThemeMenu />
            <NotificationsPopover />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function PortalV2Breadcrumb({ currentPath }: { currentPath: string }) {
  const { paths } = usePortalRuntime();
  const active = NAV_ITEMS.find((item) => paths.isActive(currentPath, item.key));
  // Configurações não é um item de NAV_ITEMS (só existe dentro do popover
  // do usuário) — sem este caso o título cairia no genérico "Portal".
  const label =
    active?.label ??
    (currentPath.startsWith(`${paths.base}/configuracoes`) ? "Configurações" : "Portal");
  return <p className="truncate text-sm font-medium text-foreground">{label}</p>;
}

/**
 * Fundo do NPS mensal bloqueante: a MESMA casca do shell (sidebar `w-64`,
 * itens de navegação, topbar `h-16`, `<main>` com o mesmo padding), mas
 * sem nenhum dado do Portal. Enquanto há NPS pendente o servidor
 * deliberadamente NÃO envia dados do cliente/campanhas
 * (`getPortalDataForSession` → `npsBlocked`, decisão de segurança de
 * f3b67ae), então identidade do cliente e conteúdo aparecem como skeleton
 * — nunca dado inventado. Puramente decorativo: `inert` + `aria-hidden`,
 * nada aqui é clicável/focável, o bloqueio continua total.
 */
export function PortalV2ShellBackdrop() {
  const currentPath = useRouterState({
    select: (s) => (s.location.search as { returnTo?: unknown }).returnTo ?? s.location.pathname,
  });
  const path = typeof currentPath === "string" ? currentPath : "";
  const active = NAV_ITEMS.find((item) => path.startsWith(item.href)) ?? NAV_ITEMS[0];
  return (
    <div
      aria-hidden="true"
      inert
      className="pointer-events-none fixed inset-0 flex select-none bg-background text-foreground"
    >
      <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <p className="text-xs text-muted-foreground">Portal do cliente</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.key}
              active={item.key === active.key}
              collapsed={false}
              icon={item.icon}
              label={item.label}
              onClick={() => {}}
            />
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-border p-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
          <Menu className="h-5 w-5 text-muted-foreground md:hidden" />
          <p className="flex-1 truncate text-sm font-medium text-foreground">{active.label}</p>
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </header>
        <main className="min-h-0 flex-1 space-y-6 overflow-hidden p-4 md:p-8">
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="surface-card space-y-3 p-5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="surface-card space-y-4 p-5 lg:col-span-2">
              <Skeleton className="h-4 w-40" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                </div>
              ))}
            </div>
            <div className="surface-card space-y-3 p-5">
              <Skeleton className="h-4 w-32" />
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-3 w-full" />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
