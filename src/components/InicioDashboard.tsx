import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  MessageSquare,
  Grid3x3,
  Newspaper,
  Plus,
  Puzzle,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import {
  loadProjetos,
  onProjetosChange,
  getTaskAssignees,
  type BlogPost,
  type Task as ProjTask,
} from "@/lib/projetos";
import { renderMarkdownLite, MARKDOWN_LITE_CLASSES } from "@/components/marketing/BlogPanel";
import { ZipGameSection } from "@/components/games/ZipGameSection";
import { SudokuGameSection } from "@/components/games/SudokuGameSection";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  subscribeChat,
  getMe,
  loadMessages,
  loadChannels,
  loadCampaignChannels,
  loadProjectChannels,
  setActive as setActiveConvo,
} from "@/lib/chat-store";
import { useClientes } from "@/lib/clientes-store";
import { supabase } from "@/integrations/supabase/client";
import { listLeads } from "@/lib/comercial.functions";
import { DEFAULT_STAGES, formatBRL } from "@/lib/comercial";
import { useFinanceiroEntries, monthKey, fmtBRL } from "@/lib/financeiro-entries";
import type { SectionKey } from "@/components/AppShell";
import { OPEN_CAMPANHA_TASK_KEY } from "@/components/AppShell";
import { loadMeetings, saveMeetings, onMeetingsChange, type Meeting } from "@/lib/reunioes-store";
import { TASK_STATUS_TONE, TASK_STATUS_DOT } from "@/components/tasks/TaskBoard";
import { MeetingSummaryDialog } from "@/components/ReunioesSection";
import { getAllCampanhaTarefas, onCampanhaTarefasChange } from "@/lib/campanha-scoped-store";

type DashTask = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  bucket: "hoje" | "amanha" | "semana" | "atrasada" | "outro";
  due: string;
  priority?: ProjTask["priority"];
  status: ProjTask["status"];
  /** Ausente = tarefa de projeto (rota própria); presente = tarefa de
   * campanha, que não tem rota própria e precisa do deep-link por
   * sessionStorage já usado pelo indicador de timer ativo. */
  campanhaId?: string;
};

type PersonalItem = { id: string; text: string; done: boolean };

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
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

function bucketFor(dueISO: string | undefined, status: ProjTask["status"]): DashTask["bucket"] {
  if (status === "Concluído" || status === "Aprovado" || status === "Arquivado") return "outro";
  if (!dueISO) return "outro";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueISO + "T00:00:00");
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "atrasada";
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanha";
  if (diff <= 7) return "semana";
  return "outro";
}

function formatDue(dueISO: string | undefined, bucket: DashTask["bucket"]): string {
  if (!dueISO) return "";
  const due = new Date(dueISO + "T00:00:00");
  if (bucket === "hoje") return "Hoje";
  if (bucket === "amanha") return "Amanhã";
  if (bucket === "atrasada") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = Math.round((today.getTime() - due.getTime()) / 86400000);
    return `Atrasada ${d}d`;
  }
  return `${WEEKDAYS[due.getDay()].slice(0, 3)} ${due.getDate()}/${due.getMonth() + 1}`;
}

type CampanhaTaskLike = {
  id: string;
  title: string;
  dueDate?: string;
  priority?: ProjTask["priority"];
  status: ProjTask["status"];
  assignee?: string;
  assignees?: string[];
};

/** `campanhaNames` mapeia campanhaId -> nome, pra dar título nas tarefas de
 * campanha do mesmo jeito que as de projeto já têm `p.name`. Sem isso as
 * tarefas de campanha (guardadas à parte, em `campanha_tarefas`, não em
 * `Project.tasks`) nunca apareciam aqui — só as de projeto.
 *
 * `meName` filtra pra só entrar tarefa onde a pessoa está entre os
 * responsáveis (sozinha ou dividindo com mais alguém) — "Meu trabalho" é
 * pra ser pessoal, não a lista de tarefas de todo mundo. */
