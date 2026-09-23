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
  Star,
  Trash2,
  X,
  Sun,
  Moon,
  Cloud,
  CloudSun,
  CloudMoon,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudLightning,
  Snowflake,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { loadProjetos, onProjetosChange, loadTeamMembers, type BlogPost } from "@/lib/projetos";
import { renderMarkdownLite, ArticleReader } from "@/components/marketing/BlogPanel";
import {
  loadEngagementVI,
  toggleLikeVI,
  addCommentVI,
  deleteCommentVI,
  type BlogEngagement,
} from "@/lib/blog-engagement";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { EmptyState } from "@/components/shared/EmptyState";
import { SURFACE, TYPOGRAPHY } from "@/lib/design-tokens";
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
import { TASK_STATUS_TONE, TASK_STATUS_DOT, useTeamMembers } from "@/components/tasks/TaskBoard";
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
import { TomatoIcon } from "@/components/focus/TomatoIcon";
import { useWeather } from "@/hooks/use-weather";
import type { WeatherSnapshot } from "@/lib/weather-cache";
import { WeatherHeaderEffect } from "@/components/inicio/WeatherHeaderEffect";
import { WEATHER_CONDITION_LABEL_PT } from "@/lib/weather-condition";
import { currentHourInBrasilia } from "@/lib/timezone";
import { ManageCardsMenu } from "@/components/inicio/ManageCardsMenu";
import { useMyAccess, hasPermission, SECTION_PERMISSION } from "@/lib/permissions";
import { useFinanceiroEntries, remainingBalance, fmtBRL } from "@/lib/financeiro-entries";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listLeads } from "@/lib/comercial.functions";
import { legacyStage } from "@/lib/comercial-engine";
import { formatBRL as formatLeadBRL } from "@/lib/comercial";
import {
  listReminders,
  createReminder as createReminderServerFn,
  updateReminder as updateReminderServerFn,
  completeReminder as completeReminderServerFn,
  reopenReminder as reopenReminderServerFn,
  deleteReminder as deleteReminderServerFn,
  type ReminderPriority,
} from "@/lib/reminders.functions";
import { rowToReminder, pendingReminders } from "@/lib/reminders";
import { RemindersCard } from "@/components/inicio/RemindersCard";
import { ReminderFormDialog } from "@/components/inicio/ReminderFormDialog";
import { RemindersFullView } from "@/components/inicio/RemindersFullView";
import { QuickBreakCard } from "@/components/inicio/QuickBreakCard";

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

/** Estimativa de dia/noite pelo fuso `America/Sao_Paulo` (item 1: "usar
 * o fuso America/Sao_Paulo") — só usada como fallback pro fundo
 * atmosférico ANTES do primeiro clima carregar ou se o provedor estiver
 * fora do ar (`weather` ainda `null`); assim que a consulta real resolve,
 * `weather.isDay` (vindo do provedor, calculado pra Itaim Bibi) assume.
 * Nunca exibida — só decide entre o tratamento visual de dia ou de
 * noite do fundo. */
function isDayNowInSaoPaulo(): boolean {
  const hour = currentHourInBrasilia();
  return hour >= 6 && hour < 18;
}

/** Descrição acessível do bloco de clima — "Tempo nublado, 24 graus".
 * Nunca inclui localização (a localização fixa do serviço,
 * `weather-location.ts`, é só configuração interna da consulta, nunca
 * aparece pra quem usa a plataforma nem por texto nem por leitor de
 * tela). Condição "unknown" some da frase em vez de virar texto técnico
 * ou "undefined". */
function formatWeatherAccessibleLabel(weather: WeatherSnapshot): string {
  const label = WEATHER_CONDITION_LABEL_PT[weather.condition];
  const temp = `${Math.round(weather.temperatureC)} graus`;
  return label ? `Tempo ${label.toLowerCase()}, ${temp}` : temp;
}

/** Ícone decorativo do clima — só depende de `condition`/`isDay`, os
 * únicos dois dados que a interface conhece sobre o clima. */
function WeatherIcon({
  condition,
  isDay,
  className,
}: {
  condition: WeatherSnapshot["condition"];
  isDay: boolean;
  className?: string;
}) {
  switch (condition) {
    case "clear":
      return isDay ? (
        <Sun className={className} aria-hidden="true" />
      ) : (
        <Moon className={className} aria-hidden="true" />
      );
    case "partly-cloudy":
      return isDay ? (
        <CloudSun className={className} aria-hidden="true" />
      ) : (
        <CloudMoon className={className} aria-hidden="true" />
      );
    case "cloudy":
      return <Cloud className={className} aria-hidden="true" />;
    case "fog":
      return <CloudFog className={className} aria-hidden="true" />;
    case "drizzle":
      return <CloudDrizzle className={className} aria-hidden="true" />;
    case "rain":
    case "heavy-rain":
      return <CloudRain className={className} aria-hidden="true" />;
    case "thunderstorm":
      return <CloudLightning className={className} aria-hidden="true" />;
    case "snow":
      return <Snowflake className={className} aria-hidden="true" />;
    default:
      return <Cloud className={className} aria-hidden="true" />;
  }
}

