import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  MessageSquare,
  Settings,
  Search,
  Bell,
  Moon,
  Sun,
  PanelLeft,
  Menu,
  Hash,
  Plus,
  Lock,
  Trash2,
  Pencil,
  X,
  AtSign,
  CheckSquare,
  CalendarClock,
  Trophy,
  Timer,
} from "lucide-react";
import { loadProjetos, onProjetosChange, loadTeamMembers, getTaskAssignees } from "@/lib/projetos";
import { getAllCampanhaTarefas, onCampanhaTarefasChange } from "@/lib/campanha-scoped-store";
import { supabase } from "@/integrations/supabase/client";
import { getTheme, setTheme } from "@/lib/theme";
import { SidebarProfile } from "./ConfiguracoesSection";
import { CreateChannelModal } from "./CreateChannelModal";
import { loadWorkspace, subscribeWorkspace, type Workspace } from "@/lib/workspace-store";
import { BomDiaDialog } from "./BomDiaDialog";
import { VersionWatcher } from "./VersionWatcher";
import { MeetingReminderToast } from "./MeetingReminderToast";
import {
  getMe,
  loadMembers,
  loadChannels,
  createChannel,
  updateChannel,
  deleteChannel as deleteChannelDb,
  reorderChannels,
  loadMessages,
  loadCampaignChannels,
  loadProjectChannels,
  setActive as setActiveConvo,
  useActiveConvo,
  subscribeChat,
  dmId,
  getStatus,
  STATUS_COLOR,
  STATUS_LABEL,
  getUnreadCount,
  loadLastRead,
  markRead,
  getActive,
  playNotifSound,
  type ChatChannel,
} from "@/lib/chat-store";

import { useClientes } from "@/lib/clientes-store";
import { useConfirm } from "@/hooks/use-confirm";
import { type NotifPrefs, loadNotifPrefs, subscribeNotifPrefs } from "@/lib/notif-prefs";
import { loadMeetings, onMeetingsChange, meetingNeedsMyAction } from "@/lib/reunioes-store";
import { useMyAccess, hasPermission, SECTION_PERMISSION } from "@/lib/permissions";

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
  | "gestao"
  | "chat"
  | "configuracoes";

/** Usado pra abrir uma campanha + tarefa específica ao clicar no indicador
 * de timer ativo — CampanhasSection lê isso ao montar (não é URL-driven
 * ainda, então esse é o jeito de passar "abre essa tarefa" na navegação). */
export const OPEN_CAMPANHA_TASK_KEY = "campanhas:openTask";

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
      { key: "gestao", label: "Gestão", icon: Trophy },
      { key: "influenciadores", label: "Banco de influenciadores", icon: Star },
    ],
  },
  {
    title: "Comunicação",
    items: [{ key: "chat", label: "Chat", icon: MessageSquare }],
  },
];

/** Existe alguma mensagem não lida (fora da conversa aberta agora) em
 * qualquer canal/DM? Usado só pra bolinha do item "Chat" no menu — os
 * detalhes (por conversa) ficam no sino de notificações. */
function useHasUnreadChat(): boolean {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeChat(() => setTick((t) => t + 1)), []);
  const activeId = useActiveConvo();
  return useMemo(() => {
    void tick;
    const me = getMe();
    const lastRead = loadLastRead();
    for (const m of loadMessages()) {
      if (m.authorId === me.id) continue;
      if (m.convoId === activeId) continue;
      if (m.createdAt > (lastRead[m.convoId] ?? 0)) return true;
    }
    return false;
  }, [tick, activeId]);
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
  const hasUnreadChat = useHasUnreadChat();
  const hasPendingMeetings = useHasPendingMeetingRequests();
  const { unseenCount: unseenLeads, markSeen: markLeadsSeen } = useLeadNotifications();
  const access = useMyAccess();

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
                          </span>
                        )}
                      </button>
                      {item.key === "chat" && isActive && showFull && (
                        <ChatSubNav onSelect={onSelect} />
                      )}
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
          </div>
        </div>
      </aside>

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