function loadAllTasks(campanhaNames: Map<string, string>, meName: string): DashTask[] {
  const projs = loadProjetos();
  const out: DashTask[] = [];
  for (const p of projs) {
    for (const t of p.tasks ?? []) {
      if (!getTaskAssignees(t).includes(meName)) continue;
      const b = bucketFor(t.dueDate, t.status);
      out.push({
        id: t.id,
        projectId: p.id,
        projectName: p.name,
        title: t.title,
        bucket: b,
        due: formatDue(t.dueDate, b),
        priority: t.priority,
        status: t.status,
      });
    }
  }
  for (const [campanhaId, tasks] of getAllCampanhaTarefas()) {
    for (const t of tasks as unknown as CampanhaTaskLike[]) {
      if (!getTaskAssignees(t).includes(meName)) continue;
      const b = bucketFor(t.dueDate, t.status);
      out.push({
        id: t.id,
        projectId: "",
        projectName: campanhaNames.get(campanhaId) ?? "Campanha",
        title: t.title,
        bucket: b,
        due: formatDue(t.dueDate, b),
        priority: t.priority,
        status: t.status,
        campanhaId,
      });
    }
  }
  return out;
}

function loadPerfil(): { nome?: string; foto?: string } {
  try {
    const raw = localStorage.getItem("config:perfil");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const PERSONAL_KEY = "inicio.personal";
function loadPersonal(): PersonalItem[] {
  try {
    const raw = localStorage.getItem(PERSONAL_KEY);
    return raw ? (JSON.parse(raw) as PersonalItem[]) : [];
  } catch {
    return [];
  }
}
function savePersonal(items: PersonalItem[]) {
  try {
    localStorage.setItem(PERSONAL_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

type CardKey = "stats" | "work" | "agenda" | "comments" | "personal" | "comercial" | "financeiro";
const CARD_DEFS: { key: CardKey; label: string }[] = [
  { key: "stats", label: "Resumo (chips)" },
  { key: "work", label: "Meu trabalho" },
  { key: "agenda", label: "Agenda" },
  { key: "comments", label: "Comentários atribuídos" },
  { key: "personal", label: "Lista pessoal" },
  { key: "comercial", label: "Funil comercial" },
  { key: "financeiro", label: "Financeiro do mês" },
];
const DEFAULT_VISIBLE: Record<CardKey, boolean> = {
  stats: true,
  work: true,
  agenda: true,
  comments: true,
  personal: true,
  comercial: true,
  financeiro: true,
};

type TaskFilter = "hoje" | "atrasada" | "semana";

export function InicioDashboard() {
  const navigate = useNavigate();
  const clientesForChat = useClientes();
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
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingSummary, setMeetingSummary] = useState<Meeting | null>(null);
  const [personal, setPersonal] = useState<PersonalItem[]>([]);
  const [newPersonal, setNewPersonal] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [zipOpen, setZipOpen] = useState(false);
  const [sudokuOpen, setSudokuOpen] = useState(false);
  const [visible, setVisible] = useState<Record<CardKey, boolean>>(() => {
    if (typeof window === "undefined") return DEFAULT_VISIBLE;
    try {
      const raw = localStorage.getItem("inicio.cards");
      if (raw) return { ...DEFAULT_VISIBLE, ...JSON.parse(raw) };
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
      setTasks(loadAllTasks(campanhaNameMap, getMe().name));
      setMeetings(loadMeetings());
      setPersonal(loadPersonal());
    };
    refresh();
    window.addEventListener("storage", refresh);
    const unsubMeetings = onMeetingsChange(refresh);
    // `storage` só dispara pra troca feita em OUTRA aba do mesmo navegador —
    // tarefas mudadas por outra pessoa chegam via realtime do Supabase, que
    // usa esses pub/sub próprios (`onProjetosChange`/`onCampanhaTarefasChange`),
    // não o evento `storage`. Sem isso o card "Meu trabalho" só atualizava
    // com F5 — e tarefas de campanha (guardadas à parte de `Project.tasks`)
    // não apareciam nem depois do F5.
    const unsubProjetos = onProjetosChange(refresh);
    const unsubCampanhaTarefas = onCampanhaTarefasChange(refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      unsubMeetings();
      unsubProjetos();
      unsubCampanhaTarefas();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanhaNameMap]);

  // Mantém o resumo aberto em sincronia com atualizações (confirmar,
  // recusar, sugerir horário, etc.) feitas dentro do próprio diálogo.
  useEffect(() => {
    if (!meetingSummary) return;
    const fresh = meetings.find((m) => m.id === meetingSummary.id);
    setMeetingSummary(fresh ?? null);
  }, [meetings, meetingSummary?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || cancelled) return;
      const { data: ok } = await supabase.rpc("is_admin", { _user_id: u.user.id });
      if (!cancelled) setIsAdmin(Boolean(ok));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const countBy = (b: DashTask["bucket"]) => tasks.filter((t) => t.bucket === b).length;
  const hoje = countBy("hoje");
  const amanha = countBy("amanha");
  const semana = countBy("semana");
  const atrasadas = countBy("atrasada");

  const filteredTasks = useMemo(() => {
    if (filter === "hoje") return tasks.filter((t) => t.bucket === "hoje");
    if (filter === "atrasada") return tasks.filter((t) => t.bucket === "atrasada");
    return tasks.filter((t) => ["hoje", "amanha", "semana"].includes(t.bucket));
  }, [filter, tasks]);

  const todayISO = toISODate(new Date());
  const todaysMeetings = useMemo(
    () =>
      meetings
        .filter((m) => m.data === todayISO && m.status !== "Cancelada")
        .sort((a, b) => a.hora.localeCompare(b.hora)),
    [meetings, todayISO],
  );

  // Comentários atribuídos — menções a mim em qualquer conversa do chat.
  // "Limpar" (por pessoa/item ou tudo de uma vez) grava em `notif:seenMentions`
  // — o mesmo set que o sino de notificações usa — então limpar aqui também
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
      .slice(0, 6)
      .map((m) => ({ ...m, convoLabel: labelFor(m.convoId) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesForChat, seenTick]);

  const openMention = (convoId: string) => {
    setActiveConvo(convoId);
    navigate({ to: "/time", search: { section: "chat" as SectionKey } });
  };

  // Funil comercial — leads reais (tabela Supabase via server function)
  const listLeadsFn = useServerFn(listLeads);
  const { data: leads = [] } = useQuery({
    queryKey: ["leads", "dashboard"],
    queryFn: () => listLeadsFn(),
    refetchInterval: 30000,
  });
  const comercialStats = useMemo(() => {
    const abertos = leads.filter((l) => l.stage !== "ganho" && l.stage !== "perdido");
    const novos = leads.filter((l) => l.stage === (DEFAULT_STAGES[0]?.key ?? "lead"));
    const valorFunil = abertos.reduce((s, l) => s + (l.value || 0), 0);
    return { abertos: abertos.length, novos: novos.length, valorFunil };
  }, [leads]);

  // Financeiro — saldo do mês corrente
  const financeiroEntries = useFinanceiroEntries();
  const financeiroMes = useMemo(() => {
    const mk = monthKey(new Date());
    let receita = 0;
    let despesa = 0;
    for (const e of financeiroEntries) {
      if (!e.date.startsWith(mk)) continue;
      if (e.kind === "receita") receita += e.amount;
      else despesa += e.amount;
    }
    return { receita, despesa, saldo: receita - despesa };
  }, [financeiroEntries]);

  const addPersonal = () => {
    const t = newPersonal.trim();
    if (!t) return;
    const next = [...personal, { id: `p_${Date.now()}`, text: t, done: false }];
    setPersonal(next);
    savePersonal(next);
    setNewPersonal("");
  };
  const togglePersonal = (id: string) => {
    const next = personal.map((p) => (p.id === id ? { ...p, done: !p.done } : p));
    setPersonal(next);
    savePersonal(next);
  };
  const removePersonal = (id: string) => {
    const next = personal.filter((p) => p.id !== id);
    setPersonal(next);
    savePersonal(next);
  };

  const openTask = (t: DashTask) => {
    if (t.campanhaId) {
      // Campanhas não têm rota própria (é tudo dentro de /time?section=campanhas,
      // navegação client-side) — mesmo deep-link por sessionStorage que o
      // indicador de timer ativo (AppShell) já usa pra abrir campanha + tarefa.
      sessionStorage.setItem(
        OPEN_CAMPANHA_TASK_KEY,
        JSON.stringify({ campanhaId: t.campanhaId, taskId: t.id }),
      );
      navigate({ to: "/time", search: { section: "campanhas" as SectionKey } });
      return;
    }
    navigate({ to: "/projeto/$id", params: { id: t.projectId }, search: { taskId: t.id } });
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-1">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {foto ? (
            <img src={foto} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              {greeting}, {name}
            </h1>
            <p className="text-xs text-muted-foreground">{today}</p>
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
                {CARD_DEFS.filter(
                  (c) => isAdmin || (c.key !== "comercial" && c.key !== "financeiro"),
                ).map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                  >
                    <span>{c.label}</span>
                    <input
                      type="checkbox"
                      checked={visible[c.key]}
                      onChange={() => setVisible((v) => ({ ...v, [c.key]: !v[c.key] }))}
                      className="h-3.5 w-3.5 accent-foreground"
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
        <div className="flex gap-x-6 overflow-x-auto whitespace-nowrap pb-1">
          <StatChip label="Hoje" value={hoje} />
          <StatChip label="Amanhã" value={amanha} />
          <StatChip label="7 dias" value={semana + hoje + amanha} />
          <StatChip label="Atrasadas" value={atrasadas} />
        </div>
      )}

      <MuralNovidades />

      {/* Widget grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* My Work */}
        {visible.work && (
          <Card className="lg:col-span-2">
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
              {filteredTasks.map((t) => (
                <button
                  key={`${t.projectId}_${t.id}`}
                  onClick={() => openTask(t)}
                  className="group flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40"
                >
                  <PriorityFlag priority={t.priority} bucket={t.bucket} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground group-hover:underline">
                      {t.title}
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
                      t.bucket === "atrasada" ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {t.due}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Agenda */}
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
            <div className="p-3">
              {todaysMeetings.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Nenhuma reunião hoje.
                </p>
              ) : (
                <ol className="relative space-y-0.5">
                  <span
                    className="absolute bottom-1 left-[3.4rem] top-1 w-px bg-border"
                    aria-hidden
                  />
                  {todaysMeetings.map((m) => (
                    <li key={m.id} className="relative">
                      <button
                        type="button"
                        onClick={() => setMeetingSummary(m)}
                        className="flex w-full items-start gap-3 rounded-md px-1 py-1.5 text-left hover:bg-muted/40"
                      >
                        <div className="w-11 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                          {m.hora}
                        </div>
                        <span className="relative z-10 mt-1.5 h-2 w-2 shrink-0 rounded-full bg-foreground ring-2 ring-background" />
                        <div className="min-w-0 flex-1 pb-0.5">
                          <p className="truncate text-xs font-medium text-foreground">{m.titulo}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {m.duracao} min · {m.local || m.com}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>
        )}

        {/* Comments */}
        {visible.comments && (
          <Card className="lg:col-span-2">
            <CardHeader
              icon={<MessageSquare className="h-4 w-4" />}
              title="Comentários atribuídos"
              action={
                mentionItems.length > 0 && (
                  <button
                    onClick={() => dismissMentions(mentionItems.map((m) => m.id))}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Limpar tudo
                  </button>
                )
              }
            />
            {mentionItems.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                Sem menções no momento.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {mentionItems.map((m) => (
                  <div key={m.id} className="group flex items-start gap-1 px-4 py-2.5">
                    <button
                      onClick={() => openMention(m.convoId)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground">
                          {m.authorName}{" "}
                          <span className="font-normal text-muted-foreground">
                            mencionou você em {m.convoLabel}
                          </span>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.text}</p>
                      </div>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                    <button
                      onClick={() => dismissMentions([m.id])}
                      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                      aria-label={`Limpar menção de ${m.authorName}`}
                      title={`Limpar menção de ${m.authorName}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Comercial */}
        {isAdmin && visible.comercial && (
          <Card>
            <CardHeader
              icon={<Target className="h-4 w-4" />}
              title="Funil comercial"
              action={
                <button
                  onClick={() =>
                    navigate({ to: "/time", search: { section: "comercial" as SectionKey } })
                  }
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Ver tudo
                </button>
              }
            />
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="px-4 py-3">
                <p className="text-[11px] text-muted-foreground">Leads novos</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                  {comercialStats.novos}
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-muted-foreground">Valor em aberto</p>
                <p className="mt-1 truncate text-lg font-semibold tabular-nums text-foreground">
                  {formatBRL(comercialStats.valorFunil)}
                </p>
              </div>
            </div>
            <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              {comercialStats.abertos} negociação(ões) em aberto
            </p>
          </Card>
        )}

        {/* Financeiro */}
        {isAdmin && visible.financeiro && (
          <Card>
            <CardHeader
              icon={<Wallet className="h-4 w-4" />}
              title="Financeiro do mês"
              action={
                <button
                  onClick={() =>
                    navigate({ to: "/time", search: { section: "financeiro" as SectionKey } })
                  }
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Ver tudo
                </button>
              }
            />
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="px-4 py-3">
                <p className="text-[11px] text-muted-foreground">Receita</p>
                <p className="mt-1 truncate text-lg font-semibold tabular-nums text-foreground">
                  {fmtBRL(financeiroMes.receita)}
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-muted-foreground">Despesa</p>
                <p className="mt-1 truncate text-lg font-semibold tabular-nums text-foreground">
                  {fmtBRL(financeiroMes.despesa)}
                </p>
              </div>
            </div>
            <p className="border-t border-border px-4 py-2 text-[11px] font-medium text-foreground">
              Saldo: {fmtBRL(financeiroMes.saldo)}
            </p>
          </Card>
        )}

        {/* Personal */}
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
                    className="h-3.5 w-3.5 rounded border-border accent-foreground"
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

      {/* Jogos do dia */}
      <Card>
        <CardHeader icon={<Puzzle className="h-4 w-4" />} title="Jogos do dia" />
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <button
            type="button"
            onClick={() => setZipOpen(true)}
            className="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
              <Puzzle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Zip do dia</p>
              <p className="text-xs text-muted-foreground">
                Conecte os pontos em ordem, com ranking do time.
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setSudokuOpen(true)}
            className="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
              <Grid3x3 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Mini sudoku do dia</p>
              <p className="text-xs text-muted-foreground">Grid 6x6, com ranking do time.</p>
            </div>
          </button>
        </div>
      </Card>

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
        onDelete={(id) => {
          const next = meetings.filter((x) => x.id !== id);
          setMeetings(next);
          saveMeetings(next);
          setMeetingSummary(null);
        }}
      />

      <Dialog open={zipOpen} onOpenChange={setZipOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-y-auto p-6">
          <DialogTitle className="sr-only">Zip do dia</DialogTitle>
          <ZipGameSection />
        </DialogContent>
      </Dialog>

      <Dialog open={sudokuOpen} onOpenChange={setSudokuOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-y-auto p-6">
          <DialogTitle className="sr-only">Mini sudoku do dia</DialogTitle>
          <SudokuGameSection />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-lg border border-border bg-background ${className}`}>
      {children}
    </div>
  );
}

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
        <h2 className="text-xs font-semibold">{title}</h2>
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
}: {
  icon?: ReactNode;
  label: string;
  value: number;
  tone?: "default" | "danger";
}) {
  return (
    <div className="flex shrink-0 items-baseline gap-2 border-l border-border pl-6 first:border-l-0 first:pl-0">
      <span className="text-xl font-semibold tabular-nums text-foreground">
        {value.toString().padStart(2, "0")}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
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
      ? "text-destructive"
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

function MuralNovidades() {
  const [items, setItems] = useState<Array<BlogPost & { projectName: string }>>([]);
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("inicio.mural.dismissed") || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const load = () => {
      const projs = loadProjetos();
      const all: Array<BlogPost & { projectName: string }> = [];
      for (const pr of projs) {
        for (const b of pr.blog ?? []) {
          if (b.audience === "mural") all.push({ ...b, projectName: pr.name });
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

  const visibleItems = items.filter((i) => !dismissed.includes(i.id));
  if (visibleItems.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Newspaper className="h-4 w-4" />
        <h2 className="text-sm font-semibold">Mural de novidades</h2>
        <span className="ml-auto text-[11px] text-muted-foreground">{visibleItems.length}</span>
      </div>
      <ul className="divide-y divide-border">
        {visibleItems.slice(0, 5).map((p) => (
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
                <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{p.excerpt}</p>
              )}
              <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{p.projectName}</span>
                {p.publishDate && <span>· {p.publishDate}</span>}
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

      <Dialog open={!!openArticle} onOpenChange={(v) => !v && setOpenArticle(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          {openArticle && (
            <>
              <DialogHeader className="border-b border-border px-6 py-4">
                <DialogTitle>{openArticle.title}</DialogTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{openArticle.projectName}</span>
                  {openArticle.publishDate && <span>· {openArticle.publishDate}</span>}
                </div>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {openArticle.cover && (
                  <img
                    src={openArticle.cover}
                    alt=""
                    className="mb-4 max-h-64 w-full rounded-lg object-cover"
                  />
                )}
                {openArticle.excerpt && openArticle.content && (
                  <p className="text-sm italic text-muted-foreground">{openArticle.excerpt}</p>
                )}
                <div
                  className={MARKDOWN_LITE_CLASSES}
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdownLite(openArticle.content ?? openArticle.excerpt ?? ""),
                  }}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