function loadPerfil(): { nome?: string; foto?: string } {
  try {
    const raw = localStorage.getItem("config:perfil");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Fonte de verdade das preferências de "Personalizar início" passa a ser
// `profiles.dashboard_prefs` (por usuário, sincroniza entre dispositivos —
// antes era só `localStorage`, resetava por navegador). O cache local é só
// pra pintar a preferência instantaneamente no primeiro render, mesmo
// padrão já usado pelos lembretes (antiga "lista pessoal").
const DASHBOARD_PREFS_CACHE_KEY = "inicio.dashboardPrefs.cache";

export type CardKey =
  | "stats"
  | "work"
  | "agenda"
  | "comments"
  | "reminders"
  | "quickBreak"
  | "financeiro"
  | "comercial";
/** `permission`, quando presente, é checado contra `SECTION_PERMISSION`
 * antes de o card aparecer tanto no menu "Personalizar início" quanto no
 * corpo da página — quem não tem a permissão da seção correspondente
 * nunca vê a opção de ligar o card, nem por engano via preferência salva
 * (`visible.financeiro`/`visible.comercial` são sempre revalidados contra
 * o acesso atual no render, nunca só confiados do que foi salvo). */
const CARD_DEFS: {
  key: CardKey;
  label: string;
  description: string;
  permission?: "financeiro" | "comercial";
}[] = [
  { key: "stats", label: "Resumo", description: "Contadores rápidos de hoje, amanhã e atrasadas" },
  { key: "work", label: "Meu trabalho", description: "Suas tarefas organizadas por prazo" },
  { key: "agenda", label: "Agenda", description: "Próximos compromissos e reuniões" },
  {
    key: "financeiro",
    label: "Financeiro",
    description: "Resumo de valores vencidos",
    permission: "financeiro",
  },
  {
    key: "comercial",
    label: "Comercial",
    description: "Leads novos do pipeline",
    permission: "comercial",
  },
  {
    key: "comments",
    label: "Comentários atribuídos",
    description: "Menções recentes em comentários",
  },
  { key: "reminders", label: "Lembretes", description: "Seus lembretes pessoais e privados" },
  { key: "quickBreak", label: "Pausa rápida", description: "ZIP e Termo, uma pausa entre tarefas" },
];
const CARD_KEYS = CARD_DEFS.map((c) => c.key);
const DEFAULT_VISIBLE: Record<CardKey, boolean> = {
  stats: true,
  work: true,
  agenda: true,
  comments: true,
  reminders: true,
  quickBreak: true,
  financeiro: true,
  comercial: true,
};
/** Ids de cards removidos em rodadas anteriores — se sobrar na preferência
 * salva de alguém, é só ignorado (nunca lido em nenhum `visible.*`), sem
 * quebrar a leitura do restante das preferências. */
function sanitizeVisible(raw: Record<string, boolean>): Record<CardKey, boolean> {
  const next = { ...DEFAULT_VISIBLE };
  for (const key of Object.keys(next) as CardKey[]) {
    if (typeof raw[key] === "boolean") next[key] = raw[key];
  }
  return next;
}
function sanitizeOrder(raw: unknown): CardKey[] {
  if (!Array.isArray(raw)) return CARD_KEYS;
  const valid = raw.filter((k): k is CardKey => CARD_KEYS.includes(k as CardKey));
  const missing = CARD_KEYS.filter((k) => !valid.includes(k));
  return [...valid, ...missing];
}
type DashboardPrefs = { visible: Record<CardKey, boolean>; order: CardKey[] };
const DEFAULT_DASHBOARD_PREFS: DashboardPrefs = { visible: DEFAULT_VISIBLE, order: CARD_KEYS };
function loadDashboardPrefsCache(): DashboardPrefs {
  try {
    const raw = localStorage.getItem(DASHBOARD_PREFS_CACHE_KEY);
    if (!raw) return DEFAULT_DASHBOARD_PREFS;
    const parsed = JSON.parse(raw) as Partial<DashboardPrefs>;
    return {
      visible: sanitizeVisible(parsed.visible ?? {}),
      order: sanitizeOrder(parsed.order),
    };
  } catch {
    return DEFAULT_DASHBOARD_PREFS;
  }
}
function cacheDashboardPrefs(prefs: DashboardPrefs) {
  try {
    localStorage.setItem(DASHBOARD_PREFS_CACHE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

// Preferência "Ambiente climático no cabeçalho" (item 11 do pedido) —
// mesmo mecanismo de "Gerenciar cards" (persistida em localStorage,
// lida uma vez no estado inicial), só que numa chave própria: não é um
// card exibido/ocultado do corpo da página, é o efeito visual do
// cabeçalho, então não faz sentido misturar com `CardKey`/`visible`.
const WEATHER_ENABLED_KEY = "inicio.weather.enabled";
function loadWeatherEnabledPref(): boolean {
  try {
    const raw = localStorage.getItem(WEATHER_ENABLED_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

type TaskFilter = "hoje" | "atrasada" | "semana";

/** Prazo mais próximo primeiro — antes a lista de "Meu trabalho" ficava
 * na ordem de varredura (por pessoa/projeto), sem nenhum critério de
 * urgência visível; `dueISO` é a mesma data usada pra calcular `bucket`,
 * então ordenar por ela nunca diverge do agrupamento hoje/amanhã/semana
 * já exibido. Tarefa sem prazo (não deveria acontecer nesses buckets,
 * mas por segurança) vai pro fim, nunca primeiro. */
function byDueAsc(a: DashTask, b: DashTask): number {
  if (!a.dueISO && !b.dueISO) return 0;
  if (!a.dueISO) return 1;
  if (!b.dueISO) return -1;
  return a.dueISO.localeCompare(b.dueISO);
}

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
  const [tasks, setTasks] = useState<DashTask[]>([]);
  const [taskCommentMentions, setTaskCommentMentions] = useState<TaskCommentMention[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingSummary, setMeetingSummary] = useState<Meeting | null>(null);
  const [workExpanded, setWorkExpanded] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const workCardRef = useRef<HTMLDivElement>(null);
  const { confirm, confirmDialog } = useConfirm();
  const access = useMyAccess();
  const canFinanceiro = hasPermission(access, SECTION_PERMISSION.financeiro);
  const canComercial = hasPermission(access, SECTION_PERMISSION.comercial);
  const unsortedVisibleCardDefs = CARD_DEFS.filter(
    (c) => !c.permission || (c.permission === "financeiro" ? canFinanceiro : canComercial),
  );
  const financeiroEntries = useFinanceiroEntries();
  const financeiroVencido = useMemo(() => {
    if (!canFinanceiro) return { aReceber: 0, aPagar: 0 };
    let aReceber = 0;
    let aPagar = 0;
    for (const e of financeiroEntries) {
      if (e.status !== "vencido") continue;
      if (e.kind === "receita") aReceber += remainingBalance(e);
      else aPagar += remainingBalance(e);
    }
    return { aReceber, aPagar };
  }, [financeiroEntries, canFinanceiro]);

  const [dashboardPrefs, setDashboardPrefs] = useState<DashboardPrefs>(() =>
    typeof window === "undefined" ? DEFAULT_DASHBOARD_PREFS : loadDashboardPrefsCache(),
  );
  const visible = dashboardPrefs.visible;
  const visibleCardDefs = [...unsortedVisibleCardDefs].sort(
    (a, b) => dashboardPrefs.order.indexOf(a.key) - dashboardPrefs.order.indexOf(b.key),
  );

  // Mesma `queryKey` já usada em `ComercialSection.tsx` — compartilha
  // cache/refetch com a tela cheia do Comercial em vez de duplicar a
  // busca; só dispara quando o card está visível E a pessoa tem permissão
  // (nunca busca leads pra quem não pode ver Comercial).
  const listLeadsFn = useServerFn(listLeads);
  const { data: comercialLeads = [] } = useQuery({
    queryKey: ["leads"],
    queryFn: () => listLeadsFn(),
    enabled: canComercial && visible.comercial,
    refetchInterval: 15000,
  });
  const novosLeads = useMemo(
    () => comercialLeads.filter((l) => legacyStage(l.stage) === "LEAD_RECEBIDO"),
    [comercialLeads],
  );

  /** Escreve a preferência (visibilidade/ordem dos cards) em
   * `profiles.dashboard_prefs` — por usuário (RLS `auth.uid() = id`),
   * nunca afeta o dashboard de outra pessoa. Mesmo padrão de
   * `persistReminders`/antiga `persistPersonal`: atualiza local + cache +
   * grava no banco, sem esperar round-trip pra refletir na tela. */
  const persistDashboardPrefs = (next: DashboardPrefs) => {
    setDashboardPrefs(next);
    cacheDashboardPrefs(next);
    const userId = getMe().id;
    if (!userId) return;
    void supabase
      .from("profiles")
      .update({ dashboard_prefs: next } as never)
      .eq("id", userId)
      .then(({ error }) => {
        if (error) console.warn("[inicio.dashboardPrefs] save failed", error);
      });
  };
  const setVisible = (updater: (v: Record<CardKey, boolean>) => Record<CardKey, boolean>) => {
    persistDashboardPrefs({ ...dashboardPrefs, visible: updater(dashboardPrefs.visible) });
  };
  const reorderCards = (fromKey: CardKey, toKey: CardKey) => {
    const order = [...dashboardPrefs.order];
    const fromIdx = order.indexOf(fromKey);
    const toIdx = order.indexOf(toKey);
    if (fromIdx === -1 || toIdx === -1) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, fromKey);
    persistDashboardPrefs({ ...dashboardPrefs, order });
  };

  // Carrega a preferência real do banco (o cache local só serve pro
  // primeiro paint) e mantém em sincronia entre dispositivos/abas via
  // canal realtime próprio, filtrado pelo id do usuário — mesmo mecanismo
  // já usado pelos lembretes.
  useEffect(() => {
    const userId = getMe().id;
    if (!userId) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("dashboard_prefs")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const raw = (data.dashboard_prefs as Partial<DashboardPrefs> | null) ?? {};
        const prefs: DashboardPrefs = {
          visible: sanitizeVisible(raw.visible ?? {}),
          order: sanitizeOrder(raw.order),
        };
        setDashboardPrefs(prefs);
        cacheDashboardPrefs(prefs);
      });
    const channel = supabase
      .channel(`rt-dashboard-prefs-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        (payload) => {
          const raw = ((payload.new as { dashboard_prefs?: Partial<DashboardPrefs> } | null)
            ?.dashboard_prefs ?? {}) as Partial<DashboardPrefs>;
          const prefs: DashboardPrefs = {
            visible: sanitizeVisible(raw.visible ?? {}),
            order: sanitizeOrder(raw.order),
          };
          setDashboardPrefs(prefs);
          cacheDashboardPrefs(prefs);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  const [weatherEnabled, setWeatherEnabled] = useState<boolean>(() => loadWeatherEnabledPref());
  useEffect(() => {
    try {
      localStorage.setItem(WEATHER_ENABLED_KEY, String(weatherEnabled));
    } catch {
      /* ignore */
    }
  }, [weatherEnabled]);
  // Localização sempre fixa (Itaim Bibi) — nunca geolocalização/IP/perfil
  // (item 1). Desligar a preferência evita a própria consulta (item 11:
  // "a consulta climática pode ser evitada se a temperatura também
  // estiver oculta").
  const { weather } = useWeather(weatherEnabled);

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

  // Lembretes (antes "lista pessoal") agora vivem em `personal_reminders`,
  // buscados via React Query (ver `remindersQuery` mais abaixo, perto de
  // onde são usados) — nunca mais um efeito manual + canal realtime
  // próprio aqui; o realtime de troca de dispositivo é coberto pelo
  // `refetchInterval` da query, suficiente pra um dado pessoal de baixa
  // frequência de mudança.

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
    if (filter === "hoje") return tasks.filter((t) => t.bucket === "hoje").sort(byDueAsc);
    if (filter === "atrasada") return tasks.filter((t) => t.bucket === "atrasada").sort(byDueAsc);
    return tasks.filter((t) => ["hoje", "amanha", "semana"].includes(t.bucket)).sort(byDueAsc);
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

  // Lembretes — React Query + server functions (`reminders.functions.ts`),
  // RLS garante que só os próprios lembretes de quem está logado aparecem
  // aqui, nunca precisa filtrar por usuário no cliente.
  const listRemindersFn = useServerFn(listReminders);
  const createReminderFn = useServerFn(createReminderServerFn);
  const updateReminderFn = useServerFn(updateReminderServerFn);
  const completeReminderFn = useServerFn(completeReminderServerFn);
  const reopenReminderFn = useServerFn(reopenReminderServerFn);
  const deleteReminderFn = useServerFn(deleteReminderServerFn);
  const queryClient = useQueryClient();
  const { data: reminderRows = [] } = useQuery({
    queryKey: ["personal-reminders"],
    queryFn: () => listRemindersFn(),
    refetchInterval: 30000,
  });
  const reminders = useMemo(() => reminderRows.map(rowToReminder), [reminderRows]);
  const invalidateReminders = () =>
    queryClient.invalidateQueries({ queryKey: ["personal-reminders"] });
  const createReminderMutation = useMutation({
    mutationFn: (input: {
      title: string;
      notes?: string;
      dueAt?: string;
      priority: ReminderPriority;
    }) => createReminderFn({ data: input }),
    onSuccess: invalidateReminders,
  });
  const updateReminderMutation = useMutation({
    mutationFn: (input: {
      id: string;
      title?: string;
      notes?: string;
      dueAt?: string | null;
      priority?: ReminderPriority;
    }) => updateReminderFn({ data: input }),
    onSuccess: invalidateReminders,
  });
  const completeReminderMutation = useMutation({
    mutationFn: (id: string) => completeReminderFn({ data: { id } }),
    onSuccess: invalidateReminders,
  });
  const reopenReminderMutation = useMutation({
    mutationFn: (id: string) => reopenReminderFn({ data: { id } }),
    onSuccess: invalidateReminders,
  });
  const deleteReminderMutation = useMutation({
    mutationFn: (id: string) => deleteReminderFn({ data: { id } }),
    onSuccess: invalidateReminders,
  });
  const [reminderFormOpen, setReminderFormOpen] = useState(false);
  const [remindersFullViewOpen, setRemindersFullViewOpen] = useState(false);

  const openTask = (t: Pick<DashTask, "id" | "projectId" | "campanhaId" | "parentId">) => {
    // O deep-link (`?taskId=`) já resolve subtarefa (procura dentro de
    // `subtasks` da tarefa-mãe e abre o mesmo diálogo já direto nela —
    // ver `initialOpenTaskId` em `TaskBoard.tsx`), então passa o id da
    // própria tarefa/subtarefa clicada, nunca mais o do pai.
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

  const goToFocus = (t: Pick<DashTask, "id" | "parentId">) => {
    // `findTaskContext` (Modo Foco) já procura em `subtasks` também —
    // passa o id de verdade, sem colapsar pro pai.
    const targetId = t.id.replace(/^mkt:/, "");
    navigate({
      to: "/foco",
      search: { taskId: targetId, from: `${window.location.pathname}${window.location.search}` },
    });
  };

  const visibleWorkTasks = workExpanded ? filteredTasks : filteredTasks.slice(0, WORK_PAGE_SIZE);
  const visibleComments = commentsExpanded
    ? assignedComments
    : assignedComments.slice(0, COMMENTS_PAGE_SIZE);

  return (
    <PageContainer className="space-y-6 md:space-y-8">
      {/* Header — bloco único: saudação+clima em cima, indicadores
       * embutidos embaixo (item 2/3 do pedido). O ambiente climático
       * (`WeatherHeaderEffect`) fica restrito a este cabeçalho, nunca no
       * resto da Home, e nunca expõe a localização real da consulta
       * (Itaim Bibi é só configuração interna do serviço, item 1) — a
       * interface só conhece `condition`/`isDay`. `overflow-hidden`
       * garante que nenhuma gota/névoa escape pra fora do cabeçalho. */}
      <header className="relative overflow-hidden rounded-2xl">
        {/* Fundo sempre válido pra qualquer clima (item 4) — renderizado
         * sempre que a preferência está ligada, mesmo antes do primeiro
         * clima carregar ou se a consulta falhar (`weather` ainda
         * `null`): nesses casos usa "unknown" + um dia/noite estimado
         * pelo fuso America/Sao_Paulo só pra decidir o tom do fundo,
         * nunca exibido. Assim que o clima real chega, ele assume. */}
        {weatherEnabled && (
          <WeatherHeaderEffect
            condition={weather?.condition ?? "unknown"}
            isDay={weather?.isDay ?? isDayNowInSaoPaulo()}
          />
        )}

        <div className="relative z-10 flex flex-col">
          <div className="flex flex-1 flex-wrap items-center justify-between gap-4 p-5 sm:min-h-[150px] md:min-h-[170px] md:p-7">
            {/* Esquerda: foto + saudação + data (item 2) */}
            <div className="flex items-center gap-4">
              {foto ? (
                <img
                  src={foto}
                  alt=""
                  className="h-14 w-14 rounded-full object-cover md:h-16 md:w-16"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-xl font-semibold text-background md:h-16 md:w-16">
                  {name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-2xl font-semibold tracking-tight text-foreground md:text-[26px]">
                  {greeting}, {name}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{today}</p>
              </div>
            </div>

            {/* Direita: só ícone + temperatura + condição + ação (item
             * 2) — nunca uma terceira linha com bairro/cidade (item 1).
             * Some inteiro (sem placeholder, sem espaço reservado) se o
             * clima não estiver disponível — a altura do cabeçalho não
             * depende dele (item 5). */}
            <div className="flex items-center gap-4">
              {weatherEnabled && weather && (
                <div
                  className="flex items-center gap-2.5"
                  aria-label={formatWeatherAccessibleLabel(weather)}
                >
                  <WeatherIcon
                    condition={weather.condition}
                    isDay={weather.isDay}
                    className="h-7 w-7 shrink-0 text-muted-foreground/70"
                  />
                  <div className="text-right leading-tight">
                    <p className="text-4xl font-semibold tracking-tight text-foreground">
                      {Math.round(weather.temperatureC)}°
                    </p>
                    {WEATHER_CONDITION_LABEL_PT[weather.condition] && (
                      <p className="text-sm text-muted-foreground">
                        {WEATHER_CONDITION_LABEL_PT[weather.condition]}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <ManageCardsMenu
                cardDefs={visibleCardDefs}
                visible={visible}
                onToggleCard={(key) => setVisible((v) => ({ ...v, [key]: !v[key] }))}
                onReorder={reorderCards}
                onRestoreDefaults={() => persistDashboardPrefs(DEFAULT_DASHBOARD_PREFS)}
                weatherEnabled={weatherEnabled}
                onToggleWeather={() => setWeatherEnabled((v) => !v)}
              />
            </div>
          </div>

          {/* Indicadores embutidos no cabeçalho (item 3) — faixa
           * segmentada de largura total no desktop, grade 2×2 no
           * mobile; divisores discretos entre células, nunca quatro
           * cards isolados. Superfície sólida (não a camada
           * atmosférica) pra continuar legível em qualquer clima. */}
          {visible.stats && (
            <div className="relative z-10 grid grid-cols-2 divide-x divide-y divide-border/60 border-t border-border/60 bg-background/90 md:grid-cols-4 md:divide-y-0">
              <HeaderIndicatorCell
                label="Hoje"
                value={hoje}
                active={filter === "hoje"}
                onClick={() => goToWork("hoje")}
              />
              <HeaderIndicatorCell
                label="Amanhã"
                value={amanha}
                onClick={() => goToWork("semana")}
              />
              <HeaderIndicatorCell
                label="Próximos 7 dias"
                value={proximos7Dias}
                active={filter === "semana"}
                onClick={() => goToWork("semana")}
              />
              <HeaderIndicatorCell
                label="Atrasadas"
                value={atrasadas}
                tone="danger"
                active={filter === "atrasada"}
                onClick={() => goToWork("atrasada")}
              />
            </div>
          )}
        </div>
      </header>

      {/* Linha operacional principal */}
      {(visible.work || visible.agenda) && (
        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
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
              <div className="divide-y divide-border/70">
                {filteredTasks.length === 0 && (
                  <EmptyState
                    compact
                    icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                    title="Nada por aqui. Bom trabalho."
                  />
                )}
                {visibleWorkTasks.map((t) => (
                  <div
                    key={`${t.projectId}_${t.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openTask(t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openTask(t);
                      }
                    }}
                    className="group flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:px-5"
                  >
                    <PriorityFlag priority={t.priority} bucket={t.bucket} />
                    <div className="min-w-0 flex-1">
                      <p
                        className="flex min-w-0 items-center gap-1.5 truncate text-sm text-foreground group-hover:underline"
                        title={t.title}
                      >
                        {t.parentTitle && (
                          <span
                            title={`Subtarefa de "${t.parentTitle}"`}
                            className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-muted-foreground"
                          >
                            Sub
                          </span>
                        )}
                        <span className="truncate">{t.title}</span>
                      </p>
                    </div>
                    <span
                      className={`hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline-flex ${TASK_STATUS_TONE[t.status]}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${TASK_STATUS_DOT[t.status]}`} />
                      {t.status}
                    </span>
                    <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
                      {t.projectName}
                    </Badge>
                    <span
                      className={`shrink-0 text-xs tabular-nums ${
                        t.bucket === "atrasada" ? "text-danger" : "text-muted-foreground"
                      }`}
                    >
                      {t.due}
                    </span>
                    <IconButton
                      label="Iniciar foco nesta tarefa"
                      tone="neutral"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToFocus(t);
                      }}
                      className="h-7 w-7 shrink-0 text-muted-foreground/70 opacity-60 transition-opacity hover:text-brand focus-visible:opacity-100"
                    >
                      <TomatoIcon className="h-3.5 w-3.5" />
                    </IconButton>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                ))}
                {filteredTasks.length > WORK_PAGE_SIZE && (
                  <button
                    type="button"
                    onClick={() => setWorkExpanded((v) => !v)}
                    className="flex w-full items-center justify-center gap-1 px-4 py-2.5 text-xs font-medium text-brand hover:underline"
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
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Ver tudo
                  </button>
                }
              />
              {todaysMeetings.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Calendar className="h-4 w-4" aria-hidden="true" />}
                  title="Nenhuma reunião hoje."
                />
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
                            className="flex w-full items-start gap-3 rounded-xl border border-brand/30 bg-brand-subtle px-3 py-2.5 text-left transition-colors hover:bg-brand-subtle/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <div className="shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-brand">
                              {m.hora}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className="truncate text-sm font-medium text-foreground"
                                title={m.titulo}
                              >
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
                          className={`flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            isPast ? "opacity-50" : ""
                          }`}
                        >
                          <div className="w-11 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                            {m.hora}
                          </div>
                          <div className="min-w-0 flex-1 pb-0.5">
                            <p
                              className="truncate text-xs font-medium text-foreground"
                              title={m.titulo}
                            >
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

      {(visible.comments || visible.reminders) && (
        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
          {visible.comments && (
            <Card className="lg:col-span-2">
              <CardHeader
                icon={<MessageSquare className="h-4 w-4" />}
                title="Comentários atribuídos"
                action={
                  assignedComments.length > 0 && (
                    <button
                      onClick={() => void clearAllComments()}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      Limpar tudo
                    </button>
                  )
                }
              />
              {assignedComments.length === 0 ? (
                <EmptyState
                  compact
                  icon={<MessageSquare className="h-4 w-4" aria-hidden="true" />}
                  title="Sem menções no momento."
                />
              ) : (
                <>
                  <div
                    className={`divide-y divide-border/70 ${commentsExpanded ? "max-h-[26rem] overflow-y-auto" : ""}`}
                  >
                    {visibleComments.map((c) => (
                      <div
                        key={c.key}
                        className="group relative flex items-start gap-1 px-4 py-2.5 md:px-5"
                      >
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                          aria-hidden="true"
                        />
                        <button
                          onClick={c.onOpen}
                          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="truncate text-xs font-medium text-foreground">
                                {c.author}{" "}
                                <span className="font-normal text-muted-foreground">
                                  mencionou você em {c.context}
                                </span>
                              </p>
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {fmtCommentAt(c.at)}
                              </span>
                            </div>
                            <p
                              className="mt-0.5 truncate text-xs text-muted-foreground"
                              title={c.text}
                            >
                              {c.text}
                            </p>
                          </div>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                        <IconButton
                          label={`Limpar menção de ${c.author}`}
                          tone="neutral"
                          onClick={c.onDismiss}
                          className="h-7 w-7 shrink-0 text-muted-foreground/60 opacity-60 transition-opacity hover:text-foreground focus-visible:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                  {assignedComments.length > COMMENTS_PAGE_SIZE && (
                    <button
                      type="button"
                      onClick={() => setCommentsExpanded((v) => !v)}
                      className="flex w-full items-center justify-center gap-1 border-t border-border/70 px-4 py-2.5 text-xs font-medium text-brand hover:underline"
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

          {visible.reminders && (
            <RemindersCard
              reminders={pendingReminders(reminders)}
              onCreate={() => setReminderFormOpen(true)}
              onComplete={(id) => completeReminderMutation.mutate(id)}
              onViewAll={() => setRemindersFullViewOpen(true)}
            />
          )}
        </div>
      )}

      {visible.quickBreak && <QuickBreakCard />}

      {reminderFormOpen && (
        <ReminderFormDialog
          open={reminderFormOpen}
          onOpenChange={setReminderFormOpen}
          onSubmit={async (input) => {
            await createReminderMutation.mutateAsync(input);
          }}
        />
      )}
      {remindersFullViewOpen && (
        <RemindersFullView
          open={remindersFullViewOpen}
          onOpenChange={setRemindersFullViewOpen}
          reminders={reminders}
          onCreate={() => {
            setRemindersFullViewOpen(false);
            setReminderFormOpen(true);
          }}
          onComplete={(id) => completeReminderMutation.mutate(id)}
          onReopen={(id) => reopenReminderMutation.mutate(id)}
          onUpdate={async (input) => {
            await updateReminderMutation.mutateAsync(input);
          }}
          onDelete={async (id) => {
            await deleteReminderMutation.mutateAsync(id);
          }}
        />
      )}

      {/* Financeiro/Comercial — só aparecem pra quem tem a permissão da
       * seção correspondente (`visibleCardDefs` já filtra a opção fora do
       * menu "Gerenciar cards", e aqui a mesma checagem é revalidada antes
       * de renderizar, nunca só confiando no que ficou salvo em
       * `visible.*` no localStorage de antes de uma permissão mudar). */}
      {((visible.financeiro && canFinanceiro) || (visible.comercial && canComercial)) && (
        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
          {visible.financeiro && canFinanceiro && (
            <Card>
              <CardHeader icon={<Wallet className="h-4 w-4" />} title="Financeiro" />
              <div className="grid grid-cols-2 gap-3 p-3 md:p-4">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-[11px] text-muted-foreground">Vencido a receber</p>
                  <p className="mt-0.5 text-lg font-semibold text-foreground">
                    {fmtBRL(financeiroVencido.aReceber)}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-[11px] text-muted-foreground">Vencido a pagar</p>
                  <p className="mt-0.5 text-lg font-semibold text-foreground">
                    {fmtBRL(financeiroVencido.aPagar)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  navigate({ to: "/time", search: { section: "financeiro" as SectionKey } })
                }
                className="flex w-full items-center justify-center gap-1 border-t border-border/70 px-4 py-2.5 text-xs font-medium text-brand hover:underline"
              >
                Abrir Financeiro
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </Card>
          )}

          {visible.comercial && canComercial && (
            <Card>
              <CardHeader
                icon={<TrendingUp className="h-4 w-4" />}
                title="Comercial"
                action={
                  <span className="text-[11px] text-muted-foreground">
                    {novosLeads.length} novo{novosLeads.length === 1 ? "" : "s"}
                  </span>
                }
              />
              {novosLeads.length === 0 ? (
                <EmptyState compact title="Nenhum lead novo no momento." />
              ) : (
                <ul className="divide-y divide-border/70">
                  {novosLeads.slice(0, 5).map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between gap-2 px-4 py-2 md:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">{l.name}</p>
                        {l.company && (
                          <p className="truncate text-[11px] text-muted-foreground">{l.company}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-medium text-foreground">
                        {formatLeadBRL(l.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() =>
                  navigate({ to: "/time", search: { section: "comercial" as SectionKey } })
                }
                className="flex w-full items-center justify-center gap-1 border-t border-border/70 px-4 py-2.5 text-xs font-medium text-brand hover:underline"
              >
                Abrir Comercial
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
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

/** Superfície de seção da Home — mesmo tratamento em todos os 5 cards
 * (`Meu trabalho`, `Agenda`, `Mural`, `Comentários`, `Lembretes`) e
 * mesmo raio do cabeçalho climático aprovado (`rounded-2xl`), pra tudo
 * parecer parte de um único produto em vez de caixas isoladas com
 * tratamentos divergentes. */
export const Card = ({
  children,
  className = "",
  ref,
}: {
  children: ReactNode;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}) => (
  <div ref={ref} className={`overflow-hidden rounded-2xl ${SURFACE.raised} ${className}`}>
    {children}
  </div>
);

/** Cabeçalho integrado ao próprio card — sem barra retangular separada
 * (sem `border-b`), ícone e título com o mesmo peso/tamanho em toda a
 * Home, ação alinhada à direita e livre pra quebrar numa segunda linha
 * em telas estreitas em vez de comprimir. */
export function CardHeader({
  icon,
  title,
  action,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 md:px-5">
      <div className="flex items-center gap-2 text-foreground">
        <span className="text-muted-foreground" aria-hidden="true">
          {icon}
        </span>
        <p className={TYPOGRAPHY.cardTitle}>{title}</p>
      </div>
      {action}
    </div>
  );
}

/** Grupo de tabs em pill — usado só em "Meu trabalho". Ativo com fundo
 * de marca bem sutil (`bg-brand-subtle`, mesmo tom que badges/chips de
 * marca usam em todo o resto da plataforma) em vez do antigo botão
 * branco/preto sólido. */
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
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "bg-brand-subtle text-brand"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** Célula de indicador embutida no cabeçalho (item 3 do pedido) — faixa
 * segmentada única, sem borda/raio próprios (os divisores vêm do
 * `divide-x`/`divide-y` do contêiner pai); vermelho só quando `tone`
 * é "danger" E há tarefas de verdade (nunca decorativo). */
function HeaderIndicatorCell({
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
      className={`flex flex-col items-center justify-center gap-0.5 px-3 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
        active ? "bg-brand/10" : "hover:bg-muted/50"
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
  // Mesma lista de pessoas mencionáveis já usada nos comentários de
  // tarefa — reaproveitada aqui pra @menção nos comentários dos artigos
  // do Mural (nunca passada pro Portal do cliente, que não importa
  // `MuralNovidades`).
  const teamMembers = useTeamMembers();
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
    <Card>
      <CardHeader
        icon={<Newspaper className="h-4 w-4" />}
        title="Mural de novidades"
        action={
          rest.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {showAll ? "Ver menos" : `Ver todas (${visibleItems.length})`}
            </button>
          )
        }
      />

      {!showAll ? (
        <div className="group flex flex-col gap-4 px-4 pb-4 sm:flex-row md:px-5 md:pb-5">
          {featured.cover && (
            <button
              type="button"
              onClick={() => setOpenArticle(featured)}
              className="shrink-0 overflow-hidden rounded-xl sm:w-40 md:w-44"
            >
              <img
                src={featured.cover}
                alt=""
                className="h-32 w-full object-cover object-center transition-transform group-hover:scale-[1.02] sm:h-full"
              />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => setOpenArticle(featured)}
                className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {featured.category && (
                  <Badge variant="secondary" className="rounded-full uppercase tracking-wide">
                    {featured.category}
                  </Badge>
                )}
                <p className="mt-1.5 truncate text-base font-semibold text-foreground hover:underline">
                  {featured.title}
                </p>
                {featured.excerpt && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {featured.excerpt}
                  </p>
                )}
              </button>
              <IconButton
                label="Dispensar"
                tone="neutral"
                onClick={() => dismiss(featured.id)}
                className="h-7 w-7 shrink-0 text-muted-foreground/60 opacity-60 transition-opacity hover:text-foreground focus-visible:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </IconButton>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{featured.authorName || "Sem autor"}</span>
              <span>· {featured.projectName}</span>
              {featured.publishDate && <span>· {fmtPublishDate(featured.publishDate)}</span>}
            </div>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border/70">
          {visibleItems.map((p) => (
            <li key={p.id} className="group flex gap-3 px-4 py-3 md:px-5">
              {p.cover && (
                <img src={p.cover} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />
              )}
              <button
                type="button"
                onClick={() => setOpenArticle(p)}
                className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <IconButton
                label="Dispensar"
                tone="neutral"
                onClick={() => dismiss(p.id)}
                className="h-7 w-7 shrink-0 self-start text-muted-foreground/60 opacity-60 transition-opacity hover:text-foreground focus-visible:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </IconButton>
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
                      onDeleteComment: async (commentId) => {
                        await deleteCommentVI(commentId);
                        const next = await loadEngagementVI(openArticle.id);
                        setEngagement(next);
                      },
                      mentionMembers: teamMembers,
                    }}
                  />
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
