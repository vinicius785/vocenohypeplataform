import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  Users,
  Megaphone,
  Briefcase,
  Calendar,
  TrendingUp,
  Wallet,
  UserCog,
  Star,
  Target,
  MessageSquare,
  Settings,
  Search,
  Bell,
  Check,
  Moon,
  Sun,
  PanelLeft,
  Menu,
  Lock,
  X,
  AtSign,
  CheckSquare,
  CalendarClock,
  Timer,
  AlertTriangle,
  LifeBuoy,
} from "lucide-react";
import { loadProjetos, onProjetosChange, loadTeamMembers, getTaskAssignees } from "@/lib/projetos";
import { metricasPendentes, type Influ } from "@/components/influenciadores/InfluencerBoard";
import { getAllCampanhaTarefas, onCampanhaTarefasChange } from "@/lib/campanha-scoped-store";
import { loadStandalone, onStandaloneChange } from "@/lib/marketing-tasks";
import type { Task } from "@/components/tasks/TaskBoard";
import { supabase } from "@/integrations/supabase/client";
import { getTheme, setTheme } from "@/lib/theme";
import { setFaviconBadge } from "@/lib/favicon-badge";
import { SidebarProfile } from "./ConfiguracoesSection";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListRow } from "@/components/shared/ListRow";
import { useIsMobile } from "@/hooks/use-mobile";
import { SURFACE, type SemanticTone } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import { loadWorkspace, subscribeWorkspace, type Workspace } from "@/lib/workspace-store";
import { BomDiaDialog } from "./BomDiaDialog";
import { ReportProblemSheet } from "./problemas/ReportProblemSheet";
import { rememberNavigationContext } from "@/lib/problem-context";
import { MeetingReminderToast } from "./MeetingReminderToast";
import {
  getMe,
  loadMembers,
  loadChannels,
  loadMessages,
  loadCampaignChannels,
  loadProjectChannels,
  setActive as setActiveConvo,
  isConvoBeingViewed,
  isTabVisible,
  subscribeChat,
  loadLastRead,
  summarizeUnread,
  type ChatMessage,
  markRead,
  playNotifSound,
  primeNotifSound,
} from "@/lib/chat-store";

import { useClientes, type Cliente } from "@/lib/clientes-store";
import { routeForConvoId } from "@/components/chat-v2/chat-v2-utils";
import { notificationSummary } from "@/lib/voice-messages";
import { type NotifPrefs, loadNotifPrefs, subscribeNotifPrefs } from "@/lib/notif-prefs";
import {
  loadMeetings,
  onMeetingsChange,
  meetingNeedsMyAction,
  type Meeting,
} from "@/lib/reunioes-store";
import { useFinanceiroEntries } from "@/lib/financeiro-entries";
import { useMyAccess, hasPermission, SECTION_PERMISSION } from "@/lib/permissions";
import { useRunningTimer, stopTimer } from "@/lib/time-entries";
import { toast } from "sonner";
import { idbAuthStorage } from "@/lib/idb-auth-storage";
import { TaskModalStack } from "@/components/tasks/TaskModalStack";
import { type SectionKey } from "@/lib/section-nav";

export type { SectionKey };

/** Usado pra abrir uma campanha + tarefa específica ao clicar no indicador
 * de timer ativo — CampanhasSection lê isso ao montar (não é URL-driven
 * ainda, então esse é o jeito de passar "abre essa tarefa" na navegação). */
export const OPEN_CAMPANHA_TASK_KEY = "campanhas:openTask";
/** Disparado junto da escrita em `OPEN_CAMPANHA_TASK_KEY` — cobre o caso de
 * quem já está na aba Campanhas (o `useEffect` de leitura do sessionStorage
 * em CampanhasSection só roda no mount, então sem isso um clique repetido
 * no mesmo destino não abria nada). */
export const OPEN_CAMPANHA_TASK_EVENT = "campanhas:openTask:event";

/** Mesmo padrão acima, pra abrir um cliente específico a partir de uma
 * @menção no Chat — `ClientesSection` lê isso ao montar/escutar o evento. */
export const OPEN_CLIENTE_KEY = "clientes:openCliente";
export const OPEN_CLIENTE_EVENT = "clientes:openCliente:event";

/** Mesmo padrão, pra abrir o perfil de um membro do time a partir de uma
 * @menção no Chat — `DiretorioTab` (Time) lê isso ao montar/escutar o evento. */
export const OPEN_MEMBER_KEY = "time:openMember";
export const OPEN_MEMBER_EVENT = "time:openMember:event";

type NavItem = { key: SectionKey; label: string; icon: typeof LayoutGrid };
type NavGroup = { title: string; items: NavItem[] };

/** Sidebar = navegação GLOBAL. Funcionalidades internas de cada módulo
 * (abas do Financeiro, Objetivos/Indicadores de Metas, Kanban/Blog/Arquivos
 * de um projeto...) vivem dentro do próprio módulo, nunca como item aqui. */
const groups: NavGroup[] = [
  {
    title: "Geral",
    items: [{ key: "inicio", label: "Início", icon: LayoutGrid }],
  },
  {
    title: "Operação",
    items: [
      { key: "clientes", label: "Clientes", icon: Users },
      { key: "campanhas", label: "Campanhas", icon: Megaphone },
      { key: "projetos", label: "Projetos", icon: Briefcase },
      { key: "reunioes", label: "Reuniões", icon: Calendar },
    ],
  },
  {
    title: "Gestão",
    items: [
      { key: "comercial", label: "Comercial", icon: TrendingUp },
      { key: "financeiro", label: "Financeiro", icon: Wallet },
      { key: "time", label: "Time", icon: UserCog },
      { key: "influenciadores", label: "Influenciadores", icon: Star },
      { key: "metas", label: "Metas", icon: Target },
    ],
  },
  {
    title: "Comunicação",
    items: [{ key: "chat", label: "Chat", icon: MessageSquare }],
  },
];

/** Total de mensagens não lidas em qualquer canal/DM (exceto a conversa que
 * está sendo vista agora, com a aba em primeiro plano) — badge do item "Chat"
 * no menu. Mesma conta (`summarizeUnread`) do sino e das listas de conversa,
 * então os indicadores nunca divergem; os detalhes por conversa ficam no sino. */
function useUnreadChatCount(): number {
  const [, force] = useState(0);
  useEffect(() => subscribeChat(() => force((t) => t + 1)), []);
  return summarizeUnread(loadMessages(), getMe().id, loadLastRead()).total;
}

/** Tem alguma reunião onde eu ainda não confirmei nem recusei? Usado pra
 * bolinha do item "Reuniões" no menu — some assim que EU ajo, mesmo que a
 * reunião como um todo continue "Pendente" esperando outra pessoa. */
function useHasPendingMeetingRequests(): boolean {
  const [meetings, setMeetings] = useState(() => loadMeetings());
  useEffect(() => {
    const refresh = () => setMeetings(loadMeetings());
    refresh();
    return onMeetingsChange(refresh);
  }, []);
  const me = getMe();
  return meetings.some(
    (m) =>
      (m.criadorId === me.id || m.participanteIds?.includes(me.id)) &&
      meetingNeedsMyAction(m, me.id),
  );
}

/** Tem alguma despesa vencida (data já passou e ainda não foi marcada como
 * paga)? Usado pro ícone de atenção do item "Financeiro" no menu. */
function useHasOverdueDespesas(): boolean {
  const entries = useFinanceiroEntries();
  return useMemo(
    () => entries.some((e) => e.kind === "despesa" && e.status === "vencido"),
    [entries],
  );
}

const SEEN_LEADS_KEY = "notif:seenLeadIds";
function readSeenLeadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_LEADS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function writeSeenLeadIds(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_LEADS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore */
  }
}

/** Leads novos ainda não vistos — bolinha do item "Comercial" no menu +
 * som quando um lead de verdade chega (não quando a lista só recarrega). */
