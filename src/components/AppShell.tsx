import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
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
  Bug,
} from "lucide-react";
import { loadProjetos, onProjetosChange, loadTeamMembers, getTaskAssignees } from "@/lib/projetos";
import { metricasPendentes, type Influ } from "@/components/influenciadores/InfluencerBoard";
import { getAllCampanhaTarefas, onCampanhaTarefasChange } from "@/lib/campanha-scoped-store";
import { loadStandalone, onStandaloneChange } from "@/lib/marketing-tasks";
import type { Task } from "@/components/tasks/TaskBoard";
import { supabase } from "@/integrations/supabase/client";
import { getTheme, setTheme } from "@/lib/theme";
import { setFaviconBadge } from "@/lib/favicon-badge";
import { SidebarProfile, BugsReportadosTab } from "./ConfiguracoesSection";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadWorkspace, subscribeWorkspace, type Workspace } from "@/lib/workspace-store";
import { BomDiaDialog } from "./BomDiaDialog";
import { BugReportButton } from "./BugReportButton";
import { VersionWatcher } from "./VersionWatcher";
import { MeetingReminderToast } from "./MeetingReminderToast";
import {
  getMe,
  loadMembers,
  loadChannels,
  loadMessages,
  loadCampaignChannels,
  loadProjectChannels,
  setActive as setActiveConvo,
  useActiveConvo,
  subscribeChat,
  loadLastRead,
  markRead,
  getActive,
  playNotifSound,
  primeNotifSound,
} from "@/lib/chat-store";

import { useClientes, type Cliente } from "@/lib/clientes-store";
import { type NotifPrefs, loadNotifPrefs, subscribeNotifPrefs } from "@/lib/notif-prefs";
import { loadMeetings, onMeetingsChange, meetingNeedsMyAction } from "@/lib/reunioes-store";
import { useFinanceiroEntries, loadPaid, todayISO } from "@/lib/financeiro-entries";
import { useMyAccess, hasPermission, SECTION_PERMISSION } from "@/lib/permissions";
import { useRunningTimer, stopTimer } from "@/lib/time-entries";
import { toast } from "sonner";
import { idbAuthStorage } from "@/lib/idb-auth-storage";
import { TaskModalStack } from "@/components/tasks/TaskModalStack";

export type SectionKey =
  | "inicio"
  | "clientes"
  | "campanhas"
  | "projetos"
  | "reunioes"
  | "comercial"
  | "financeiro"
  | "time"
  | "influenciadores"
  | "metas"
  | "chat"
  | "configuracoes";

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
    title: "Vendas & Finanças",
    items: [
      { key: "comercial", label: "Comercial", icon: TrendingUp },
      { key: "financeiro", label: "Financeiro", icon: Wallet },
    ],
  },
  {
    title: "Estrutura",
    items: [
      { key: "time", label: "Time", icon: UserCog },
      { key: "influenciadores", label: "Banco de influenciadores", icon: Star },
      { key: "metas", label: "Metas", icon: Target },
    ],
  },
  {
    title: "Comunicação",
    items: [{ key: "chat", label: "Chat", icon: MessageSquare }],
  },
];

/** Existe alguma mensagem não lida (fora da conversa aberta agora) em
 * qualquer canal/DM? Usado só pra bolinha do item "Chat" no menu — os
 * detalhes (por conversa) ficam no sino de notificações.
 *
 * `chatSectionOpen` (true só quando a seção Chat está de fato aberta na
 * tela) é o que decide se a conversa "ativa" conta como lida — `activeId`
 * vem do localStorage e nunca é limpo ao sair do Chat/fechar a aba, então
 * sem essa checagem a última conversa aberta ficava permanentemente "lida"
 * pra sempre (mesmo com o usuário em outra seção ou dias depois), fazendo
 * mensagens novas nela nunca acenderem a bolinha de notificação. */