function ChatSubNav({ onSelect }: { onSelect: (key: SectionKey) => void }) {
  const [, force] = useState(0);
  useEffect(() => subscribeChat(() => force((n) => n + 1)), []);
  const clientes = useClientes();

  const me = getMe();
  const members = loadMembers();
  const otherMembers = members.filter((m) => m.id !== me.id);
  const channels = loadChannels();
  const campaigns = loadCampaignChannels(clientes);
  const projects = loadProjectChannels();
  const activeId = useActiveConvo();
  const allMessages = loadMessages();
  const unread = (id: string) => (id === activeId ? 0 : getUnreadCount(id, allMessages, me.id));

  const go = (id: string) => {
    setActiveConvo(id);
    onSelect("chat");
  };

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ChatChannel | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const handleCreateChannel = async (payload: {
    name: string;
    photo?: string;
    private: boolean;
    allowedMemberIds?: string[];
  }) => {
    if (editing) {
      await updateChannel(editing.id, {
        name: payload.name,
        photo: payload.photo,
        private: payload.private,
        allowedMemberIds: payload.allowedMemberIds,
      });
      setEditing(null);
      setShowCreate(false);
      return;
    }
    if (channels.some((c) => c.name === payload.name)) return;
    const ch = await createChannel({
      name: payload.name,
      private: payload.private,
      photo: payload.photo,
      allowedMemberIds: payload.allowedMemberIds,
    });
    setShowCreate(false);
    if (ch) go(ch.id);
  };

  const editChannel = (c: ChatChannel, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(c);
    setShowCreate(true);
  };

  const deleteChannel = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm("Excluir este canal e todas as suas mensagens?");
    if (!ok) return;
    await deleteChannelDb(id);
    if (activeId === id) {
      const remaining = channels.filter((c) => c.id !== id);
      setActiveConvo(remaining[0]?.id ?? "");
    }
  };

  const [dragId, setDragId] = useState<string | null>(null);
  const reorderChannel = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const list = [...channels];
    const from = list.findIndex((c) => c.id === fromId);
    const to = list.findIndex((c) => c.id === toId);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    void reorderChannels(list.map((c) => c.id));
  };

  const itemCls = (isActive: boolean) =>
    `flex flex-1 items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
      isActive
        ? "bg-foreground/10 font-medium text-foreground"
        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
    }`;

  return (
    <div className="ml-2 mt-1 space-y-3 border-l border-border pl-2">
      <div>
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Canais
          </span>
          <button
            onClick={() => setShowCreate(true)}
            aria-label="Novo canal"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <ul className="space-y-0.5">
          {channels
            .filter((c) => !c.private || !c.allowedMemberIds || c.allowedMemberIds.includes(me.id))
            .map((c) => (
              <li
                key={c.id}
                draggable
                onDragStart={() => setDragId(c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) reorderChannel(dragId, c.id);
                  setDragId(null);
                }}
                onDragEnd={() => setDragId(null)}
                className={`group flex items-center ${dragId === c.id ? "opacity-40" : ""}`}
              >
                <button onClick={() => go(c.id)} className={itemCls(activeId === c.id)}>
                  {c.photo ? (
                    <img src={c.photo} alt="" className="h-4 w-4 shrink-0 rounded object-cover" />
                  ) : c.private ? (
                    <Lock className="h-3 w-3 shrink-0" />
                  ) : (
                    <Hash className="h-3 w-3 shrink-0" />
                  )}
                  <span
                    className={`truncate ${unread(c.id) ? "font-semibold text-foreground" : ""}`}
                  >
                    {c.name}
                  </span>
                  {c.private && c.photo && (
                    <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <UnreadBadge count={unread(c.id)} />
                </button>
                <button
                  onClick={(e) => editChannel(c, e)}
                  aria-label="Editar canal"
                  className="ml-0.5 rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => deleteChannel(c.id, e)}
                  aria-label="Excluir canal"
                  className="ml-0.5 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
        </ul>
      </div>

      {campaigns.length > 0 && (
        <div>
          <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Campanhas
          </div>
          <ul className="space-y-0.5">
            {campaigns.map((c) => (
              <li key={c.id} className="flex items-center">
                <button onClick={() => go(c.id)} className={itemCls(activeId === c.id)}>
                  <Hash className="h-3 w-3 shrink-0" />
                  <span
                    className={`truncate ${unread(c.id) ? "font-semibold text-foreground" : ""}`}
                  >
                    {c.name}
                  </span>
                  <UnreadBadge count={unread(c.id)} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {projects.length > 0 && (
        <div>
          <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Projetos
          </div>
          <ul className="space-y-0.5">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center">
                <button onClick={() => go(p.id)} className={itemCls(activeId === p.id)}>
                  <Hash className="h-3 w-3 shrink-0" />
                  <span
                    className={`truncate ${unread(p.id) ? "font-semibold text-foreground" : ""}`}
                  >
                    {p.name}
                  </span>
                  <UnreadBadge count={unread(p.id)} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Mensagens diretas
        </div>
        {otherMembers.length === 0 ? (
          <p className="px-2 py-1 text-[11px] text-muted-foreground">
            Adicione membros na aba Time.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {otherMembers.map((m) => {
              const id = dmId(me.id, m.id);
              const status = getStatus(m.id);
              return (
                <li key={m.id} className="flex items-center">
                  <button onClick={() => go(id)} className={itemCls(activeId === id)}>
                    <span className="relative h-5 w-5 shrink-0">
                      {m.photo ? (
                        <img src={m.photo} alt="" className="h-5 w-5 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground">
                          {m.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span
                        title={STATUS_LABEL[status]}
                        className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-background ${STATUS_COLOR[status]}`}
                      />
                    </span>
                    <span
                      className={`truncate ${unread(id) ? "font-semibold text-foreground" : ""}`}
                    >
                      {m.name}
                    </span>
                    <UnreadBadge count={unread(id)} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {showCreate && (
        <CreateChannelModal
          members={members}
          meId={me.id}
          existingNames={channels.map((c) => c.name)}
          initial={editing}
          onCreate={handleCreateChannel}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
        />
      )}
      {confirmDialog}
    </div>
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto inline-flex min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
      {count > 99 ? "99+" : count}
    </span>
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
function ActiveTimerIndicator({ onSelect }: { onSelect: (key: SectionKey) => void }) {
  const me = getMe();
  const navigate = useNavigate();
  const [tick, force] = useState(0);
  useEffect(() => onProjetosChange(() => force((n) => n + 1)), []);
  useEffect(() => onCampanhaTarefasChange(() => force((n) => n + 1)), []);
  useEffect(() => {
    const iv = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const active = useMemo(() => {
    type MinimalTask = {
      id: string;
      title: string;
      assignee?: string;
      assignees?: string[];
      timerRunning?: boolean;
      timerStartedAt?: string;
      subtasks?: MinimalTask[];
    };
    const isMine = (t: MinimalTask) => getTaskAssignees(t).includes(me.name);
    const flatten = (list: MinimalTask[]): MinimalTask[] =>
      list.flatMap((t) => [t, ...flatten(t.subtasks ?? [])]);
    for (const p of loadProjetos()) {
      const found = flatten((p.tasks ?? []) as MinimalTask[]).find(
        (t) => t.timerRunning && isMine(t),
      );
      if (found) {
        return {
          title: found.title,
          startedAt: found.timerStartedAt,
          section: "projetos" as const,
          taskId: found.id,
          projectId: p.id,
        };
      }
    }
    for (const [campanhaId, tasks] of getAllCampanhaTarefas()) {
      const found = (tasks as MinimalTask[]).find((t) => t.timerRunning && isMine(t));
      if (found) {
        return {
          title: found.title,
          startedAt: found.timerStartedAt,
          section: "campanhas" as const,
          taskId: found.id,
          campanhaId,
        };
      }
    }
    return null;
  }, [me.name, tick]);

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
        try {
          sessionStorage.setItem(
            OPEN_CAMPANHA_TASK_KEY,
            JSON.stringify({ campanhaId: active.campanhaId, taskId: active.taskId }),
          );
        } catch {
          /* ignore */
        }
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

function NotificationsBell({ onSelect }: { onSelect: (key: SectionKey) => void }) {
  const [, force] = useState(0);
  useEffect(() => subscribeChat(() => force((n) => n + 1)), []);
  useEffect(() => onMeetingsChange(() => force((n) => n + 1)), []);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<BellTab>("tarefas");
  const clientes = useClientes();
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
  const readJSON = <T,>(k: string, fb: T): T => {
    try {
      const r = localStorage.getItem(k);
      return r ? (JSON.parse(r) as T) : fb;
    } catch {
      return fb;
    }
  };
  const seenMentions = new Set<string>(readJSON<string[]>("notif:seenMentions", []));
  const seenTasks = new Set<string>(readJSON<string[]>("notif:seenTasks", []));
  const seenTaskActivity = new Set<string>(readJSON<string[]>("notif:seenTaskActivity", []));
  const seenMeetings = new Set<string>(readJSON<string[]>("notif:seenMeetings", []));
  const seenReuniaoReagendamento = new Set<string>(
    readJSON<string[]>("notif:seenReuniaoReagendamento", []),
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

  const openConvo = (id: string) => {
    setActiveConvo(id);
    onSelect("chat");
    setOpen(false);
  };

  const dismissMention = (mid: string) => {
    seenMentions.add(mid);
    localStorage.setItem("notif:seenMentions", JSON.stringify(Array.from(seenMentions)));
    force((n) => n + 1);
  };
  const dismissTask = (tid: string) => {
    seenTasks.add(tid);
    localStorage.setItem("notif:seenTasks", JSON.stringify(Array.from(seenTasks)));
    force((n) => n + 1);
  };
  const dismissTaskActivity = (aid: string) => {
    seenTaskActivity.add(aid);
    localStorage.setItem("notif:seenTaskActivity", JSON.stringify(Array.from(seenTaskActivity)));
    force((n) => n + 1);
  };
  const dismissMeeting = (mid: string) => {
    seenMeetings.add(mid);
    localStorage.setItem("notif:seenMeetings", JSON.stringify(Array.from(seenMeetings)));
    force((n) => n + 1);
  };
  const dismissReschedule = (mid: string) => {
    seenReuniaoReagendamento.add(mid);
    localStorage.setItem(
      "notif:seenReuniaoReagendamento",
      JSON.stringify(Array.from(seenReuniaoReagendamento)),
    );
    force((n) => n + 1);
  };
  const tarefasCount = taskItems.length + taskActivityItems.length;
  const mensagensCount = chatItems.reduce((s, i) => s + i.count, 0) + mentionItems.length;
  const reunioesCount = meetingItems.length + rescheduleItems.length;
  const outrosCount = 0;

  const markTab = (t: BellTab) => {
    if (t === "tarefas") {
      taskItems.forEach((x) => seenTasks.add(x.id));
      localStorage.setItem("notif:seenTasks", JSON.stringify(Array.from(seenTasks)));
      taskActivityItems.forEach((a) => seenTaskActivity.add(a.id));
      localStorage.setItem("notif:seenTaskActivity", JSON.stringify(Array.from(seenTaskActivity)));
    } else if (t === "mensagens") {
      chatItems.forEach((i) => void markRead(i.convoId));
      mentionItems.forEach((m) => seenMentions.add(m.id));
      localStorage.setItem("notif:seenMentions", JSON.stringify(Array.from(seenMentions)));
    } else if (t === "reunioes") {
      meetingItems.forEach((m) => seenMeetings.add(m.id));
      localStorage.setItem("notif:seenMeetings", JSON.stringify(Array.from(seenMeetings)));
      rescheduleItems.forEach((m) => seenReuniaoReagendamento.add(m.id));
      localStorage.setItem(
        "notif:seenReuniaoReagendamento",
        JSON.stringify(Array.from(seenReuniaoReagendamento)),
      );
    }
    force((n) => n + 1);
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
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  Nenhuma notificação por aqui ainda
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