function useLeadNotifications() {
  const [unseenCount, setUnseenCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let bootstrapped = false;

    const bootstrap = async () => {
      const { data } = await supabase.from("leads").select("id");
      if (cancelled || !data) return;
      const seen = readSeenLeadIds();
      // Primeira carga: marca tudo que já existe como visto, senão todo
      // lead antigo apareceria como "novo" na primeira visita depois do
      // deploy dessa feature.
      let changed = false;
      for (const row of data) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          changed = true;
        }
      }
      if (changed) writeSeenLeadIds(seen);
      bootstrapped = true;
      setUnseenCount(0);
    };
    void bootstrap();

    const channel = supabase
      .channel(`rt-nav-leads-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, (payload) => {
        if (!bootstrapped) return; // ignora eventos que cheguem antes do bootstrap
        const row = payload.new as { id?: string };
        if (!row.id) return;
        const seen = readSeenLeadIds();
        if (seen.has(row.id)) return; // já visto (outra aba já processou)
        setUnseenCount((n) => n + 1);
        playNotifSound();
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  const markSeen = async () => {
    if (unseenCount === 0) return;
    setUnseenCount(0);
    try {
      const { data } = await supabase.from("leads").select("id");
      if (data) writeSeenLeadIds(new Set(data.map((r) => r.id)));
    } catch {
      /* ignore */
    }
  };

  return { unseenCount, markSeen };
}

export function AppShell({
  children,
  active,
  onSelect,
}: {
  children: ReactNode;
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  const [ws, setWs] = useState<Workspace>(() =>
    typeof window !== "undefined" ? loadWorkspace() : { nome: "Você no Hype" },
  );
  useEffect(() => subscribeWorkspace(() => setWs(loadWorkspace())), []);
  useIncomingMessageNotifier();
  const unreadChatCount = useUnreadChatCount();
  const hasPendingMeetings = useHasPendingMeetingRequests();
  const hasOverdueDespesas = useHasOverdueDespesas();
  const { unseenCount: unseenLeads, markSeen: markLeadsSeen } = useLeadNotifications();
  const access = useMyAccess();

  // Contexto do "Reportar problema": última tela visitada fora de Problemas.
  const routerLocation = useRouterState({ select: (st) => st.location });
  useEffect(() => {
    rememberNavigationContext(routerLocation.pathname + routerLocation.searchStr, active);
  }, [routerLocation.pathname, routerLocation.searchStr, active]);

  const [collapsed, setCollapsedState] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("sidebar:collapsed") === "1",
  );
  // Persistido localmente (Etapa 3) — não afeta permissões nem esconde
  // ações essenciais, só lembra a preferência de largura entre sessões.
  const setCollapsed = (value: boolean | ((c: boolean) => boolean)) => {
    setCollapsedState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      try {
        localStorage.setItem("sidebar:collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const [mobileOpen, setMobileOpen] = useState(false);
  const showFull = !collapsed || mobileOpen;
  useEffect(() => {
    setMobileOpen(false);
  }, [active]);

  // Foco/Escape do menu mobile: ao abrir, entra no primeiro item de
  // navegação (leitor de tela já sabe que um novo painel apareceu); ao
  // fechar (Escape, backdrop, navegação), devolve o foco pro botão que
  // abriu — sem isso o foco fica "perdido" num elemento que já saiu da
  // tela. `inert` no conteúdo atrás faz o papel de focus trap: impede
  // Tab/leitor de tela de escapar pro conteúdo escondido sob o backdrop,
  // sem precisar interceptar cada tecla manualmente.
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const first = mobileNavRef.current?.querySelector<HTMLElement>("button:not(:disabled)");
    first?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const menuButton = mobileMenuButtonRef.current;
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      menuButton?.focus();
    };
  }, [mobileOpen]);
  const [theme, setThemeState] = useState<"light" | "dark">(() =>
    typeof window !== "undefined" ? getTheme() : "light",
  );
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    setTheme(next);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <BomDiaDialog />
      <MeetingReminderToast />
      <ReportProblemSheet />
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-background transition-transform duration-200 md:sticky md:top-0 md:z-auto md:translate-x-0 md:transition-[width] md:duration-150 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-[68px]" : "md:w-64"}`}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foreground text-background">
            {ws.logo ? (
              <img src={ws.logo} alt="" className="h-full w-full object-cover" />
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            )}
          </div>
          {showFull && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{ws.nome || "Workspace"}</div>
              <div className="truncate text-xs text-muted-foreground">workspace</div>
            </div>
          )}
        </div>

        <nav ref={mobileNavRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <div
              key={group.title}
              className={showFull ? "mb-3" : "mb-2 border-b border-border/50 pb-2 last:border-0"}
            >
              {showFull && (
                <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {group.title}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = active === item.key;
                  const Icon = item.icon;
                  const allowed = hasPermission(access, SECTION_PERMISSION[item.key]);
                  const showDot =
                    allowed &&
                    ((item.key === "comercial" && unseenLeads > 0) ||
                      (item.key === "reunioes" && hasPendingMeetings));
                  const chatUnread = allowed && item.key === "chat" ? unreadChatCount : 0;
                  const showOverdueWarning =
                    allowed && item.key === "financeiro" && hasOverdueDespesas;
                  return (
                    <li key={item.key}>
                      <NavButton
                        label={item.label}
                        icon={<Icon className="h-4 w-4" aria-hidden="true" />}
                        active={isActive}
                        disabled={!allowed}
                        collapsed={!showFull}
                        title={
                          !allowed
                            ? "Sem permissão para acessar esta seção"
                            : showOverdueWarning
                              ? "Há despesas vencidas"
                              : undefined
                        }
                        badge={
                          <>
                            {chatUnread > 0 && (
                              <span
                                aria-label={`${chatUnread} mensagens não lidas`}
                                className={
                                  showFull
                                    ? "flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-brand-foreground"
                                    : "absolute right-0.5 top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-brand px-1 text-[9px] font-semibold leading-none text-brand-foreground"
                                }
                              >
                                {chatUnread > 99 ? "99+" : chatUnread}
                              </span>
                            )}
                            {showDot && (
                              <span
                                aria-label="Novidades"
                                className={
                                  showFull
                                    ? "h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
                                    : "absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive"
                                }
                              />
                            )}
                            {showOverdueWarning && (
                              <AlertTriangle
                                aria-label="Despesas vencidas"
                                className={
                                  showFull
                                    ? "h-3.5 w-3.5 shrink-0 fill-amber-500 text-background"
                                    : "absolute right-0.5 top-0.5 h-3 w-3 fill-amber-500 text-background"
                                }
                              />
                            )}
                            {!allowed && (
                              <Lock
                                aria-hidden
                                className={
                                  showFull
                                    ? "h-3 w-3 shrink-0 text-muted-foreground/60"
                                    : "absolute right-1 top-1 h-2.5 w-2.5 text-muted-foreground/60"
                                }
                              />
                            )}
                          </>
                        }
                        onClick={() => {
                          if (!allowed) return;
                          onSelect(item.key);
                          if (item.key === "comercial") void markLeadsSeen();
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border bg-background">
          {showFull && <SidebarProfile />}

          <ul className="space-y-0.5 border-t border-border p-3">
            <li>
              <NavButton
                label="Configurações"
                icon={<Settings className="h-4 w-4" aria-hidden="true" />}
                active={active === "configuracoes"}
                collapsed={!showFull}
                onClick={() => onSelect("configuracoes")}
              />
            </li>
            <li>
              <NavButton
                label="Problemas"
                icon={<LifeBuoy className="h-4 w-4" aria-hidden="true" />}
                active={active === "problemas"}
                collapsed={!showFull}
                onClick={() => onSelect("problemas")}
              />
            </li>
          </ul>
        </div>
      </aside>

      <div
        className="flex h-screen min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        inert={mobileOpen ? true : undefined}
      >
        <header className="flex h-16 items-center gap-3 border-b border-border px-6">
          <button
            ref={mobileMenuButtonRef}
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileOpen}
          >
            <Menu className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex"
            aria-label="Alternar menu lateral"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <GlobalSearch onSelect={onSelect} />
          <div className="ml-auto flex items-center gap-1">
            <ActiveTimerIndicator onSelect={onSelect} />
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Tema"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <NotificationsBell onSelect={onSelect} />
          </div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-auto p-4 md:p-8">{children}</main>
      </div>
      <TaskModalStack />
    </div>
  );
}

/** Item da sidebar — um só componente para módulos e rodapé. Ativo:
 * fundo neutro + marca lateral discreta (sem excesso de azul); recolhido:
 * só o ícone, com o nome no `title`/`aria-label`. */
function NavButton({
  label,
  icon,
  active,
  disabled,
  collapsed,
  title,
  badge,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  disabled?: boolean;
  collapsed: boolean;
  title?: string;
  badge?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title ?? (collapsed ? label : undefined)}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
        collapsed ? "justify-center" : ""
      } ${
        disabled
          ? "cursor-not-allowed text-muted-foreground/40"
          : active
            ? "bg-muted font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand"
        />
      )}
      <span className="relative flex shrink-0 items-center">{icon}</span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {badge}
    </button>
  );
}