function useHasUnreadChat(chatSectionOpen: boolean): boolean {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeChat(() => setTick((t) => t + 1)), []);
  const activeId = useActiveConvo();
  return useMemo(() => {
    void tick;
    const me = getMe();
    const lastRead = loadLastRead();
    for (const m of loadMessages()) {
      if (m.authorId === me.id) continue;
      if (chatSectionOpen && m.convoId === activeId) continue;
      if (m.createdAt > (lastRead[m.convoId] ?? 0)) return true;
    }
    return false;
  }, [tick, activeId, chatSectionOpen]);
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
  const [paidTick, setPaidTick] = useState(0);
  useEffect(() => {
    const onStorage = () => setPaidTick((t) => t + 1);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return useMemo(() => {
    void paidTick;
    const paid = loadPaid();
    const today = todayISO();
    return entries.some((e) => e.kind === "despesa" && !paid[e.id] && e.date < today);
  }, [entries, paidTick]);
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
  const hasUnreadChat = useHasUnreadChat(active === "chat");
  const hasPendingMeetings = useHasPendingMeetingRequests();
  const hasOverdueDespesas = useHasOverdueDespesas();
  const { unseenCount: unseenLeads, markSeen: markLeadsSeen } = useLeadNotifications();
  const access = useMyAccess();
  const [bugsOpen, setBugsOpen] = useState(false);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const showFull = !collapsed || mobileOpen;
  useEffect(() => {
    setMobileOpen(false);
  }, [active]);
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
      <VersionWatcher />
      <MeetingReminderToast />
      <BugReportButton />
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

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <div key={group.title} className="mb-4">
              {showFull && (
                <div className="px-2 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </div>
              )}
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const isActive = active === item.key;
                  const Icon = item.icon;
                  const allowed = hasPermission(access, SECTION_PERMISSION[item.key]);
                  const showDot =
                    allowed &&
                    ((item.key === "chat" && hasUnreadChat) ||
                      (item.key === "comercial" && unseenLeads > 0) ||
                      (item.key === "reunioes" && hasPendingMeetings));
                  const showOverdueWarning =
                    allowed && item.key === "financeiro" && hasOverdueDespesas;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        disabled={!allowed}
                        onClick={() => {
                          if (!allowed) return;
                          onSelect(item.key);
                          if (item.key === "comercial") void markLeadsSeen();
                        }}
                        title={
                          !allowed
                            ? "Sem permissão para acessar esta seção"
                            : showOverdueWarning
                              ? "Há despesas vencidas"
                              : !showFull
                                ? item.label
                                : undefined
                        }
                        className={`relative flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                          !showFull ? "justify-center" : ""
                        } ${
                          !allowed
                            ? "cursor-not-allowed text-muted-foreground/40"
                            : `pill-nav-item ${isActive ? "pill-nav-item-active font-medium" : "text-muted-foreground"}`
                        }`}
                      >
                        <span className="relative shrink-0">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {showDot && !showFull && (
                            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive" />
                          )}
                          {showOverdueWarning && !showFull && (
                            <AlertTriangle className="absolute -right-1.5 -top-1.5 h-3 w-3 fill-amber-500 text-background" />
                          )}
                          {!allowed && (
                            <Lock className="absolute -right-1 -top-1 h-2.5 w-2.5 text-muted-foreground/60" />
                          )}
                        </span>
                        {showFull && (
                          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                            {item.label}
                            {showDot && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                            )}
                            {showOverdueWarning && (
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 fill-amber-500 text-background" />
                            )}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border bg-background">
          {showFull && <SidebarProfile />}

          <div className="border-t border-border p-3">
            <button
              type="button"
              onClick={() => onSelect("configuracoes")}
              title={!showFull ? "Configurações" : undefined}
              className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors pill-nav-item ${
                !showFull ? "justify-center" : ""
              } ${
                active === "configuracoes"
                  ? "pill-nav-item-active font-medium"
                  : "text-muted-foreground"
              }`}
            >
              <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
              {showFull && "Configurações"}
            </button>
            {access?.isAdmin && (
              <button
                type="button"
                onClick={() => setBugsOpen(true)}
                title={!showFull ? "Bugs reportados" : undefined}
                className={`mt-1 flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors pill-nav-item ${
                  !showFull ? "justify-center" : ""
                }`}
              >
                <Bug className="h-4 w-4 shrink-0" aria-hidden="true" />
                {showFull && "Bugs reportados"}
              </button>
            )}
          </div>
        </div>
      </aside>

      {access?.isAdmin && (
        <Dialog open={bugsOpen} onOpenChange={setBugsOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="sr-only">Bugs reportados</DialogTitle>
            </DialogHeader>
            <BugsReportadosTab />
          </DialogContent>
        </Dialog>
      )}

      <div className="flex h-screen min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-3 border-b border-border px-6">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Abrir menu"
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

  return (
    <div className="relative flex-1 max-w-2xl">
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

      {open && query && (
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

function useIncomingMessageNotifier() {
  useEffect(() => {
    // Unlock audio + request browser notification permission on the first
    // user gesture (browsers block AudioContext/Notification before that).
    const unlock = () => {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        void ctx.resume().catch(() => {});
        setTimeout(() => ctx.close().catch(() => {}), 200);
      } catch {
        /* noop */
      }
      primeNotifSound();
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    const seen = new Set<string>();
    const mountedAt = Date.now();
    // Seed with messages already loaded so they don't beep on mount
    loadMessages().forEach((m) => seen.add(m.id));

    const notify = async (m: ReturnType<typeof loadMessages>[number]) => {
      const members = loadMembers();
      const channels = loadChannels();
      const clientes = (() => {
        try {
          return JSON.parse(localStorage.getItem("clientes") ?? "[]");
        } catch {
          return [];
        }
      })();
      const campaigns = loadCampaignChannels(clientes as never);
      const projects = loadProjectChannels();
      const me = getMe();
      let convoLabel = "Nova mensagem";
      if (m.convoId.startsWith("dm:")) convoLabel = m.authorName;
      else if (m.convoId.startsWith("camp:"))
        convoLabel = campaigns.find((c) => c.id === m.convoId)?.name ?? "Campanha";
      else if (m.convoId.startsWith("proj:"))
        convoLabel = projects.find((p) => p.id === m.convoId)?.name ?? "Projeto";
      else convoLabel = channels.find((c) => c.id === m.convoId)?.name ?? "Canal";

      const bodyText = m.text?.trim() || (m.attachments?.length ? "📎 Anexo" : "");
      const title = m.convoId.startsWith("dm:") ? m.authorName : `${m.authorName} · ${convoLabel}`;

      playNotifSound();

      // In-app toast (always shown when tab is visible)
      if (document.visibilityState === "visible") {
        const { toast } = await import("sonner");
        toast(title, {
          description: bodyText,
          action: {
            label: "Abrir",
            onClick: () => {
              setActiveConvo(m.convoId);
              window.dispatchEvent(new CustomEvent("nav:section", { detail: "chat" }));
            },
          },
        });
      } else if ("Notification" in window && Notification.permission === "granted") {
        // OS notification when tab is hidden
        try {
          const n = new Notification(title, {
            body: bodyText,
            icon: m.authorPhoto || undefined,
            tag: m.convoId,
          });
          n.onclick = () => {
            window.focus();
            setActiveConvo(m.convoId);
            window.dispatchEvent(new CustomEvent("nav:section", { detail: "chat" }));
            n.close();
          };
        } catch {
          /* ignore */
        }
      }
      void members;
      void me;
    };

    const check = () => {
      const me = getMe();
      const active = getActive();
      const isVisible = document.visibilityState === "visible";
      const msgs = loadMessages();
      for (const m of msgs) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        // Skip anything that predates mount (initial batch loads async)
        if (m.createdAt < mountedAt - 2000) continue;
        if (m.authorId === me.id) continue;
        // Suppress when the user is actively viewing that conversation
        if (isVisible && m.convoId === active) continue;
        void notify(m);
      }
    };
    return subscribeChat(check);
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

function BellItem({
  icon,
  iconTone,
  title,
  subtitle,
  time,
  badge,
  onClick,
}: {
  icon: ReactNode;
  iconTone: string;
  title: ReactNode;
  subtitle: ReactNode;
  time?: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconTone}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold text-foreground">{title}</span>
          {time && <span className="shrink-0 text-[10px] text-muted-foreground">{time}</span>}
        </div>
        <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      {!!badge && (
        <span className="mt-0.5 inline-flex min-w-[16px] shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
          {badge}
        </span>
      )}
    </button>
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
  const active = useActiveConvo();
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
    if (m.convoId === active) continue;
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
  const meetings = prefs.reunioes ? loadMeetings() : [];
  const meetingItems = meetings.filter(
    (m) => m.status === "Pendente" && m.participanteIds?.includes(me.id) && !seenMeetings.has(m.id),
  );
  const rescheduleItems = meetings.filter(
    (m) =>
      m.rescheduleProposal &&
      m.rescheduleProposal.proposedBy !== me.id &&
      (m.criadorId === me.id || m.participanteIds?.includes(me.id)) &&
      !seenReuniaoReagendamento.has(m.id),
  );

  const total =
    chatItems.reduce((s, i) => s + i.count, 0) +
    mentionItems.length +
    taskItems.length +
    taskActivityItems.length +
    meetingItems.length +
    rescheduleItems.length;

  // Mesmo sino, mesmo contador — só reflete no favicon da aba pra dar
  // pra notar uma notificação pendente sem a aba estar em foco.
  useEffect(() => {
    void setFaviconBadge(total > 0);
  }, [total]);

  const openConvo = (id: string) => {
    setActiveConvo(id);
    onSelect("chat");
    setOpen(false);
  };

  const dismissMention = (mid: string) => markMentionsSeen([mid]);
  const dismissTask = (tid: string) => markTasksSeen([tid]);
  const dismissTaskActivity = (aid: string) => markTaskActivitySeen([aid]);
  const dismissMeeting = (mid: string) => markMeetingsSeen([mid]);
  const dismissReschedule = (mid: string) => markReagendamentoSeen([mid]);
  const tarefasCount = taskItems.length + taskActivityItems.length;
  const mensagensCount = chatItems.reduce((s, i) => s + i.count, 0) + mentionItems.length;
  const reunioesCount = meetingItems.length + rescheduleItems.length;
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

  const openBell = () => {
    setOpen((o) => {
      const next = !o;
      if (next) {
        const firstWithItems = BELL_TABS.find((t) => t.count > 0);
        setTab(firstWithItems?.key ?? "tarefas");
      }
      return next;
    });
  };

  const activeCount = BELL_TABS.find((t) => t.key === tab)?.count ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openBell}
        className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Notificações"
      >
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold text-foreground">Notificações</span>
              {activeCount > 0 && (
                <button
                  onClick={() => markTab(tab)}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Marcar esta aba como lida
                </button>
              )}
            </div>

            <div className="flex gap-1 border-b border-border px-2 pb-2">
              {BELL_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    tab === t.key
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t.label}
                  {t.count > 0 && (
                    <span
                      className={`inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-4 ${
                        tab === t.key
                          ? "bg-background/20 text-background"
                          : "bg-destructive text-destructive-foreground"
                      }`}
                    >
                      {t.count > 99 ? "99+" : t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="max-h-[26rem] overflow-y-auto p-1.5">
              {tab === "tarefas" && (
                <>
                  {taskItems.length === 0 && taskActivityItems.length === 0 && (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                      Nenhuma notificação de tarefa
                    </p>
                  )}
                  {taskItems.map((t) => (
                    <BellItem
                      key={t.id}
                      icon={<CheckSquare className="h-4 w-4" />}
                      iconTone="bg-sky-500/15 text-sky-600 dark:text-sky-400"
                      title={t.title}
                      subtitle={t.projectName}
                      time={t.dueDate}
                      onClick={() => {
                        dismissTask(t.id);
                        onSelect("projetos");
                        setOpen(false);
                      }}
                    />
                  ))}
                  {taskActivityItems.map((a) => (
                    <BellItem
                      key={a.id}
                      icon={<CheckSquare className="h-4 w-4" />}
                      iconTone="bg-violet-500/15 text-violet-600 dark:text-violet-400"
                      title={a.taskTitle}
                      subtitle={`${a.action} · ${a.projectName}`}
                      onClick={() => {
                        dismissTaskActivity(a.id);
                        onSelect("projetos");
                        setOpen(false);
                      }}
                    />
                  ))}
                </>
              )}

              {tab === "mensagens" && (
                <>
                  {mentionItems.length === 0 && chatItems.length === 0 && (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                      Nenhuma mensagem nova
                    </p>
                  )}
                  {mentionItems.map((m) => (
                    <BellItem
                      key={m.id}
                      icon={<AtSign className="h-4 w-4" />}
                      iconTone="bg-primary/15 text-primary"
                      title={`${m.authorName} · ${labelFor(m.convoId)}`}
                      subtitle={m.text}
                      time={fmtTime(m.createdAt)}
                      onClick={() => {
                        dismissMention(m.id);
                        openConvo(m.convoId);
                      }}
                    />
                  ))}
                  {chatItems.map((i) => (
                    <BellItem
                      key={i.convoId}
                      icon={<MessageSquare className="h-4 w-4" />}
                      iconTone="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      title={labelFor(i.convoId)}
                      subtitle={
                        <>
                          <span className="font-medium text-foreground/80">
                            {i.last.authorName}:
                          </span>{" "}
                          {i.last.text}
                        </>
                      }
                      time={fmtTime(i.last.createdAt)}
                      badge={i.count}
                      onClick={() => openConvo(i.convoId)}
                    />
                  ))}
                </>
              )}

              {tab === "reunioes" && (
                <>
                  {meetingItems.length === 0 && rescheduleItems.length === 0 && (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                      Nenhuma notificação de reunião
                    </p>
                  )}
                  {meetingItems.map((m) => (
                    <BellItem
                      key={m.id}
                      icon={<CalendarClock className="h-4 w-4" />}
                      iconTone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      title={m.titulo}
                      subtitle="Aguardando confirmação"
                      onClick={() => {
                        dismissMeeting(m.id);
                        onSelect("reunioes");
                        setOpen(false);
                      }}
                    />
                  ))}
                  {rescheduleItems.map((m) => (
                    <BellItem
                      key={m.id}
                      icon={<CalendarClock className="h-4 w-4" />}
                      iconTone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      title={m.titulo}
                      subtitle={`Novo horário sugerido${
                        m.rescheduleProposal?.proposedByName
                          ? ` por ${m.rescheduleProposal.proposedByName}`
                          : ""
                      }`}
                      onClick={() => {
                        dismissReschedule(m.id);
                        onSelect("reunioes");
                        setOpen(false);
                      }}
                    />
                  ))}
                </>
              )}

              {tab === "outros" && (
                <>
                  {outrosItems.length === 0 && (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                      Nenhuma notificação por aqui ainda
                    </p>
                  )}
                  {outrosItems.map((it) => (
                    <BellItem
                      key={it.key}
                      icon={<Users className="h-4 w-4" />}
                      iconTone={
                        it.action.toLowerCase().includes("reprovou")
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      }
                      title={it.title}
                      subtitle={it.action}
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
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
