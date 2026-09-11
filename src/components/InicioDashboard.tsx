import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PageContainer } from "@/components/shared/PageContainer";
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Flag,
  MessageSquare,
  Newspaper,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { loadProjetos, onProjetosChange, loadTeamMembers, type BlogPost } from "@/lib/projetos";
import { renderMarkdownLite, ArticleReader } from "@/components/marketing/BlogPanel";
import {
  loadEngagementVI,
  toggleLikeVI,
  addCommentVI,
  type BlogEngagement,
} from "@/lib/blog-engagement";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AvatarStack } from "@/components/meetings/AvatarStack";
import { useConfirm } from "@/hooks/use-confirm";
import {
  subscribeChat,
  getMe,
  loadMembers,
  loadMessages,
  loadChannels,
  loadCampaignChannels,
  loadProjectChannels,
  setActive as setActiveConvo,
} from "@/lib/chat-store";
import { useClientes } from "@/lib/clientes-store";
import { supabase } from "@/integrations/supabase/client";
import type { SectionKey } from "@/components/AppShell";
import { OPEN_CAMPANHA_TASK_KEY } from "@/components/AppShell";
import {
  loadMeetings,
  saveMeetings,
  onMeetingsChange,
  confirmMeetingFor,
  declineMeetingFor,
  type Meeting,
} from "@/lib/reunioes-store";
import { TASK_STATUS_TONE, TASK_STATUS_DOT } from "@/components/tasks/TaskBoard";
import { MeetingSummaryDialog } from "@/components/ReunioesSection";
import { onCampanhaTarefasChange } from "@/lib/campanha-scoped-store";
import { onStandaloneChange } from "@/lib/marketing-tasks";
import {
  loadAllTasks,
  WEEKDAYS,
  type DashTask,
  collectTaskCommentMentions,
  type TaskCommentMention,
} from "@/lib/task-aggregation";
import { usePerformanceSettings } from "@/lib/performance-events-store";