type SearchResult = {
  id: string;
  label: string;
  hint?: string;
  section: SectionKey;
  icon: typeof LayoutGrid;
};

function GlobalSearch({ onSelect }: { onSelect: (key: SectionKey) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const clientes = useClientes();

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SearchResult[] = [];

    for (const c of clientes) {
      if (c.empresa?.toLowerCase().includes(q) || c.responsavel?.toLowerCase().includes(q)) {
        out.push({
          id: `cliente:${c.id}`,
          label: c.empresa,
          hint: c.responsavel,
          section: "clientes",
          icon: Users,
        });
      }
      for (const camp of c.campanhas ?? []) {
        if (camp.nome?.toLowerCase().includes(q)) {
          out.push({
            id: `campanha:${camp.id}`,
            label: camp.nome,
            hint: c.empresa,
            section: "campanhas",
            icon: Megaphone,
          });
        }
      }
    }

    for (const p of loadProjetos()) {
      if (p.name?.toLowerCase().includes(q)) {
        out.push({
          id: `projeto:${p.id}`,
          label: p.name,
          hint: "Projeto",
          section: "projetos",
          icon: Briefcase,
        });
      }
    }

    for (const m of loadTeamMembers()) {
      if (m.name?.toLowerCase().includes(q)) {
        out.push({
          id: `membro:${m.id}`,
          label: m.name,
          hint: m.role || "Membro do time",
          section: "time",
          icon: UserCog,
        });
      }
    }

    return out.slice(0, 8);
  }, [query, clientes]);

  const go = (r: SearchResult) => {
    onSelect(r.section);
    setOpen(false);
    setQuery("");
  };

  // Abaixo de `sm:`, o input permanente competia por espaço com o
  // hambúrguer + 3 ícones na mesma linha (item 7 do pedido) — vira só um
  // ícone que abre o campo como um overlay cobrindo o header, em vez de um
  // input espremido o tempo todo.
  const [mobileExpanded, setMobileExpanded] = useState(false);

  return (
    <div className="relative min-w-0 flex-1 max-w-2xl">
      <button
        type="button"
        onClick={() => setMobileExpanded(true)}
        aria-label="Buscar"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
      >
        <Search className="h-4 w-4" />
      </button>

      <div className="relative hidden sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar clientes, campanhas, projetos, time..."
          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            aria-label="Limpar busca"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {mobileExpanded && (
        <div className="fixed inset-x-0 top-0 z-50 flex h-16 items-center gap-2 border-b border-border bg-background px-4 sm:hidden">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              placeholder="Buscar..."
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setMobileExpanded(false);
              setOpen(false);
              setQuery("");
            }}
            aria-label="Fechar busca"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          {open && query && (
            <div className="absolute inset-x-0 top-full max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-border bg-popover shadow-lg">
              {results.length === 0 ? (
                <p className="px-4 py-4 text-center text-xs text-muted-foreground">
                  Nenhum resultado para "{query}".
                </p>
              ) : (
                <ul className="py-1">
                  {results.map((r) => {
                    const Icon = r.icon;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => {
                            go(r);
                            setMobileExpanded(false);
                          }}
                          className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm hover:bg-muted"
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{r.label}</span>
                          {r.hint && (
                            <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                              {r.hint}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {open && query && !mobileExpanded && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-96 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
            {results.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                Nenhum resultado para "{query}".
              </p>
            ) : (
              <ul className="py-1">
                {results.map((r) => {
                  const Icon = r.icon;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => go(r)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{r.label}</span>
                        {r.hint && (
                          <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                            {r.hint}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Abre uma conversa do Chat direto na rota dela (e, se vier `messageId`,
 * posicionada na mensagem via `?highlight=`) — nunca só a home do Chat. */
function useOpenConversation() {
  const navigate = useNavigate();
  return useCallback(
    (convoId: string, messageId?: string) => {
      const { to, params } = routeForConvoId(convoId, getMe().id);
      setActiveConvo(convoId);
      void navigate({
        to: to as never,
        params: params as never,
        search: (messageId ? { highlight: messageId } : {}) as never,
      });
    },
    [navigate],
  );
}

/** Rótulo curto de onde a mensagem foi enviada — "#canal", nome da campanha
 * ou do projeto; vazio em DM (o remetente já é a conversa). */
function convoPlaceLabel(convoId: string): string {
  if (convoId.startsWith("dm:")) return "";
  if (convoId.startsWith("camp:")) {
    const clientes = (() => {
      try {
        return JSON.parse(localStorage.getItem("clientes") ?? "[]");
      } catch {
        return [];
      }
    })();
    return (
      loadCampaignChannels(clientes as never).find((c) => c.id === convoId)?.name ?? "Campanha"
    );
  }
  if (convoId.startsWith("proj:"))
    return loadProjectChannels().find((p) => p.id === convoId)?.name ?? "Projeto";
  const name = loadChannels().find((c) => c.id === convoId)?.name;
  return name ? `#${name}` : "Canal";
}

// Mensagens que chegam em rajada viram UMA notificação: acumulam nesta
// janela e o toast (id fixo) é atualizado em vez de empilhado.
const INCOMING_BATCH_MS = 1200;
const INCOMING_GROUP_WINDOW_MS = 6000;
const INCOMING_TOAST_ID = "chat-incoming";

function groupedAuthorsLabel(names: string[]): string {
  if (names.length === 1) return `${names[0]} enviou uma nova mensagem`;
  if (names.length === 2) return `${names[0]} e ${names[1]} enviaram novas mensagens`;
  return `${names[0]}, ${names[1]} e mais ${names.length - 2} enviaram novas mensagens`;
}

/** Único ponto que reage a mensagem recebida: usa o MESMO realtime do
 * `chat-store` (`subscribeChat`) — nenhuma conexão/polling próprio. Respeita
 * a preferência "Mensagens", não notifica a conversa que a pessoa está vendo
 * (aba em primeiro plano), agrupa rajadas, toca o som uma vez por lote e só
 * usa a Notification do navegador se a permissão JÁ foi concedida (nunca a
 * pede sozinho — o opt-in é feito em Configurações → notificações push). */
function useIncomingMessageNotifier() {
  const openConversation = useOpenConversation();
  const openRef = useRef(openConversation);
  openRef.current = openConversation;

  useEffect(() => {
    // Destrava o áudio no primeiro gesto (navegadores bloqueiam antes disso).
    const unlock = () => {
      primeNotifSound();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    const seen = new Set<string>();
    const mountedAt = Date.now();
    // Semeia com o que já está carregado pra não notificar o histórico.
    loadMessages().forEach((m) => seen.add(m.id));

    let pending: ChatMessage[] = [];
    let timer: number | undefined;
    // Mensagens já mostradas no toast ainda em tela (pra somar na contagem
    // quando chega mais uma logo em seguida).
    let shown: { at: number; messages: ChatMessage[] } | null = null;

    const flush = () => {
      timer = undefined;
      const lastRead = loadLastRead();
      // Reavalia no momento de mostrar: a pessoa pode ter aberto a conversa
      // ou lido a mensagem durante a janela de agrupamento.
      const fresh = pending.filter(
        (m) => !isConvoBeingViewed(m.convoId) && m.createdAt > (lastRead[m.convoId] ?? 0),
      );
      pending = [];
      if (fresh.length === 0 || !loadNotifPrefs().mensagens) return;

      const base = shown && Date.now() - shown.at < INCOMING_GROUP_WINDOW_MS ? shown.messages : [];
      const all = [...base, ...fresh];
      shown = { at: Date.now(), messages: all };
      const latest = all[all.length - 1];
      const authors = Array.from(new Set(all.map((m) => m.authorName || "Alguém")));
      const single = all.length === 1;
      const place = convoPlaceLabel(latest.convoId);

      playNotifSound();

      if (isTabVisible()) {
        void import("@/components/notifications/NotificationToast").then(
          ({ showAppNotification }) => {
            showAppNotification(
              single
                ? {
                    kind: "message",
                    title: latest.authorName || "Nova mensagem",
                    event: place ? `Enviou uma mensagem em ${place}` : "Enviou uma nova mensagem",
                    context: notificationSummary(latest) || undefined,
                    avatarUrl: latest.authorPhoto,
                    timeLabel: "agora",
                    actionLabel: "Ver mensagem",
                    onAction: () => openRef.current(latest.convoId, latest.id),
                  }
                : {
                    kind: "message",
                    title: `${all.length} novas mensagens`,
                    event: groupedAuthorsLabel(authors),
                    avatarUrl: authors.length === 1 ? latest.authorPhoto : undefined,
                    avatarFallback: (authors[0] ?? "?").slice(0, 1).toUpperCase(),
                    timeLabel: "agora",
                    actionLabel: "Ver mensagens",
                    onAction: () => openRef.current(latest.convoId, latest.id),
                  },
              { id: INCOMING_TOAST_ID },
            );
          },
        );
      } else if ("Notification" in window && Notification.permission === "granted") {
        // Aba em background: notificação do sistema (só com permissão já dada).
        try {
          const n = new Notification(
            single ? latest.authorName || "Nova mensagem" : `${all.length} novas mensagens`,
            {
              body: single ? notificationSummary(latest) : groupedAuthorsLabel(authors),
              icon: single ? latest.authorPhoto || undefined : undefined,
              tag: INCOMING_TOAST_ID,
            },
          );
          n.onclick = () => {
            window.focus();
            openRef.current(latest.convoId, latest.id);
            n.close();
          };
        } catch {
          /* ignore */
        }
      }
    };

    const check = () => {
      const me = getMe();
      for (const m of loadMessages()) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        // O lote inicial carrega assíncrono depois da montagem — ignora o que é anterior.
        if (m.createdAt < mountedAt - 2000) continue;
        if (m.authorId === me.id || m.authorId === "system") continue;
        // Defesa em profundidade (o RLS já filtra): DM só de quem participa.
        if (m.convoId.startsWith("dm:") && !m.convoId.slice(3).split("|").includes(me.id)) continue;
        if (isConvoBeingViewed(m.convoId)) continue;
        pending.push(m);
      }
      if (pending.length > 0 && timer === undefined) {
        timer = window.setTimeout(flush, INCOMING_BATCH_MS);
      }
    };
    const unsubscribe = subscribeChat(check);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
}

/** Timer ativo em qualquer tarefa (Projetos ou Campanhas) atribuída ao
 * usuário atual — indicador global ao lado do botão de tema, já que o
 * timer pode ficar rodando fora da tela onde foi iniciado. */
// Cronômetro rodando por mais que isso mostra um aviso de "esqueceu de
// parar?" — não bloqueante, nunca modifica o registro por conta própria
// (item explícito do pedido: só ação clicada pela pessoa muda o dado).
const LONG_RUNNING_WARNING_HOURS = 8;

function ActiveTimerIndicator({ onSelect }: { onSelect: (key: SectionKey) => void }) {
  const navigate = useNavigate();
  const running = useRunningTimer();
  // Um aviso por cronômetro (não um por limiar cruzado a cada render) —
  // reseta quando o cronômetro em si muda (parou/outro começou).
  const warnedForRef = useRef<string | null>(null);
  useEffect(() => {
    const entry = running.entry;
    if (!entry) {
      warnedForRef.current = null;
      return;
    }
    const elapsedHours = (Date.now() - Date.parse(entry.startedAt)) / 3_600_000;
    if (elapsedHours < LONG_RUNNING_WARNING_HOURS || warnedForRef.current === entry.id) return;
    warnedForRef.current = entry.id;
    toast.warning("Cronômetro rodando há muito tempo. Você esqueceu de parar?", {
      duration: Infinity,
      action: {
        label: "Parar agora",
        onClick: () => {
          void stopTimer(entry.id, entry.startedAt).then(() => running.refetch());
        },
      },
      cancel: { label: "Continuar", onClick: () => {} },
    });
  }, [running.entry, running.refetch]);
  // `dataTick` só muda quando os dados de verdade mudam (evento de store) —
  // gatilho pro `useMemo` abaixo (que resolve o TÍTULO da tarefa do
  // cronômetro em andamento) recalcular; os stores de tarefa continuam
  // sendo a fonte de verdade pro título/navegação, só o dado de "está
  // rodando" migrou pra `time_entries` (ver `useRunningTimer`).
  const [dataTick, forceData] = useState(0);
  useEffect(() => onProjetosChange(() => forceData((n) => n + 1)), []);
  useEffect(() => onCampanhaTarefasChange(() => forceData((n) => n + 1)), []);
  useEffect(() => onStandaloneChange(() => forceData((n) => n + 1)), []);
  const [, forceNow] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => forceNow((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const active = useMemo(() => {
    const entry = running.entry;
    if (!entry) return null;
    type MinimalTask = { id: string; title: string; subtasks?: MinimalTask[] };
    // Mesmo id pode estar numa subtarefa — retorna o título de onde achou
    // + o id da tarefa de TOPO (não existe "abrir só a subtarefa", o
    // diálogo é sempre o da tarefa raiz que a contém).
    const findById = (
      list: MinimalTask[],
      targetId: string,
      rootId?: string,
    ): { node: MinimalTask; rootId: string } | null => {
      for (const t of list) {
        const thisRootId = rootId ?? t.id;
        if (t.id === targetId) return { node: t, rootId: thisRootId };
        const nested = findById(t.subtasks ?? [], targetId, thisRootId);
        if (nested) return nested;
      }
      return null;
    };
    if (entry.taskOrigin === "projeto") {
      for (const p of loadProjetos()) {
        const found = findById((p.tasks ?? []) as MinimalTask[], entry.taskId);
        if (found) {
          return {
            title: found.node.title,
            startedAt: entry.startedAt,
            section: "projetos" as const,
            taskId: found.rootId,
            projectId: p.id,
          };
        }
      }
    } else if (entry.taskOrigin === "campanha") {
      for (const [campanhaId, tasks] of getAllCampanhaTarefas()) {
        const found = findById(tasks as MinimalTask[], entry.taskId);
        if (found) {
          return {
            title: found.node.title,
            startedAt: entry.startedAt,
            section: "campanhas" as const,
            taskId: found.rootId,
            campanhaId,
          };
        }
      }
    } else if (entry.taskOrigin === "marketing") {
      // O id precisa do mesmo prefixo `mkt:` que `resolveTasks` usa em
      // MarketingSection.tsx, senão o deep-link não acha a tarefa lá dentro.
      let marketingProjectId: string | undefined;
      for (const p of loadProjetos()) {
        if (p.name.trim().toUpperCase() === "MARKETING") marketingProjectId = p.id;
      }
      const found = findById(loadStandalone() as unknown as MinimalTask[], entry.taskId);
      if (found && marketingProjectId) {
        return {
          title: found.node.title,
          startedAt: entry.startedAt,
          section: "projetos" as const,
          taskId: `mkt:${found.rootId}`,
          projectId: marketingProjectId,
        };
      }
    }
    // Tarefa não encontrada nos stores (ex.: removida enquanto o
    // cronômetro corria) — mostra o indicador mesmo assim, sem título,
    // em vez de escondê-lo ou quebrar a navegação.
    return {
      title: "Tarefa removida",
      startedAt: entry.startedAt,
      section: null,
      taskId: entry.taskId,
    };
  }, [running.entry, dataTick]);

  if (!active) return null;
  const elapsed = active.startedAt ? (Date.now() - Date.parse(active.startedAt)) / 1000 : 0;
  const s = Math.max(0, Math.round(elapsed));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const label = h > 0 ? `${h}h ${m}min` : m > 0 ? `${m}min` : `${sec}s`;

  return (
    <button
      type="button"
      onClick={() => {
        if (active.section === "projetos") {
          void navigate({
            to: "/projeto/$id",
            params: { id: active.projectId },
            search: { taskId: active.taskId },
          });
          return;
        }
        if (active.section !== "campanhas") return;
        try {
          sessionStorage.setItem(
            OPEN_CAMPANHA_TASK_KEY,
            JSON.stringify({ campanhaId: active.campanhaId, taskId: active.taskId }),
          );
        } catch {
          /* ignore */
        }
        // A leitura do sessionStorage acima só roda no MOUNT de
        // CampanhasSection — se a pessoa já estiver na aba Campanhas
        // (nenhum remount acontece), clicar não abria nada e não dava pra
        // saber de onde vinha o timer. Este evento cobre esse caso.
        window.dispatchEvent(new CustomEvent(OPEN_CAMPANHA_TASK_EVENT));
        onSelect(active.section);
      }}
      title={`Timer ativo: ${active.title}`}
      className="inline-flex items-center gap-1.5 rounded-md bg-sky-500/10 px-2 py-1.5 text-xs font-medium tabular-nums text-sky-700 hover:bg-sky-500/20 dark:text-sky-400"
    >
      <Timer className="h-3.5 w-3.5 animate-pulse" />
      {label}
    </button>
  );
}

type BellTab = "tarefas" | "mensagens" | "reunioes" | "outros";

/** Uma notificação — sempre `ListRow` (design system), nunca um card
 * hand-rolled próprio. Tudo mostrado aqui já é implicitamente "não lida"
 * (o dado de origem já filtra fora o que foi visto/dismissado — não
 * existe hoje um estado "lida mas ainda na lista" pra diferenciar), então
 * `unread` é sempre `true`: o indicador visual é honesto com o modelo de
 * dado real, não decorativo. */
function BellItem({
  icon,
  iconTone,
  title,
  subtitle,
  time,
  badge,
  onClick,
  onMarkRead,
}: {
  icon: ReactNode;
  iconTone: SemanticTone;
  title: string;
  subtitle: ReactNode;
  time?: string;
  badge?: number;
  onClick: () => void;
  /** Marca esta notificação como lida sem navegar até o item de origem —
   * ausente quando o item não tem um "lida" independente da navegação
   * (ex: mensagens não lidas de um canal, que só somem ao abrir a conversa). */
  onMarkRead?: () => void;
}) {
  return (
    <ListRow
      icon={icon}
      iconTone={iconTone}
      title={title}
      description={subtitle}
      time={time}
      unread
      multiline
      onClick={onClick}
      status={badge ? { label: String(badge), tone: "brand" } : undefined}
      secondaryAction={
        onMarkRead
          ? {
              icon: <Check className="h-3.5 w-3.5" />,
              label: "Marcar como lida",
              onClick: onMarkRead,
            }
          : undefined
      }
    />
  );
}

/** IDs "vistos" (dismissados) do sino de notificações — precisa sobreviver
 * o app sendo fechado no meio, não só um `localStorage.setItem` puro:
 * marcar como lida funcionava certinho na hora, mas "voltava" a aparecer
 * depois de fechar e reabrir o app instalado como PWA no iPhone, porque o
 * WebKit às vezes mata o processo antes do localStorage ser gravado em
 * disco (mesmo bug já mitigado pra sessão de login em idb-auth-storage.ts
 * — reaproveitado aqui). `localStorage` continua sendo a leitura inicial
 * (síncrona, sem esperar o IndexedDB abrir) pra não atrasar o primeiro
 * render; o IndexedDB só entra depois, como reforço mais durável, e
 * qualquer id que só exista lá é mesclado assim que chega. */
function useDurableSeenIds(key: string): [Set<string>, (ids: string[]) => void] {
  const [seen, setSeen] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(key);
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });

  useEffect(() => {
    let cancelled = false;
    void idbAuthStorage.getItem(key).then((raw) => {
      if (cancelled || !raw) return;
      try {
        const ids = JSON.parse(raw) as string[];
        setSeen((prev) => {
          if (ids.every((id) => prev.has(id))) return prev;
          return new Set([...prev, ...ids]);
        });
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const markSeen = (ids: string[]) => {
    if (ids.length === 0) return;
    setSeen((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      void idbAuthStorage.setItem(key, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  return [seen, markSeen];
}

type ClienteActionItem = {
  key: string;
  influId: string;
  campanhaId: string;
  nome: string;
  title: string;
  action: string;
  at: string;
};

/** Título (quem aparece em negrito no sino) e subtítulo da notificação.
 * Reprovações e a aprovação de influenciador são os casos que mais importa
 * pegar rápido — usam o nome do CLIENTE como título (em vez do
 * influenciador) pra bater o olho e ver quem precisa de atenção, sem
 * precisar abrir a notificação. */
function describeClientAction(
  nome: string,
  action: NonNullable<Influ["lastClientAction"]>,
  empresa?: string,
  campanhaNome?: string,
): { title: string; subtitle: string } {
  if (action.kind === "influ" && action.status === "aprovado" && empresa) {
    return {
      title: empresa,
      subtitle: campanhaNome
        ? `Aprovou ${nome} para a campanha ${campanhaNome}`
        : `Aprovou ${nome}`,
    };
  }
  const verbo = action.status === "aprovado" ? "aprovou" : "reprovou";
  const alvo =
    action.kind === "influ"
      ? "a seleção pra campanha"
      : action.kind === "roteiro"
        ? "o roteiro"
        : "o conteúdo";
  if (action.status === "reprovado" && empresa) {
    return { title: empresa, subtitle: `Reprovou ${alvo} de ${nome}` };
  }
  return { title: nome, subtitle: `${verbo} ${alvo}` };
}

/** Assina `campanha_influenciadores` (a mesma tabela que o link público
 * `/campanha/$token` escreve) e transforma toda ação nova do cliente
 * (aprovar/reprovar em qualquer das 3 etapas) numa notificação na aba
 * "Outros" do sino, com toast em tempo real se a aba estiver visível —
 * mesmo padrão de `useIncomingMessageNotifier` pras mensagens de chat. */
function useCampanhaAprovacaoNotifier(clientes: Cliente[]): {
  items: ClienteActionItem[];
  dismiss: (keys: string[]) => void;
} {
  const [items, setItems] = useState<ClienteActionItem[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const clientesRef = useRef(clientes);
  clientesRef.current = clientes;

  useEffect(() => {
    try {
      const raw = localStorage.getItem("notif:seenAprovacoesCliente");
      if (raw) seenRef.current = new Set(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }

    const empresaDaCampanha = (campanhaId: string): string | undefined =>
      clientesRef.current.find((c) => c.campanhas?.some((camp) => camp.id === campanhaId))?.empresa;
    const nomeDaCampanha = (campanhaId: string): string | undefined =>
      clientesRef.current.flatMap((c) => c.campanhas ?? []).find((camp) => camp.id === campanhaId)
        ?.nome;

    const toItem = (row: {
      id: string;
      campanha_id: string;
      data: Influ;
    }): ClienteActionItem | null => {
      const action = row.data.lastClientAction;
      if (!action) return null;
      const key = `${row.id}:${action.at}`;
      const { title, subtitle } = describeClientAction(
        row.data.nome,
        action,
        empresaDaCampanha(row.campanha_id),
        nomeDaCampanha(row.campanha_id),
      );
      return {
        key,
        influId: row.id,
        campanhaId: row.campanha_id,
        nome: row.data.nome,
        title,
        action: subtitle,
        at: action.at,
      };
    };

    void supabase
      .from("campanha_influenciadores")
      .select("id, campanha_id, data")
      .then(({ data: rows }) => {
        const typedRows = (rows ?? []) as { id: string; campanha_id: string; data: Influ }[];
        const actionItems = typedRows
          .map(toItem)
          .filter((x): x is ClienteActionItem => x !== null && !seenRef.current.has(x.key));
        // Etapa 4 do funil — badge de "métricas pendentes" (15+ dias sem
        // preencher), sem toast (não é uma ação em tempo real de alguém).
        const metricItems: ClienteActionItem[] = typedRows.flatMap((row) =>
          row.data.entregas
            .filter((e) => metricasPendentes(e))
            .map((e) => {
              const key = `metrics:${row.id}:${e.id}`;
              return seenRef.current.has(key)
                ? null
                : {
                    key,
                    influId: row.id,
                    campanhaId: row.campanha_id,
                    nome: row.data.nome,
                    title: row.data.nome,
                    action: `Métricas do post (${e.tipo}) pendentes há 15+ dias`,
                    at: e.publicadoEm ?? "",
                  };
            })
            .filter((x): x is ClienteActionItem => x !== null),
        );
        setItems([...actionItems, ...metricItems].sort((a, b) => (a.at < b.at ? 1 : -1)));
      });

    const channel = supabase
      .channel("rt-campanha-influenciadores-notify")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "campanha_influenciadores" },
        (payload) => {
          const newRow = payload.new as { id: string; campanha_id: string; data: Influ } | null;
          const oldRow = payload.old as { data?: Influ } | null;
          if (!newRow) return;
          const newAt = newRow.data.lastClientAction?.at;
          const oldAt = oldRow?.data?.lastClientAction?.at;
          if (!newAt || newAt === oldAt) return;
          const item = toItem(newRow);
          if (!item || seenRef.current.has(item.key)) return;
          setItems((prev) => [item, ...prev.filter((x) => x.key !== item.key)]);

          if (document.visibilityState === "visible") {
            void import("sonner").then(({ toast }) => {
              toast(item.title, {
                description: item.action,
                action: {
                  label: "Abrir",
                  onClick: () => {
                    try {
                      sessionStorage.setItem(
                        OPEN_CAMPANHA_TASK_KEY,
                        JSON.stringify({ campanhaId: item.campanhaId }),
                      );
                    } catch {
                      /* ignore */
                    }
                    window.dispatchEvent(new CustomEvent("nav:section", { detail: "campanhas" }));
                  },
                },
              });
            });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const dismiss = (keys: string[]) => {
    for (const k of keys) seenRef.current.add(k);
    localStorage.setItem(
      "notif:seenAprovacoesCliente",
      JSON.stringify(Array.from(seenRef.current)),
    );
    setItems((prev) => prev.filter((x) => !keys.includes(x.key)));
  };

  return { items, dismiss };
}

type ClientDemandItem = {
  key: string;
  campanhaId: string;
  taskId: string;
  title: string;
  action: string;
  at: string;
};

/** Assina `campanha_tarefas` (mesma tabela do board de Tarefas) e transforma
 * toda tarefa nova marcada com a tag "Cliente" (criada pelo cliente pelo
 * botão "Nova solicitação" no portal, ver `submitClientDemand` em
 * cliente-link.functions.ts) numa notificação no sino, com toast em tempo
 * real — mesmo padrão de `useCampanhaAprovacaoNotifier`. */
function useClientDemandNotifier(clientes: Cliente[]): {
  items: ClientDemandItem[];
  dismiss: (keys: string[]) => void;
} {
  const [items, setItems] = useState<ClientDemandItem[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const clientesRef = useRef(clientes);
  clientesRef.current = clientes;

  useEffect(() => {
    try {
      const raw = localStorage.getItem("notif:seenDemandasCliente");
      if (raw) seenRef.current = new Set(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }

    const empresaDaCampanha = (campanhaId: string): string | undefined =>
      clientesRef.current.find((c) => c.campanhas?.some((camp) => camp.id === campanhaId))?.empresa;

    const toItem = (row: {
      id: string;
      campanha_id: string;
      data: Task;
    }): ClientDemandItem | null => {
      if (!row.data.tags?.includes("Cliente")) return null;
      const key = `demand:${row.id}`;
      const empresa = empresaDaCampanha(row.campanha_id);
      return {
        key,
        campanhaId: row.campanha_id,
        taskId: row.id,
        title: empresa ? `${empresa} — Nova solicitação` : "Nova solicitação",
        action: row.data.title,
        at: row.data.createdAt,
      };
    };

    void supabase
      .from("campanha_tarefas")
      .select("id, campanha_id, data")
      .then(({ data: rows }) => {
        const typedRows = (rows ?? []) as { id: string; campanha_id: string; data: Task }[];
        const demandItems = typedRows
          .map(toItem)
          .filter((x): x is ClientDemandItem => x !== null && !seenRef.current.has(x.key));
        setItems(demandItems.sort((a, b) => (a.at < b.at ? 1 : -1)));
      });

    const channel = supabase
      .channel("rt-campanha-tarefas-demand-notify")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "campanha_tarefas" },
        (payload) => {
          const newRow = payload.new as { id: string; campanha_id: string; data: Task } | null;
          if (!newRow) return;
          const item = toItem(newRow);
          if (!item || seenRef.current.has(item.key)) return;
          setItems((prev) => [item, ...prev.filter((x) => x.key !== item.key)]);

          if (document.visibilityState === "visible") {
            void import("sonner").then(({ toast }) => {
              toast(item.title, {
                description: item.action,
                action: {
                  label: "Abrir",
                  onClick: () => {
                    try {
                      sessionStorage.setItem(
                        OPEN_CAMPANHA_TASK_KEY,
                        JSON.stringify({ campanhaId: item.campanhaId, taskId: item.taskId }),
                      );
                    } catch {
                      /* ignore */
                    }
                    window.dispatchEvent(new CustomEvent("nav:section", { detail: "campanhas" }));
                  },
                },
              });
            });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const dismiss = (keys: string[]) => {
    for (const k of keys) seenRef.current.add(k);
    localStorage.setItem("notif:seenDemandasCliente", JSON.stringify(Array.from(seenRef.current)));
    setItems((prev) => prev.filter((x) => !keys.includes(x.key)));
  };

  return { items, dismiss };
}

function NotificationsBell({ onSelect }: { onSelect: (key: SectionKey) => void }) {
  const [, force] = useState(0);
  useEffect(() => subscribeChat(() => force((n) => n + 1)), []);
  useEffect(() => onMeetingsChange(() => force((n) => n + 1)), []);
  const clientes = useClientes();
  const { items: aprovacaoItems, dismiss: dismissAprovacaoItems } =
    useCampanhaAprovacaoNotifier(clientes);
  const { items: demandItems, dismiss: dismissDemandItems } = useClientDemandNotifier(clientes);
  const outrosItems = [...aprovacaoItems, ...demandItems].sort((a, b) => (a.at < b.at ? 1 : -1));
  const dismissOutrosItems = (keys: string[]) => {
    dismissAprovacaoItems(keys);
    dismissDemandItems(keys);
  };
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<BellTab>("tarefas");
  const me = getMe();
  const messages = loadMessages();
  const lastRead = loadLastRead();
  const [prefs, setPrefs] = useState<NotifPrefs>(() => loadNotifPrefs());
  useEffect(() => subscribeNotifPrefs(() => setPrefs(loadNotifPrefs())), []);

  const channels = loadChannels();
  const campaigns = loadCampaignChannels(clientes);
  const projects = loadProjectChannels();
  const members = loadMembers();

  const labelFor = (convoId: string): string => {
    if (convoId.startsWith("dm:")) {
      const otherId = convoId
        .slice(3)
        .split("|")
        .find((x) => x !== me.id);
      return members.find((m) => m.id === otherId)?.name ?? "Mensagem direta";
    }
    if (convoId.startsWith("camp:"))
      return campaigns.find((c) => c.id === convoId)?.name ?? "Campanha";
    if (convoId.startsWith("proj:"))
      return projects.find((p) => p.id === convoId)?.name ?? "Projeto";
    return channels.find((c) => c.id === convoId)?.name ?? "Canal";
  };

  // Group unread messages by convo (excluding own, excluding active)
  const grouped = new Map<string, { count: number; last: (typeof messages)[number] }>();
  for (const m of messages) {
    if (m.authorId === me.id) continue;
    if (isConvoBeingViewed(m.convoId)) continue;
    const lr = lastRead[m.convoId] ?? 0;
    if (m.createdAt <= lr) continue;
    const prev = grouped.get(m.convoId);
    if (!prev || m.createdAt > prev.last.createdAt) {
      grouped.set(m.convoId, { count: (prev?.count ?? 0) + 1, last: m });
    } else {
      prev.count++;
    }
  }
  const chatItems = prefs.mensagens
    ? Array.from(grouped.entries())
        .map(([convoId, v]) => ({ convoId, ...v }))
        .sort((a, b) => b.last.createdAt - a.last.createdAt)
    : [];

  // Mentions to me across all convos (dismissed via seen store)
  const [seenMentions, markMentionsSeen] = useDurableSeenIds("notif:seenMentions");
  const [seenTasks, markTasksSeen] = useDurableSeenIds("notif:seenTasks");
  const [seenTaskActivity, markTaskActivitySeen] = useDurableSeenIds("notif:seenTaskActivity");
  const [seenMeetings, markMeetingsSeen] = useDurableSeenIds("notif:seenMeetings");
  const [seenReuniaoReagendamento, markReagendamentoSeen] = useDurableSeenIds(
    "notif:seenReuniaoReagendamento",
  );
  // Fase 7 da reconstrução de Reuniões: dois tipos de notificação que
  // faltavam no sino — cancelamento (quem foi convidado precisa saber que
  // não precisa mais comparecer) e falha de sincronização que exige ação
  // do criador (reconectar o Google), mesmo padrão dos dois acima.
  const [seenMeetingCancelamentos, markCancelamentosSeen] = useDurableSeenIds(
    "notif:seenMeetingCancelamentos",
  );
  const [seenMeetingSyncErrors, markSyncErrorsSeen] = useDurableSeenIds(
    "notif:seenMeetingSyncErrors",
  );

  const mentionItems = prefs.mencoes
    ? messages
        .filter(
          (m) =>
            m.authorId !== me.id &&
            !seenMentions.has(m.id) &&
            m.mentions?.some((x) => x.kind === "user" && x.id === me.id),
        )
        .sort((a, b) => b.createdAt - a.createdAt)
    : [];

  // Tasks assigned to me (open) across all projetos
  const projetos = loadProjetos();
  type TaskItem = {
    id: string;
    title: string;
    projectId: string;
    projectName: string;
    dueDate?: string;
  };
  const taskItems: TaskItem[] = [];
  if (prefs.tarefas) {
    for (const p of projetos) {
      for (const t of p.tasks ?? []) {
        if (
          t.status !== "Concluído" &&
          t.status !== "Arquivado" &&
          getTaskAssignees(t).some((a) => a === me.name || a === me.id) &&
          !seenTasks.has(t.id)
        ) {
          taskItems.push({
            id: t.id,
            title: t.title,
            projectId: p.id,
            projectName: p.name,
            dueDate: t.dueDate,
          });
        }
      }
    }
  }

  // Changes (status/assignment) to tasks I'm responsible for — mined from
  // each task's activity log, which is already written on every edit.
  type TaskActivityItem = {
    id: string;
    taskId: string;
    action: string;
    createdAt: string;
    projectId: string;
    projectName: string;
    taskTitle: string;
  };
  const taskActivityItems: TaskActivityItem[] = [];
  if (prefs.tarefaAtividade) {
    for (const p of projetos) {
      for (const t of p.tasks ?? []) {
        if (!getTaskAssignees(t).some((a) => a === me.name || a === me.id)) continue;
        for (const a of t.activity ?? []) {
          if (seenTaskActivity.has(a.id)) continue;
          if (!a.action.startsWith("mudou status para ") && !a.action.startsWith("atribuiu a "))
            continue;
          taskActivityItems.push({
            id: a.id,
            taskId: t.id,
            action: a.action,
            createdAt: a.createdAt,
            projectId: p.id,
            projectName: p.name,
            taskTitle: t.title,
          });
        }
      }
    }
    taskActivityItems.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  // Pending meeting requests where I'm one of the invited participants.
  // `meetingNeedsMyAction` já exclui ocorrências passadas e importadas do
  // Google (sem fluxo de convite na plataforma) — sem isso, uma série
  // recorrente de longa duração virava dezenas/centenas de notificações
  // de sino idênticas, uma por ocorrência, nunca resolvidas (bug do "629
  // pendentes" em Solicitações). O dedupe por `seriesId` abaixo garante o
  // mesmo critério "1 notificação por série" usado em Solicitações.
  const meetings = prefs.reunioes ? loadMeetings() : [];
  const pendingMeetingsRaw = meetings
    .filter((m) => m.participanteIds?.includes(me.id) && meetingNeedsMyAction(m, me.id))
    .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  const seenSeries = new Set<string>();
  const meetingItems = pendingMeetingsRaw.filter((m) => {
    const key = m.seriesId ?? m.id;
    if (seenSeries.has(key)) return false;
    seenSeries.add(key);
    return !seenMeetings.has(m.id);
  });
  const rescheduleItems = meetings.filter(
    (m) =>
      m.rescheduleProposal &&
      m.rescheduleProposal.proposedBy !== me.id &&
      (m.criadorId === me.id || m.participanteIds?.includes(me.id)) &&
      !seenReuniaoReagendamento.has(m.id),
  );
  // Cancelamento — só quem foi CONVIDADO precisa saber (quem cancelou é
  // sempre o criador, já que só ele vê "Editar" no drawer; não faz sentido
  // notificar a própria pessoa que agiu).
  const cancelamentoItems = meetings.filter(
    (m) =>
      m.status === "Cancelada" &&
      m.criadorId !== me.id &&
      m.participanteIds?.includes(me.id) &&
      !seenMeetingCancelamentos.has(m.id),
  );
  // Falha de sincronização — só o CRIADOR pode agir (reconectar a própria
  // conta Google em Configurações), então só ele recebe.
  const syncErrorItems = meetings.filter(
    (m) => m.criadorId === me.id && m.syncStatus === "error" && !seenMeetingSyncErrors.has(m.id),
  );

  const total =
    chatItems.reduce((s, i) => s + i.count, 0) +
    mentionItems.length +
    taskItems.length +
    taskActivityItems.length +
    meetingItems.length +
    rescheduleItems.length +
    cancelamentoItems.length +
    syncErrorItems.length;

  // Mesmo sino, mesmo contador — só reflete no favicon da aba pra dar
  // pra notar uma notificação pendente sem a aba estar em foco.
  useEffect(() => {
    void setFaviconBadge(total > 0);
  }, [total]);

  const openConversation = useOpenConversation();
  const openConvo = (id: string, messageId?: string) => {
    openConversation(id, messageId);
    setOpen(false);
  };

  const dismissMention = (mid: string) => markMentionsSeen([mid]);
  const dismissTask = (tid: string) => markTasksSeen([tid]);
  const dismissTaskActivity = (aid: string) => markTaskActivitySeen([aid]);
  const dismissMeeting = (mid: string) => markMeetingsSeen([mid]);
  const dismissReschedule = (mid: string) => markReagendamentoSeen([mid]);
  const dismissCancelamento = (mid: string) => markCancelamentosSeen([mid]);
  const dismissSyncError = (mid: string) => markSyncErrorsSeen([mid]);
  const tarefasCount = taskItems.length + taskActivityItems.length;
  const mensagensCount = chatItems.reduce((s, i) => s + i.count, 0) + mentionItems.length;
  const reunioesCount =
    meetingItems.length + rescheduleItems.length + cancelamentoItems.length + syncErrorItems.length;
  const outrosCount = outrosItems.length;

  const markTab = (t: BellTab) => {
    if (t === "tarefas") {
      markTasksSeen(taskItems.map((x) => x.id));
      markTaskActivitySeen(taskActivityItems.map((a) => a.id));
    } else if (t === "mensagens") {
      chatItems.forEach((i) => void markRead(i.convoId));
      markMentionsSeen(mentionItems.map((m) => m.id));
    } else if (t === "reunioes") {
      markMeetingsSeen(meetingItems.map((m) => m.id));
      markReagendamentoSeen(rescheduleItems.map((m) => m.id));
      markCancelamentosSeen(cancelamentoItems.map((m) => m.id));
      markSyncErrorsSeen(syncErrorItems.map((m) => m.id));
    } else if (t === "outros") {
      dismissOutrosItems(outrosItems.map((x) => x.key));
    }
  };

  const BELL_TABS: { key: BellTab; label: string; count: number }[] = [
    { key: "tarefas", label: "Tarefas", count: tarefasCount },
    { key: "mensagens", label: "Mensagens", count: mensagensCount },
    { key: "reunioes", label: "Reuniões", count: reunioesCount },
    { key: "outros", label: "Outros", count: outrosCount },
  ];

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
  };

  // `m.data` é "yyyy-mm-dd" (sem hora) — igual sameDay do fmtTime, mas a
  // partir de uma data+hora separadas em vez de um timestamp único.
  const fmtMeetingWhen = (m: Meeting) => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (m.data === todayStr) return m.hora;
    const [, mo, da] = m.data.split("-");
    return `${da}/${mo} ${m.hora}`;
  };

  const activeCount = BELL_TABS.find((t) => t.key === tab)?.count ?? 0;
  const isMobile = useIsMobile();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Partial<Record<BellTab, HTMLButtonElement | null>>>({});

  // Traz a categoria ativa pra área visível da faixa de tabs (relevante
  // quando ela rola horizontalmente em larguras intermediárias) e decide
  // qual aba abrir (a primeira com itens, preservando o comportamento
  // de antes) sempre que o painel abre.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      const firstWithItems = BELL_TABS.find((t) => t.count > 0);
      setTab(firstWithItems?.key ?? "tarefas");
    } else {
      // Restaura o foco no sino ao fechar (clique fora, Esc ou botão de
      // fechar) — nunca deixa o foco perdido na página.
      triggerRef.current?.focus();
    }
    setOpen(next);
  };
  useEffect(() => {
    if (open) tabRefs.current[tab]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [open, tab]);

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Notificações"
    >
      <Bell className="h-4 w-4" />
      {total > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground"
        >
          {total > 99 ? "99+" : total}
        </span>
      )}
    </button>
  );

  const header = (
    <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-4">
      <p className="text-sm font-semibold text-foreground">Notificações</p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={activeCount === 0}
          onClick={() => markTab(tab)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Marcar como lidas
        </Button>
        <IconButton label="Fechar" onClick={() => handleOpenChange(false)}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  );

  // Faixa de categorias: rola na horizontal sem barra visível (nenhum
  // plugin novo — `[&::-webkit-scrollbar]:hidden` + `scrollbarWidth`
  // inline cobrem Chrome/Safari e Firefox) em vez de cortar/comprimir os
  // 4 nomes; a categoria ativa nunca fica de fora graças ao
  // `scrollIntoView` acima. `bg-brand-subtle`/`text-brand` na ativa —
  // nunca mais o fundo quase-branco (`bg-foreground`) de antes.
  const tabsRow = (
    <div
      role="tablist"
      aria-label="Categorias de notificação"
      className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-3 [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {BELL_TABS.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[t.key] = el;
            }}
            role="tab"
            id={`bell-tab-${t.key}`}
            aria-selected={active}
            aria-controls={`bell-tabpanel-${t.key}`}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-brand-subtle text-brand" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className={cn(
                  "inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none",
                  active ? "bg-brand text-brand-foreground" : "bg-foreground/10 text-foreground",
                )}
              >
                {t.count > 99 ? "99+" : t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const listBody = (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {tab === "tarefas" && (
        <div role="tabpanel" id="bell-tabpanel-tarefas" aria-labelledby="bell-tab-tarefas">
          {taskItems.length === 0 && taskActivityItems.length === 0 && (
            <EmptyState
              compact
              icon={<CheckSquare className="h-4 w-4" />}
              title="Nenhuma notificação de tarefa"
            />
          )}
          {taskItems.map((t) => (
            <BellItem
              key={t.id}
              icon={<CheckSquare className="h-4 w-4" />}
              iconTone="info"
              title={t.title}
              subtitle={t.projectName}
              time={t.dueDate}
              onClick={() => {
                dismissTask(t.id);
                onSelect("projetos");
                setOpen(false);
              }}
              onMarkRead={() => dismissTask(t.id)}
            />
          ))}
          {taskActivityItems.map((a) => (
            <BellItem
              key={a.id}
              icon={<CheckSquare className="h-4 w-4" />}
              iconTone="brand"
              title={a.taskTitle}
              subtitle={`${a.action} · ${a.projectName}`}
              time={fmtTime(Date.parse(a.createdAt) || Date.now())}
              onClick={() => {
                dismissTaskActivity(a.id);
                onSelect("projetos");
                setOpen(false);
              }}
              onMarkRead={() => dismissTaskActivity(a.id)}
            />
          ))}
        </div>
      )}

      {tab === "mensagens" && (
        <div role="tabpanel" id="bell-tabpanel-mensagens" aria-labelledby="bell-tab-mensagens">
          {mentionItems.length === 0 && chatItems.length === 0 && (
            <EmptyState
              compact
              icon={<AtSign className="h-4 w-4" />}
              title="Nenhuma mensagem nova"
            />
          )}
          {mentionItems.map((m) => (
            <BellItem
              key={m.id}
              icon={<AtSign className="h-4 w-4" />}
              iconTone="brand"
              title={`${m.authorName} · ${labelFor(m.convoId)}`}
              subtitle={notificationSummary(m)}
              time={fmtTime(m.createdAt)}
              onClick={() => {
                dismissMention(m.id);
                openConvo(m.convoId, m.id);
              }}
              onMarkRead={() => dismissMention(m.id)}
            />
          ))}
          {chatItems.map((i) => (
            <BellItem
              key={i.convoId}
              icon={<MessageSquare className="h-4 w-4" />}
              iconTone="brand"
              title={labelFor(i.convoId)}
              subtitle={
                <>
                  <span className="font-medium text-foreground/80">{i.last.authorName}:</span>{" "}
                  {notificationSummary(i.last)}
                </>
              }
              time={fmtTime(i.last.createdAt)}
              badge={i.count}
              onClick={() => openConvo(i.convoId, i.last.id)}
              onMarkRead={() => void markRead(i.convoId)}
            />
          ))}
        </div>
      )}

      {tab === "reunioes" && (
        <div role="tabpanel" id="bell-tabpanel-reunioes" aria-labelledby="bell-tab-reunioes">
          {meetingItems.length === 0 &&
            rescheduleItems.length === 0 &&
            cancelamentoItems.length === 0 &&
            syncErrorItems.length === 0 && (
              <EmptyState
                compact
                icon={<CalendarClock className="h-4 w-4" />}
                title="Nenhuma notificação de reunião"
              />
            )}
          {meetingItems.map((m) => (
            <BellItem
              key={m.id}
              icon={<CalendarClock className="h-4 w-4" />}
              iconTone="warning"
              title={m.titulo}
              subtitle="Aguardando confirmação"
              time={fmtMeetingWhen(m)}
              onClick={() => {
                dismissMeeting(m.id);
                onSelect("reunioes");
                setOpen(false);
              }}
              onMarkRead={() => dismissMeeting(m.id)}
            />
          ))}
          {rescheduleItems.map((m) => (
            <BellItem
              key={m.id}
              icon={<CalendarClock className="h-4 w-4" />}
              iconTone="warning"
              title={m.titulo}
              subtitle={`Novo horário sugerido${
                m.rescheduleProposal?.proposedByName
                  ? ` por ${m.rescheduleProposal.proposedByName}`
                  : ""
              }`}
              time={fmtMeetingWhen(m)}
              onClick={() => {
                dismissReschedule(m.id);
                onSelect("reunioes");
                setOpen(false);
              }}
              onMarkRead={() => dismissReschedule(m.id)}
            />
          ))}
          {cancelamentoItems.map((m) => (
            <BellItem
              key={m.id}
              icon={<X className="h-4 w-4" />}
              iconTone="danger"
              title={m.titulo}
              subtitle="Reunião cancelada"
              time={fmtMeetingWhen(m)}
              onClick={() => {
                dismissCancelamento(m.id);
                onSelect("reunioes");
                setOpen(false);
              }}
              onMarkRead={() => dismissCancelamento(m.id)}
            />
          ))}
          {syncErrorItems.map((m) => (
            <BellItem
              key={m.id}
              icon={<AlertTriangle className="h-4 w-4" />}
              iconTone="danger"
              title={m.titulo}
              subtitle="Falha ao sincronizar com o Google Calendar"
              time={fmtMeetingWhen(m)}
              onClick={() => {
                dismissSyncError(m.id);
                onSelect("reunioes");
                setOpen(false);
              }}
              onMarkRead={() => dismissSyncError(m.id)}
            />
          ))}
        </div>
      )}

      {tab === "outros" && (
        <div role="tabpanel" id="bell-tabpanel-outros" aria-labelledby="bell-tab-outros">
          {outrosItems.length === 0 && (
            <EmptyState
              compact
              icon={<Users className="h-4 w-4" />}
              title="Nenhuma notificação por aqui ainda"
            />
          )}
          {outrosItems.map((it) => (
            <BellItem
              key={it.key}
              icon={<Users className="h-4 w-4" />}
              iconTone={it.action.toLowerCase().includes("reprovou") ? "danger" : "success"}
              title={it.title}
              subtitle={it.action}
              time={fmtTime(Date.parse(it.at) || Date.now())}
              onClick={() => {
                dismissOutrosItems([it.key]);
                try {
                  sessionStorage.setItem(
                    OPEN_CAMPANHA_TASK_KEY,
                    JSON.stringify({
                      campanhaId: it.campanhaId,
                      taskId: "taskId" in it ? it.taskId : undefined,
                    }),
                  );
                } catch {
                  /* ignore */
                }
                onSelect("campanhas");
                setOpen(false);
              }}
              onMarkRead={() => dismissOutrosItems([it.key])}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent
          className={cn(
            "flex max-h-[85vh] flex-col gap-0 border-t p-0 pb-[env(safe-area-inset-bottom)]",
            SURFACE.raised,
          )}
        >
          <DrawerHeader className="sr-only">
            <DrawerTitle>Notificações</DrawerTitle>
            <DrawerDescription>Lista de notificações por categoria</DrawerDescription>
          </DrawerHeader>
          {header}
          {tabsRow}
          <div className="shrink-0 border-t border-border/60" />
          {listBody}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className={cn(
          "z-50 flex flex-col gap-0 overflow-hidden rounded-2xl border-border/60 p-0 shadow-lg",
          SURFACE.raised,
        )}
        style={{
          width: "min(420px, calc(100vw - 24px))",
          maxHeight: "min(32rem, calc(100vh - 24px))",
        }}
      >
        {header}
        {tabsRow}
        <div className="shrink-0 border-t border-border/60" />
        {listBody}
      </PopoverContent>
    </Popover>
  );
}