type PersonalItem = { id: string; text: string; done: boolean };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function getGreeting(hour: number) {
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadPerfil(): { nome?: string; foto?: string } {
  try {
    const raw = localStorage.getItem("config:perfil");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Fonte de verdade é `profiles.personal_list` (por usuário, sincroniza entre
// dispositivos) — o cache local é só pra pintar a lista instantaneamente no
// primeiro render, antes da consulta ao Supabase resolver.
const PERSONAL_CACHE_KEY = "inicio.personal.cache";
function loadPersonalCache(): PersonalItem[] {
  try {
    const raw = localStorage.getItem(PERSONAL_CACHE_KEY);
    return raw ? (JSON.parse(raw) as PersonalItem[]) : [];
  } catch {
    return [];
  }
}
function cachePersonal(items: PersonalItem[]) {
  try {
    localStorage.setItem(PERSONAL_CACHE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

type CardKey = "stats" | "work" | "agenda" | "comments" | "personal";
const CARD_DEFS: { key: CardKey; label: string }[] = [
  { key: "stats", label: "Resumo (chips)" },
  { key: "work", label: "Meu trabalho" },
  { key: "agenda", label: "Agenda" },
  { key: "comments", label: "Comentários atribuídos" },
  { key: "personal", label: "Lista pessoal" },
];
const DEFAULT_VISIBLE: Record<CardKey, boolean> = {
  stats: true,
  work: true,
  agenda: true,
  comments: true,
  personal: true,
};
/** Ids de cards removidos em rodadas anteriores — se sobrar no localStorage
 * de alguém, é só ignorado (nunca lido em nenhum `visible.*`), sem quebrar
 * a leitura do restante das preferências salvas. */
function sanitizeVisible(raw: Record<string, boolean>): Record<CardKey, boolean> {
  const next = { ...DEFAULT_VISIBLE };
  for (const key of Object.keys(next) as CardKey[]) {
    if (typeof raw[key] === "boolean") next[key] = raw[key];
  }
  return next;
}

type TaskFilter = "hoje" | "atrasada" | "semana";

const WORK_PAGE_SIZE = 6;
const COMMENTS_PAGE_SIZE = 3;

export function InicioDashboard() {
  const navigate = useNavigate();
  const clientesForChat = useClientes();
  const { settings: performanceSettings } = usePerformanceSettings();
  const campanhaNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clientesForChat) {
      for (const camp of c.campanhas ?? []) map.set(camp.id, camp.nome);
    }
    return map;
  }, [clientesForChat]);
  const [name, setName] = useState("Você");
  const [foto, setFoto] = useState<string | undefined>();
  const [greeting, setGreeting] = useState("Olá");
  const [today, setToday] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("hoje");
  const [manageOpen, setManageOpen] = useState(false);
  const [tasks, setTasks] = useState<DashTask[]>([]);
  const [taskCommentMentions, setTaskCommentMentions] = useState<TaskCommentMention[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingSummary, setMeetingSummary] = useState<Meeting | null>(null);
  const [personal, setPersonal] = useState<PersonalItem[]>(() => loadPersonalCache());
  const [newPersonal, setNewPersonal] = useState("");
  const [workExpanded, setWorkExpanded] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const workCardRef = useRef<HTMLDivElement>(null);
  const { confirm, confirmDialog } = useConfirm();
  const [visible, setVisible] = useState<Record<CardKey, boolean>>(() => {
    if (typeof window === "undefined") return DEFAULT_VISIBLE;
    try {
      const raw = localStorage.getItem("inicio.cards");
      if (raw) return sanitizeVisible(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    return DEFAULT_VISIBLE;
  });

  useEffect(() => {
    try {
      localStorage.setItem("inicio.cards", JSON.stringify(visible));
    } catch {
      /* ignore */
    }
  }, [visible]);

  useEffect(() => {
    const perfil = loadPerfil();
    if (perfil.nome) setName(perfil.nome.split(" ")[0]);
    setFoto(perfil.foto);
    const now = new Date();
    setGreeting(getGreeting(now.getHours()));
    setToday(`${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`);

    const refresh = () => {
      setTasks(loadAllTasks(campanhaNameMap, getMe().name, performanceSettings.deadlineCutoffHour));
      setTaskCommentMentions(collectTaskCommentMentions(getMe().name));
      setMeetings(loadMeetings());
    };
    refresh();
    window.addEventListener("storage", refresh);
    // `storage` só dispara pra troca feita em OUTRA aba do mesmo navegador —
    // tarefas mudadas por outra pessoa chegam via realtime do Supabase, que
    // usa esses pub/sub próprios (`onProjetosChange`/`onCampanhaTarefasChange`),
    // não o evento `storage`. Sem isso o card "Meu trabalho" só atualizava
    // com F5 — e tarefas de campanha (guardadas à parte de `Project.tasks`)
    // não apareciam nem depois do F5.
    const unsubProjetos = onProjetosChange(refresh);
    const unsubCampanhaTarefas = onCampanhaTarefasChange(refresh);
    const unsubStandalone = onStandaloneChange(refresh);
    const unsubMeetings = onMeetingsChange(refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      unsubMeetings();
      unsubProjetos();
      unsubCampanhaTarefas();
      unsubStandalone();
    };
  }, [campanhaNameMap, performanceSettings.deadlineCutoffHour]);

  // Lista pessoal — vive em `profiles.personal_list` (por usuário), não mais
  // só em localStorage, pra acompanhar quem logou de outro dispositivo/
  // navegador. Canal realtime próprio (filtrado pelo id do usuário) reflete
  // uma edição feita em outra aba/dispositivo sem precisar de F5.
  useEffect(() => {
    const userId = getMe().id;
    if (!userId) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("personal_list")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const items = (data.personal_list as PersonalItem[] | null) ?? [];
        setPersonal(items);
        cachePersonal(items);
      });
    const channel = supabase
      .channel(`rt-personal-list-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        (payload) => {
          const items = ((payload.new as { personal_list?: PersonalItem[] } | null)
            ?.personal_list ?? []) as PersonalItem[];
          setPersonal(items);
          cachePersonal(items);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  // Mantém o resumo aberto em sincronia com atualizações (confirmar,
  // recusar, sugerir horário, etc.) feitas dentro do próprio diálogo.
  useEffect(() => {
    if (!meetingSummary) return;
    const fresh = meetings.find((m) => m.id === meetingSummary.id);
    setMeetingSummary(fresh ?? null);
  }, [meetings, meetingSummary?.id]);

  const countBy = (b: DashTask["bucket"]) => tasks.filter((t) => t.bucket === b).length;
  const hoje = countBy("hoje");
  const amanha = countBy("amanha");
  const semana = countBy("semana");
  const atrasadas = countBy("atrasada");
  const proximos7Dias = semana + hoje + amanha;

  const filteredTasks = useMemo(() => {
    if (filter === "hoje") return tasks.filter((t) => t.bucket === "hoje");
    if (filter === "atrasada") return tasks.filter((t) => t.bucket === "atrasada");
    return tasks.filter((t) => ["hoje", "amanha", "semana"].includes(t.bucket));
  }, [filter, tasks]);

  useEffect(() => setWorkExpanded(false), [filter]);

  const goToWork = (f: TaskFilter) => {
    setFilter(f);
    workCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const todayISO = toISODate(new Date());
  const todaysMeetings = useMemo(() => {
    const me = getMe();
    // Mesmo critério de "sou participante" já usado em ReunioesSection.tsx
    // (criador OU convidado) — sem isso, a Agenda do Início mostrava TODA
    // reunião marcada pra hoje no workspace inteiro, não só as minhas.
    const isMine = (m: Meeting) => m.criadorId === me.id || m.participanteIds?.includes(me.id);
    return meetings
      .filter((m) => m.data === todayISO && m.status !== "Cancelada" && isMine(m))
      .sort((a, b) => a.hora.localeCompare(b.hora));
  }, [meetings, todayISO]);

  // Atualiza a cada minuto — sem isso, quem deixa a aba aberta nunca vê uma
  // reunião "passar" pra atrasada/concluída sozinha, só dando F5.
  const [nowDate, setNowDate] = useState(() => new Date());
  useEffect(() => {
    const iv = window.setInterval(() => setNowDate(new Date()), 60_000);
    return () => window.clearInterval(iv);
  }, []);
  const nowHHMM = `${String(nowDate.getHours()).padStart(2, "0")}:${String(nowDate.getMinutes()).padStart(2, "0")}`;
  const meetingEndHHMM = (m: Meeting) => {
    const [h, min] = m.hora.split(":").map(Number);
    const total = h * 60 + min + m.duracao;
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  // A "próxima" é a primeira que ainda não terminou (em andamento conta como
  // próxima, não como passada) — as demais continuam todas visíveis, na
  // mesma ordem cronológica, só com destaque/opacidade diferentes conforme
  // já passaram ou ainda vêm a seguir (pedido explícito: manter as que já
  // foram, só deixar a ordem clara).
  const nextMeetingId =
    todaysMeetings.find((m) => meetingEndHHMM(m) > nowHHMM)?.id ??
    todaysMeetings[todaysMeetings.length - 1]?.id;
  const members = useMemo(() => loadMembers(), []);
  const meetingParticipants = (m: Meeting) =>
    (m.participanteIds ?? [])
      .map((id) => members.find((x) => x.id === id))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map((x) => ({ id: x.id, name: x.name, photo: x.photo }));

  // Comentários atribuídos — menções a mim em qualquer conversa do chat, e
  // menções em comentários de tarefa. "Limpar" (por item ou tudo de uma vez)
  // grava em `notif:seenMentions`/`notif:seenTaskCommentMentions` — os
  // mesmos sets que o sino de notificações usa — então limpar aqui também
  // tira o item de lá, em vez de manter duas listas de "visto" divergentes.
  const [, forceChat] = useState(0);
  useEffect(() => subscribeChat(() => forceChat((n) => n + 1)), []);
  const [seenTick, setSeenTick] = useState(0);
  const readSeenMentions = (): Set<string> => {
    try {
      const raw = localStorage.getItem("notif:seenMentions");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  };
  const dismissMentions = (ids: string[]) => {
    const seen = readSeenMentions();
    ids.forEach((id) => seen.add(id));
    localStorage.setItem("notif:seenMentions", JSON.stringify(Array.from(seen)));
    window.dispatchEvent(new StorageEvent("storage", { key: "notif:seenMentions" }));
    setSeenTick((t) => t + 1);
  };
  const mentionItems = useMemo(() => {
    const me = getMe();
    const seen = readSeenMentions();
    const channels = loadChannels();
    const campaigns = loadCampaignChannels(clientesForChat);
    const projects = loadProjectChannels();
    const labelFor = (convoId: string): string => {
      if (convoId.startsWith("camp:"))
        return campaigns.find((c) => c.id === convoId)?.name ?? "Campanha";
      if (convoId.startsWith("proj:"))
        return projects.find((p) => p.id === convoId)?.name ?? "Projeto";
      if (convoId.startsWith("dm:")) return "Mensagem direta";
      return channels.find((c) => c.id === convoId)?.name ?? "Canal";
    };
    return loadMessages()
      .filter(
        (m) =>
          m.authorId !== me.id &&
          !seen.has(m.id) &&
          m.mentions?.some((x) => x.kind === "user" && x.id === me.id),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((m) => ({ ...m, convoLabel: labelFor(m.convoId) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesForChat, seenTick]);

  const openMention = (convoId: string) => {
    setActiveConvo(convoId);
    navigate({ to: "/time", search: { section: "chat" as SectionKey } });
  };

  const readSeenTaskCommentMentions = (): Set<string> => {
    try {
      const raw = localStorage.getItem("notif:seenTaskCommentMentions");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  };
  const dismissTaskCommentMentions = (ids: string[]) => {
    const seen = readSeenTaskCommentMentions();
    ids.forEach((id) => seen.add(id));
    localStorage.setItem("notif:seenTaskCommentMentions", JSON.stringify(Array.from(seen)));
    setSeenTick((t) => t + 1);
  };
  const taskCommentMentionItems = useMemo(() => {
    const seen = readSeenTaskCommentMentions();
    return taskCommentMentions.filter((m) => !seen.has(m.commentId)).slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskCommentMentions, seenTick]);

  // Uma única lista, ordenada por data, combinando as duas fontes acima —
  // é o que a seção "Comentários atribuídos" mostra.
  type AssignedComment = {
    key: string;
    author: string;
    context: string;
    text: string;
    at: number;
    onOpen: () => void;
    onDismiss: () => void;
  };
  const assignedComments = useMemo<AssignedComment[]>(() => {
    const fromMentions: AssignedComment[] = mentionItems.map((m) => ({
      key: `mention:${m.id}`,
      author: m.authorName,
      context: m.convoLabel,
      text: m.text,
      at: m.createdAt,
      onOpen: () => openMention(m.convoId),
      onDismiss: () => dismissMentions([m.id]),
    }));
    const fromTasks: AssignedComment[] = taskCommentMentionItems.map((m) => ({
      key: `task:${m.commentId}`,
      author: m.author,
      context: m.taskTitle,
      text: m.commentText,
      at: Date.parse(m.createdAt) || 0,
      onOpen: () => openTask(m),
      onDismiss: () => dismissTaskCommentMentions([m.commentId]),
    }));
    return [...fromMentions, ...fromTasks].sort((a, b) => b.at - a.at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionItems, taskCommentMentionItems]);

  const fmtCommentAt = (at: number) => {
    if (!at) return "";
    const d = new Date(at);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
  };

  const clearAllComments = async () => {
    if (
      !(await confirm(
        `Limpar ${assignedComments.length === 1 ? "o comentário atribuído" : `todos os ${assignedComments.length} comentários atribuídos`}? Eles saem também do sino de notificações.`,
      ))
    ) {
      return;
    }
    dismissMentions(mentionItems.map((m) => m.id));
    dismissTaskCommentMentions(taskCommentMentionItems.map((m) => m.commentId));
  };

  const persistPersonal = (next: PersonalItem[]) => {
    setPersonal(next);
    cachePersonal(next);
    const userId = getMe().id;
    if (!userId) return;
    void supabase
      .from("profiles")
      .update({ personal_list: next })
      .eq("id", userId)
      .then(({ error }) => {
        if (error) console.warn("[inicio.personal] save failed", error);
      });
  };
  const addPersonal = () => {
    const t = newPersonal.trim();
    if (!t) return;
    persistPersonal([...personal, { id: `p_${Date.now()}`, text: t, done: false }]);
    setNewPersonal("");
  };
  const togglePersonal = (id: string) => {
    persistPersonal(personal.map((p) => (p.id === id ? { ...p, done: !p.done } : p)));
  };
  const removePersonal = (id: string) => {
    persistPersonal(personal.filter((p) => p.id !== id));
  };

  const openTask = (t: Pick<DashTask, "id" | "projectId" | "campanhaId" | "parentId">) => {
    // Subtarefa não tem dialog próprio pra abrir sozinha (só é editada de
    // dentro do dialog da tarefa-mãe de nível raiz) — abre o pai em vez
    // dela; a subtarefa aparece logo na lista de subtarefas já expandida.
    const targetId = t.parentId ?? t.id;
    if (t.campanhaId) {
      // Campanhas não têm rota própria (é tudo dentro de /time?section=campanhas,
      // navegação client-side) — mesmo deep-link por sessionStorage que o
      // indicador de timer ativo (AppShell) já usa pra abrir campanha + tarefa.
      sessionStorage.setItem(
        OPEN_CAMPANHA_TASK_KEY,
        JSON.stringify({ campanhaId: t.campanhaId, taskId: targetId }),
      );
      navigate({ to: "/time", search: { section: "campanhas" as SectionKey } });
      return;
    }
    navigate({ to: "/projeto/$id", params: { id: t.projectId }, search: { taskId: targetId } });
  };

  const visibleWorkTasks = workExpanded ? filteredTasks : filteredTasks.slice(0, WORK_PAGE_SIZE);
  const visibleComments = commentsExpanded
    ? assignedComments
    : assignedComments.slice(0, COMMENTS_PAGE_SIZE);

  return (
    <PageContainer className="space-y-10">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {foto ? (
            <img src={foto} alt="" className="h-13 w-13 rounded-full object-cover" />
          ) : (
            <div className="flex h-13 w-13 items-center justify-center rounded-full bg-foreground text-lg font-semibold text-background">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {greeting}, {name}
            </p>
            <p className="text-sm text-muted-foreground">{today}</p>
          </div>
        </div>
        <div className="relative flex items-center gap-3">
          <button
            onClick={() => setManageOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Gerenciar cards
          </button>
          {manageOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setManageOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-border bg-background p-2 shadow-lg">
                <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Cards da tela inicial
                </p>
                {CARD_DEFS.map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                  >
                    <span>{c.label}</span>
                    <input
                      type="checkbox"
                      checked={visible[c.key]}
                      onChange={() => setVisible((v) => ({ ...v, [c.key]: !v[c.key] }))}
                      className="h-3.5 w-3.5 accent-brand"
                    />
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Stat strip */}
      {visible.stats && (
        <div className="-mt-4 flex gap-x-2 overflow-x-auto pb-1 sm:gap-x-3">
          <StatChip
            label="Hoje"
            value={hoje}
            active={filter === "hoje"}
            onClick={() => goToWork("hoje")}
          />
          <StatChip label="Amanhã" value={amanha} onClick={() => goToWork("semana")} />
          <StatChip
            label="Próximos 7 dias"
            value={proximos7Dias}
            active={filter === "semana"}
            onClick={() => goToWork("semana")}
          />
          <StatChip
            label="Atrasadas"
            value={atrasadas}
            tone="danger"
            active={filter === "atrasada"}
            onClick={() => goToWork("atrasada")}
          />
        </div>
      )}

      {/* Linha operacional principal */}
      {(visible.work || visible.agenda) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {visible.work && (
            <Card ref={workCardRef} className="lg:col-span-2">
              <CardHeader
                icon={<CheckCircle2 className="h-4 w-4" />}
                title="Meu trabalho"
                action={
                  <div className="flex items-center gap-1">
                    <Tab active={filter === "hoje"} onClick={() => setFilter("hoje")}>
                      Hoje
                    </Tab>
                    <Tab active={filter === "atrasada"} onClick={() => setFilter("atrasada")}>
                      Atrasadas
                    </Tab>
                    <Tab active={filter === "semana"} onClick={() => setFilter("semana")}>
                      Semana
                    </Tab>
                  </div>
                }
              />
              <div className="divide-y divide-border">
                {filteredTasks.length === 0 && (
                  <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                    Nada por aqui. Bom trabalho.
                  </p>
                )}
                {visibleWorkTasks.map((t) => (
                  <button
                    key={`${t.projectId}_${t.id}`}
                    onClick={() => openTask(t)}
                    className="group flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40"
                  >
                    <PriorityFlag priority={t.priority} bucket={t.bucket} />
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-1.5 truncate text-sm text-foreground group-hover:underline">
                        {t.parentTitle && (
                          <span
                            title={`Subtarefa de "${t.parentTitle}"`}
                            className="inline-flex shrink-0 items-center rounded border border-border bg-muted/60 px-1 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-muted-foreground"
                          >
                            Sub
                          </span>
                        )}
                        <span className="truncate">{t.title}</span>
                      </p>
                    </div>
                    <span
                      className={`hidden shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline-flex ${TASK_STATUS_TONE[t.status]}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${TASK_STATUS_DOT[t.status]}`} />
                      {t.status}
                    </span>
                    <span className="hidden shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
                      {t.projectName}
                    </span>
                    <span
                      className={`shrink-0 text-xs tabular-nums ${
                        t.bucket === "atrasada" ? "text-danger" : "text-muted-foreground"
                      }`}
                    >
                      {t.due}
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
                {filteredTasks.length > WORK_PAGE_SIZE && (
                  <button
                    type="button"
                    onClick={() => setWorkExpanded((v) => !v)}
                    className="flex w-full items-center justify-center gap-1 px-4 py-2 text-xs font-medium text-brand hover:underline"
                  >
                    {workExpanded ? "Ver menos" : `Ver todas (${filteredTasks.length})`}
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${workExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
              </div>
            </Card>
          )}

          {visible.agenda && (
            <Card>
              <CardHeader
                icon={<Calendar className="h-4 w-4" />}
                title="Agenda"
                action={
                  <button
                    onClick={() =>
                      navigate({ to: "/time", search: { section: "reunioes" as SectionKey } })
                    }
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Ver tudo
                  </button>
                }
              />
              {todaysMeetings.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Nenhuma reunião hoje.
                </p>
              ) : (
                <ol className="space-y-0.5 p-3">
                  {todaysMeetings.map((m) => {
                    const isNext = m.id === nextMeetingId;
                    const isPast = meetingEndHHMM(m) <= nowHHMM && !isNext;
                    if (isNext) {
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => setMeetingSummary(m)}
                            className="flex w-full items-start gap-3 rounded-lg border border-brand/30 bg-brand-subtle px-3 py-2.5 text-left hover:bg-brand-subtle/70"
                          >
                            <div className="shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-brand">
                              {m.hora}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">
                                {m.titulo}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {m.duracao} min · {m.local || m.com}
                              </p>
                            </div>
                            {meetingParticipants(m).length > 0 && (
                              <AvatarStack people={meetingParticipants(m)} max={3} size="sm" />
                            )}
                          </button>
                        </li>
                      );
                    }
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => setMeetingSummary(m)}
                          className={`flex w-full items-start gap-3 rounded-md px-1 py-1.5 text-left hover:bg-muted/40 ${
                            isPast ? "opacity-50" : ""
                          }`}
                        >
                          <div className="w-11 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                            {m.hora}
                          </div>
                          <div className="min-w-0 flex-1 pb-0.5">
                            <p className="truncate text-xs font-medium text-foreground">
                              {m.titulo}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {m.duracao} min · {m.local || m.com}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          )}
        </div>
      )}

      <MuralNovidades />

      {(visible.comments || visible.personal) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {visible.comments && (
            <Card className="lg:col-span-2">
              <CardHeader
                icon={<MessageSquare className="h-4 w-4" />}
                title="Comentários atribuídos"
                action={
                  assignedComments.length > 0 && (
                    <button
                      onClick={() => void clearAllComments()}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Limpar tudo
                    </button>
                  )
                }
              />
              {assignedComments.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  Sem menções no momento.
                </p>
              ) : (
                <>
                  <div
                    className={`divide-y divide-border ${commentsExpanded ? "max-h-[26rem] overflow-y-auto" : ""}`}
                  >
                    {visibleComments.map((c) => (
                      <div
                        key={c.key}
                        className="group relative flex items-start gap-1 px-4 py-2.5"
                      >
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                          aria-hidden
                        />
                        <button
                          onClick={c.onOpen}
                          className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-xs font-medium text-foreground">
                                {c.author}{" "}
                                <span className="font-normal text-muted-foreground">
                                  mencionou você em {c.context}
                                </span>
                              </p>
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {fmtCommentAt(c.at)}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {c.text}
                            </p>
                          </div>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                        <button
                          onClick={c.onDismiss}
                          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                          aria-label={`Limpar menção de ${c.author}`}
                          title={`Limpar menção de ${c.author}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {assignedComments.length > COMMENTS_PAGE_SIZE && (
                    <button
                      type="button"
                      onClick={() => setCommentsExpanded((v) => !v)}
                      className="flex w-full items-center justify-center gap-1 border-t border-border px-4 py-2 text-xs font-medium text-brand hover:underline"
                    >
                      {commentsExpanded ? "Ver menos" : `Ver todos (${assignedComments.length})`}
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${commentsExpanded ? "rotate-180" : ""}`}
                      />
                    </button>
                  )}
                </>
              )}
            </Card>
          )}

          {visible.personal && (
            <Card>
              <CardHeader
                icon={<Star className="h-4 w-4" />}
                title="Lista pessoal"
                action={
                  <span className="text-[11px] text-muted-foreground">
                    {personal.filter((p) => !p.done).length}
                  </span>
                }
              />
              <div className="space-y-1 p-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addPersonal();
                  }}
                  className="mb-2 flex items-center gap-1.5"
                >
                  <input
                    value={newPersonal}
                    onChange={(e) => setNewPersonal(e.target.value)}
                    placeholder="Adicionar item…"
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Adicionar"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </form>
                {personal.length === 0 && (
                  <p className="py-4 text-center text-[11px] text-muted-foreground">Nenhum item.</p>
                )}
                {personal.map((p) => (
                  <div
                    key={p.id}
                    className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={p.done}
                      onChange={() => togglePersonal(p.id)}
                      className="h-3.5 w-3.5 rounded border-border accent-brand"
                    />
                    <span
                      className={`flex-1 ${p.done ? "text-muted-foreground line-through" : "text-foreground"}`}
                    >
                      {p.text}
                    </span>
                    <button
                      onClick={() => removePersonal(p.id)}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Remover"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <MeetingSummaryDialog
        meeting={meetingSummary}
        me={getMe()}
        onClose={() => setMeetingSummary(null)}
        onEdit={() => {
          setMeetingSummary(null);
          navigate({ to: "/time", search: { section: "reunioes" as SectionKey } });
        }}
        onChange={(m) => {
          const next = meetings.map((x) => (x.id === m.id ? m : x));
          setMeetings(next);
          saveMeetings(next);
        }}
        onConfirm={(m) => {
          const next = meetings.map((x) => (x.id === m.id ? confirmMeetingFor(x, getMe().id) : x));
          setMeetings(next);
          saveMeetings(next);
        }}
        onDecline={(m) => {
          const next = meetings.map((x) => (x.id === m.id ? declineMeetingFor(x, getMe().id) : x));
          setMeetings(next);
          saveMeetings(next);
        }}
        onDelete={(id) => {
          const next = meetings.filter((x) => x.id !== id);
          setMeetings(next);
          saveMeetings(next);
          setMeetingSummary(null);
        }}
      />
      {confirmDialog}
    </PageContainer>
  );
}

const Card = ({
  children,
  className = "",
  ref,
}: {
  children: ReactNode;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}) => (
  <div
    ref={ref}
    className={`overflow-hidden rounded-lg border border-border bg-background ${className}`}
  >
    {children}
  </div>
);

function CardHeader({
  icon,
  title,
  action,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <div className="flex items-center gap-2 text-foreground">
        <span className="text-muted-foreground">{icon}</span>
        <p className="text-xs font-semibold">{title}</p>
      </div>
      {action}
    </div>
  );
}

function Tab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StatChip({
  label,
  value,
  tone = "default",
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "default" | "danger";
  active?: boolean;
  onClick?: () => void;
}) {
  const isZero = value === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 flex-col items-start gap-0.5 rounded-lg border px-3.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "border-brand/40 bg-brand-subtle"
          : "border-border bg-background hover:border-foreground/20 hover:bg-muted/40"
      }`}
    >
      <span
        className={`text-xl font-semibold tabular-nums ${
          isZero
            ? "text-muted-foreground/50"
            : tone === "danger" && value > 0
              ? "text-danger"
              : active
                ? "text-brand"
                : "text-foreground"
        }`}
      >
        {value.toString().padStart(2, "0")}
      </span>
      <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </button>
  );
}

function PriorityFlag({
  priority,
  bucket,
}: {
  priority?: DashTask["priority"];
  bucket: DashTask["bucket"];
}) {
  const color =
    bucket === "atrasada"
      ? "text-danger"
      : priority === "Urgente"
        ? "text-red-500"
        : priority === "Alta"
          ? "text-orange-500"
          : priority === "Normal"
            ? "text-yellow-500"
            : "text-muted-foreground/40";

  return (
    <Flag
      className={`h-3.5 w-3.5 shrink-0 ${color}`}
      fill="currentColor"
      strokeWidth={1.5}
      aria-label={priority ?? "Sem prioridade"}
    />
  );
}

/** `publishDate` pode ser só a data (posts antigos) ou um datetime ISO
 * completo (posts novos, ver comentário do campo em `projetos.ts`) — sempre
 * exibe só a data, no formato pt-BR, igual ao editor do post. */
function fmtPublishDate(publishDate: string): string {
  const d = new Date(publishDate);
  return Number.isNaN(d.getTime()) ? publishDate : d.toLocaleDateString("pt-BR");
}

function MuralNovidades() {
  const [items, setItems] = useState<Array<BlogPost & { projectName: string }>>([]);
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("inicio.mural.dismissed") || "[]");
    } catch {
      return [];
    }
  });
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const load = () => {
      const projs = loadProjetos();
      const all: Array<BlogPost & { projectName: string }> = [];
      for (const pr of projs) {
        for (const b of pr.blog ?? []) {
          if (b.status === "publicado" && b.audience?.includes("mural")) {
            all.push({ ...b, projectName: pr.name });
          }
        }
      }
      all.sort((a, b) => (b.publishDate ?? "").localeCompare(a.publishDate ?? ""));
      setItems(all);
    };
    load();
    const h = () => load();
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, []);

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem("inicio.mural.dismissed", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const [openArticle, setOpenArticle] = useState<(BlogPost & { projectName: string }) | null>(null);
  const [engagement, setEngagement] = useState<BlogEngagement | null>(null);
  const team = useMemo(() => loadTeamMembers(), []);

  useEffect(() => {
    if (!openArticle) {
      setEngagement(null);
      return;
    }
    let cancelled = false;
    loadEngagementVI(openArticle.id).then((e) => {
      if (!cancelled) setEngagement(e);
    });
    return () => {
      cancelled = true;
    };
  }, [openArticle]);

  const visibleItems = items.filter((i) => !dismissed.includes(i.id));
  if (visibleItems.length === 0) return null;

  const [featured, ...rest] = visibleItems;
  const authorPhoto = openArticle?.authorId
    ? team.find((m) => m.id === openArticle.authorId)?.photo
    : undefined;

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Newspaper className="h-4 w-4" />
        <p className="text-sm font-semibold">Mural de novidades</p>
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="ml-auto text-[11px] font-medium text-brand hover:underline"
          >
            {showAll ? "Ver menos" : `Ver todas (${visibleItems.length})`}
          </button>
        )}
      </div>

      {!showAll ? (
        <div className="group flex flex-col gap-3 p-4 sm:flex-row">
          {featured.cover && (
            <button
              type="button"
              onClick={() => setOpenArticle(featured)}
              className="shrink-0 overflow-hidden rounded-md sm:w-48"
            >
              <img
                src={featured.cover}
                alt=""
                className="h-32 w-full object-cover object-center sm:h-full"
              />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => setOpenArticle(featured)}
                className="min-w-0 flex-1 text-left"
              >
                {featured.category && (
                  <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {featured.category}
                  </span>
                )}
                <p className="mt-1 truncate text-base font-semibold text-foreground hover:underline">
                  {featured.title}
                </p>
                {featured.excerpt && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {featured.excerpt}
                  </p>
                )}
              </button>
              <button
                onClick={() => dismiss(featured.id)}
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Dispensar"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{featured.authorName || "Sem autor"}</span>
              <span>· {featured.projectName}</span>
              {featured.publishDate && <span>· {fmtPublishDate(featured.publishDate)}</span>}
            </div>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {visibleItems.map((p) => (
            <li key={p.id} className="group flex gap-3 px-4 py-3">
              {p.cover && (
                <img src={p.cover} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
              )}
              <button
                type="button"
                onClick={() => setOpenArticle(p)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium hover:underline">{p.title}</p>
                {p.excerpt && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                    {p.excerpt}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{p.authorName || "Sem autor"}</span>
                  <span>· {p.projectName}</span>
                  {p.publishDate && <span>· {fmtPublishDate(p.publishDate)}</span>}
                </div>
              </button>
              <button
                onClick={() => dismiss(p.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Dispensar"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!openArticle} onOpenChange={(v) => !v && setOpenArticle(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          {openArticle && (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>{openArticle.title}</DialogTitle>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {engagement && (
                  <ArticleReader
                    cover={openArticle.cover}
                    title={openArticle.title}
                    authorLabel={openArticle.authorName || "Sem autor"}
                    authorPhoto={authorPhoto}
                    metaExtra={openArticle.projectName}
                    dateLabel={openArticle.publishDate}
                    contentHtml={renderMarkdownLite(
                      openArticle.content ?? openArticle.excerpt ?? "",
                    )}
                    engagement={{
                      likeCount: engagement.likeCount,
                      likedByMe: engagement.likedByMe,
                      comments: engagement.comments,
                      onToggleLike: async () => {
                        setEngagement((e) =>
                          e
                            ? {
                                ...e,
                                likedByMe: !e.likedByMe,
                                likeCount: e.likeCount + (e.likedByMe ? -1 : 1),
                              }
                            : e,
                        );
                        await toggleLikeVI(openArticle.id);
                      },
                      onAddComment: async (body) => {
                        await addCommentVI(openArticle.id, body);
                        const next = await loadEngagementVI(openArticle.id);
                        setEngagement(next);
                      },
                    }}
                  />
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
