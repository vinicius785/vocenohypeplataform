import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronRight,
  ChevronDown,
  Clock,
  FileText,
  Flag,
  CircleDashed,
  Tag,
  User,
  Paperclip,
  Play,
  Pause,
  Plus,
  Trash2,
  X,
  Check,
  Download,
  ExternalLink,
  CornerUpRight,
  Star,
  ArrowUpDown,
  Filter,
  AlertTriangle,
  MessageSquare,
  MoreHorizontal,
  Search,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { type TaskRecurrence, computeNextRecurrenceDueDate } from "@/lib/task-recurrence";
import {
  useTaskDependencies,
  dependenciesOf,
  createDependency,
  removeDependency,
  cleanupDependenciesForTask,
  type TaskDependency,
} from "@/lib/task-dependencies-store";
import { useTaskDirectory, type TaskDirectoryEntry } from "@/lib/task-directory";
import { pushTaskModal } from "@/lib/task-modal-stack";
import { TaskPicker } from "@/components/tasks/TaskPicker";
import { formatIsoDate } from "@/lib/utils";

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateField } from "@/components/ui/date-field";
import { TimeTrackingPanel } from "@/components/tasks/TimeTrackingPanel";
import { stopIfRunningOnTask } from "@/lib/time-entries";
import { linkifyText } from "@/lib/linkify";
import { loadTeamMembers, ACTIVITY_STATUS_COMPLETED_ACTION } from "@/lib/projetos";
import { getMe } from "@/lib/chat-store";
import { TaskActivityPanel } from "@/components/tasks/TaskActivityPanel";
import { recordPerformanceEvent, usePerformanceSettings } from "@/lib/performance-events-store";
import {
  isCriticalReplan,
  isCriticalDeadlineMove,
  effectivePerformanceDueDate,
  classifyOutcome,
  xpForCompletion,
  deadlineCutoff,
  isValidUuid,
  taskDeadlineHealth,
  type PerformanceSettings,
} from "@/lib/performance-engine";
import {
  loadTaskTags,
  onTaskTagsChange,
  createTaskTag,
  updateTaskTagColor,
  deleteTaskTag,
  TASK_TAG_COLORS,
  type TaskTag,
} from "@/lib/task-tags-store";
import { bucketFor } from "@/lib/task-aggregation";
import { useIsMobile } from "@/hooks/use-mobile";

/** Best-effort: notifica (push no celular/desktop) quem acabou de ser
 * atribuído a esta tarefa — nunca deve travar/quebrar o salvamento se
 * falhar. Resolve nome -> id via o diretório do time (o campo `assignees`
 * da tarefa guarda nomes, não ids). */
/** Tarefa de campanha manda pra "campanhas" — antes ia sempre pra
 * "projetos" mesmo quando a tarefa era de uma campanha (ou do board do
 * Marketing, que também mora dentro de Projetos), fazendo quem clicasse
 * na notificação cair na seção errada. */
function sectionForScope(scope?: TaskBoardScope): string {
  return scope?.kind === "campanha" ? "campanhas" : "projetos";
}

async function notifyNewAssignees(names: string[], taskTitle: string, scope?: TaskBoardScope) {
  if (names.length === 0) return;
  try {
    const me = getMe();
    const directory = loadTeamMembers();
    const ids = names
      .map((name) => directory.find((m) => m.name === name)?.id)
      .filter((id): id is string => !!id && id !== me.id);
    if (ids.length === 0) return;
    const { sendAppPush } = await import("@/lib/push.functions");
    await sendAppPush({
      data: {
        userIds: ids,
        title: "Nova tarefa atribuída a você",
        body: taskTitle,
        url: `/time?section=${sectionForScope(scope)}`,
      },
    });
  } catch (err) {
    console.warn("[task] push notification failed", err);
  }
}

/* ============================================================
 * Types & constants (shared task model — same as Campanhas)
 * ============================================================ */

// `TaskStatus`/`TASK_STATUSES`/`TASK_STATUS_TONE`/`TASK_STATUS_DOT` vivem em
// `src/lib/task-status.ts` (única fonte de verdade, reaproveitada também
// pelo `TaskPicker` de Dependências sem criar import circular entre os
// dois arquivos). Importados aqui pro resto do arquivo continuar usando
// os mesmos nomes, e reexportados pra quem já importava daqui de fora
// (`MarketingSection.tsx` etc.) não precisar mudar nada.
import {
  type TaskStatus,
  TASK_STATUSES,
  TASK_STATUS_TONE,
  TASK_STATUS_DOT,
} from "@/lib/task-status";
export type { TaskStatus };
export { TASK_STATUSES, TASK_STATUS_TONE, TASK_STATUS_DOT };

export type TaskPriority = "Urgente" | "Alta" | "Normal" | "Baixa";
const TASK_PRIORITIES: TaskPriority[] = ["Urgente", "Alta", "Normal", "Baixa"];
export const PRIORITY_TONE: Record<TaskPriority, string> = {
  Urgente: "text-red-600 dark:text-red-400",
  Alta: "text-amber-600 dark:text-amber-400",
  Normal: "text-sky-600 dark:text-sky-400",
  Baixa: "text-muted-foreground",
};

/** Ordenação combinável do board — pedido explícito de dar pra escolher
 * prioridade e/ou prazo, com um servindo de desempate do outro. "Nenhum"
 * (= "Manual") mantém a ordem natural, a mesma que já respeita a posição
 * arrastada de cada card (o drag-and-drop só "gruda" quando não há
 * ordenação ativa). Cada critério carrega a direção no próprio valor
 * (`_asc`/`_desc`) — antes a direção era fixa por critério; virou
 * explícita pra caber as 4 categorias (Prazo/Prioridade/Criação/Nome) do
 * novo menu compacto, cada uma com as duas direções. */
export type TaskSortKey =
  | "none"
  | "dueDate_asc"
  | "dueDate_desc"
  | "priority_desc"
  | "priority_asc"
  | "createdAt_desc"
  | "createdAt_asc"
  | "title_asc"
  | "title_desc";

type TaskSortCategory = "dueDate" | "priority" | "createdAt" | "title";

/** A categoria de um critério — usada pra filtrar o desempate (não faz
 * sentido desempatar por prazo quando o principal já é prazo). */
function sortKeyCategory(key: TaskSortKey): TaskSortCategory | null {
  if (key === "none") return null;
  if (key.startsWith("dueDate")) return "dueDate";
  if (key.startsWith("priority")) return "priority";
  if (key.startsWith("createdAt")) return "createdAt";
  return "title";
}

function sortKeyDirection(key: TaskSortKey): "asc" | "desc" | null {
  if (key === "none") return null;
  return key.endsWith("_asc") ? "asc" : "desc";
}

/** Texto compacto pro botão ("Prazo", "Prioridade"...) — o menu inteiro
 * usa `TASK_SORT_MENU_GROUPS` abaixo pro texto completo de cada opção. */
const TASK_SORT_CATEGORY_LABEL: Record<TaskSortCategory, string> = {
  dueDate: "Prazo",
  priority: "Prioridade",
  createdAt: "Criação",
  title: "Nome",
};

/** Estrutura do menu "Ordenar" — cada grupo vira uma seção com cabeçalho,
 * cada opção um item de menu (nunca um `<select>`). */
export const TASK_SORT_MENU_GROUPS: {
  category: TaskSortCategory;
  label: string;
  options: { key: TaskSortKey; label: string }[];
}[] = [
  {
    category: "dueDate",
    label: "PRAZO",
    options: [
      { key: "dueDate_asc", label: "Prazo — mais próximo" },
      { key: "dueDate_desc", label: "Prazo — mais distante" },
    ],
  },
  {
    category: "priority",
    label: "PRIORIDADE",
    options: [
      { key: "priority_desc", label: "Prioridade — maior primeiro" },
      { key: "priority_asc", label: "Prioridade — menor primeiro" },
    ],
  },
  {
    category: "createdAt",
    label: "CRIAÇÃO",
    options: [
      { key: "createdAt_desc", label: "Mais recentes" },
      { key: "createdAt_asc", label: "Mais antigas" },
    ],
  },
  {
    category: "title",
    label: "NOME",
    options: [
      { key: "title_asc", label: "Nome — A → Z" },
      { key: "title_desc", label: "Nome — Z → A" },
    ],
  },
];

function compareTasksByKey(a: Task, b: Task, key: TaskSortKey): number {
  switch (key) {
    case "priority_desc":
      return TASK_PRIORITIES.indexOf(a.priority) - TASK_PRIORITIES.indexOf(b.priority);
    case "priority_asc":
      return TASK_PRIORITIES.indexOf(b.priority) - TASK_PRIORITIES.indexOf(a.priority);
    case "dueDate_asc":
    case "dueDate_desc": {
      // Sem prazo sempre por último, não importa a direção.
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return key === "dueDate_asc"
        ? a.dueDate.localeCompare(b.dueDate)
        : b.dueDate.localeCompare(a.dueDate);
    }
    case "createdAt_desc":
      return b.createdAt.localeCompare(a.createdAt);
    case "createdAt_asc":
      return a.createdAt.localeCompare(b.createdAt);
    case "title_asc":
      return a.title.localeCompare(b.title, "pt-BR");
    case "title_desc":
      return b.title.localeCompare(a.title, "pt-BR");
    default:
      return 0;
  }
}

/** Filtro por período de prazo — nova seção do popover "Filtrar", pedido
 * explícito de gestão operacional (ver rapidamente atrasadas/vencendo
 * hoje/na semana/sem prazo). Reaproveita `bucketFor` (já usado pra essa
 * mesma classificação em "Meu trabalho"/"Tarefas que precisam de
 * atenção", com o mesmo corte de 19h configurável) em vez de duplicar a
 * matemática de dias — só adiciona a checagem de "sem prazo" (que
 * `bucketFor` não distingue de "prazo daqui a mais de 7 dias", já que
 * as duas caem em "outro") e agrupa "amanhã" dentro de "esta semana"
 * (o pedido só tem 4 opções, não uma pra amanhã à parte). */
export type DeadlinePeriodFilter = "atrasada" | "hoje" | "semana" | "sem_prazo";

export const DEADLINE_PERIOD_FILTER_LABEL: Record<DeadlinePeriodFilter, string> = {
  atrasada: "Atrasadas",
  hoje: "Vencem hoje",
  semana: "Esta semana",
  sem_prazo: "Sem prazo",
};

function matchesDeadlinePeriod(t: Task, key: DeadlinePeriodFilter, cutoffHour?: number): boolean {
  if (key === "sem_prazo") return !t.dueDate && !t.performanceDueDate;
  if (t.status === "Concluído" || t.status === "Arquivado") return false;
  const bucket = bucketFor(t.dueDate, t.status, t.performanceDueDate, cutoffHour);
  if (key === "atrasada") return bucket === "atrasada";
  if (key === "hoje") return bucket === "hoje";
  return bucket === "amanha" || bucket === "semana";
}

/** Aplica o critério principal e usa o secundário só como desempate —
 * nunca reordena o que o principal já decidiu. */
/** Um card do board é uma tarefa de nível raiz OU (quando "Exibir
 * subtarefas no board" está ligado) uma subtarefa "achatada" pra dentro
 * da coluna do seu próprio status — `__parentTask` marca esse segundo
 * caso, pra saber que clique/exclusão devem afetar a tarefa-mãe. */
type BoardItem = Task & { __parentTask?: Task };

export function sortTasksBy<T extends Task>(
  items: T[],
  primary: TaskSortKey,
  secondary: TaskSortKey,
): T[] {
  if (primary === "none") return items;
  return [...items].sort((a, b) => {
    const byPrimary = compareTasksByKey(a, b, primary);
    if (byPrimary !== 0) return byPrimary;
    return compareTasksByKey(a, b, secondary);
  });
}

export type Comment = {
  id: string;
  author: string;
  initials: string;
  color: string;
  text: string;
  createdAt: string;
};
/** Classificação estrita pra renderização da Activity (ícone, tier
 * importante x secundário) — SEPARADA de `action` (texto livre, lido
 * por regex em `taskCompletedAt`/`score.ts`'s `taskCompletionDate` pra
 * scoring). `kind` nunca é usado por scoring; `action` nunca muda de
 * conteúdo por causa de `kind`. Aditivo: entradas antigas sem `kind`
 * caem num classificador de fallback só-pra-exibição. */
export type ActivityKind =
  | "completed"
  | "reopened"
  | "deadline"
  | "primary_assignee"
  | "assignee"
  | "status"
  | "dependency"
  | "minor";

export type Activity = {
  id: string;
  author: string;
  initials: string;
  color: string;
  action: string;
  createdAt: string;
  kind?: ActivityKind;
};
export type Attachment = { id: string; name: string; url?: string };
export type TimeEntry = { seconds: number; author: string; endedAt: string };

/** As 7 opções fixas do motivo de replanejamento — enum fechado (não
 * texto livre) porque o motivo alimenta `exemptFromResponsibility`
 * automaticamente, e isso precisa ser previsível. */
export const DEADLINE_CHANGE_MOTIVOS = [
  "dependencia_cliente",
  "mudanca_escopo",
  "prioridade_lideranca",
  "dependencia_interna",
  "replanejamento_operacional",
  "atraso_responsavel",
  "outro",
] as const;
export type DeadlineChangeMotivo = (typeof DEADLINE_CHANGE_MOTIVOS)[number];

export const DEADLINE_CHANGE_MOTIVO_LABEL: Record<DeadlineChangeMotivo, string> = {
  dependencia_cliente: "Dependência do cliente",
  mudanca_escopo: "Mudança de escopo",
  prioridade_lideranca: "Prioridade alterada pela liderança",
  dependencia_interna: "Dependência interna",
  replanejamento_operacional: "Replanejamento operacional",
  atraso_responsavel: "Atraso do responsável",
  outro: "Outro",
};

/** Motivos claramente externos à pessoa responsável isentam a
 * penalização por padrão, mesmo em replanejamento crítico (mudança no
 * próprio dia do vencimento) — mas sempre de forma auditável (ver
 * `DeadlineChangeEntry.adminOverride`), nunca silenciosa. Os demais
 * mantêm o impacto, pra evitar autojustificativa ("troco o motivo pra
 * escapar da métrica"). */
export const DEADLINE_CHANGE_MOTIVO_EXEMPTS_BY_DEFAULT: Record<DeadlineChangeMotivo, boolean> = {
  dependencia_cliente: true,
  mudanca_escopo: true,
  prioridade_lideranca: true,
  dependencia_interna: true,
  replanejamento_operacional: false,
  atraso_responsavel: false,
  outro: false,
};

/** Uma entrada por alteração real de prazo numa tarefa que já tinha
 * prazo (primeira definição de prazo nunca gera entrada aqui). "O prazo
 * pode mudar. O histórico não." — nunca removida/editada depois de
 * criada. */
export type DeadlineChangeEntry = {
  id: string;
  from?: string;
  to?: string;
  changedAt: string;
  changedBy: string;
  /** A alteração aconteceu no mesmo dia local do prazo anterior. */
  isCritical: boolean;
  motivo?: DeadlineChangeMotivo;
  observacao?: string;
  /** Se esta alteração específica isenta a responsabilidade da pessoa
   * pra fins de performance (derivado do motivo por padrão, corrigível
   * por um Admin depois via `adminOverride`). */
  exemptFromResponsibility: boolean;
  adminOverride?: { exempted: boolean; by: string; at: string };
};

export type Task = {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  startDate?: string;
  estimate?: string;
  assignee?: string;
  assignees?: string[];
  /** Nome de quem é accountable pela entrega — deve ser um dos
   * `assignees` (removê-lo dos assignees limpa este campo). Sem
   * fallback automático em `getTaskPrimaryAssignee`: uma tarefa legada
   * sem principal definido fica assim até alguém confirmar
   * explicitamente (nunca inventamos accountability retroativa). */
  primaryAssignee?: string;
  tags?: string[];
  attachments?: Attachment[];
  createdAt: string;
  subtasks?: Task[];
  comments?: Comment[];
  activity?: Activity[];
  timerRunning?: boolean;
  timerStartedAt?: string;
  timeEntries?: TimeEntry[];
  /** Timestamp ISO exato de quando a tarefa entrou em "Concluído" —
   * setado por `withStatusChange`, em paralelo à entrada de `activity`
   * já existente (nunca a substitui). Usado pro Score Operacional
   * calcular atraso em minutos/horas, não só por dia. */
  completedAt?: string;
  /** Congelado no primeiro `dueDate` que a tarefa recebeu — nunca muda
   * depois, mesmo com replanejamentos. */
  originalDueDate?: string;
  /** Data usada pra determinar cumprimento operacional (no prazo x
   * atrasada) — igual a `dueDate` até a primeira alteração; depois
   * segue a regra de replanejamento normal x crítico (ver
   * `effectivePerformanceDueDate` em `src/lib/performance-engine.ts`). */
  performanceDueDate?: string;
  deadlineHistory?: DeadlineChangeEntry[];
  /** Quando definida, a tarefa nunca fica "concluída" de vez — ao entrar
   * em "Concluído" ela volta sozinha pra "Aberto" com um novo prazo (ver
   * `applyRecurrenceIfCompleted`), sem duplicar registro, igual ao
   * ClickUp. */
  recurrence?: TaskRecurrence;
};

/** `assignees` (novo, múltiplos) tem prioridade; cai para `assignee` (legado, único) quando ausente. */
export function getTaskAssignees(t: Pick<Task, "assignee" | "assignees">): string[] {
  if (t.assignees?.length) return t.assignees;
  return t.assignee ? [t.assignee] : [];
}

/** O responsável principal — SEM fallback automático pra `assignees[0]`.
 * Uma tarefa com múltiplos responsáveis mas sem principal explícito
 * simplesmente não tem um (a UI pode sugerir visualmente um fallback,
 * mas essa função — usada por scoring/ledger — não deve inventar
 * accountability que ninguém confirmou). */
export function getTaskPrimaryAssignee(t: Pick<Task, "primaryAssignee">): string | undefined {
  return t.primaryAssignee;
}

/** Colaboradores = todo mundo em `assignees` menos o principal —
 * DERIVADO, nunca um array armazenado à parte (evita dessincronia entre
 * dois arrays sobrepostos). */
export function getTaskCollaborators(
  t: Pick<Task, "assignee" | "assignees" | "primaryAssignee">,
): string[] {
  return getTaskAssignees(t).filter((a) => a !== t.primaryAssignee);
}

/** Quando a tarefa foi concluída — usa o `completedAt` dedicado quando
 * presente (tarefas concluídas depois desta rodada); cai pra derivar do
 * log de atividade, procurando "mudou status para Concluído" (dado
 * legado, tarefas concluídas antes de `completedAt` existir), e por fim
 * `createdAt` se nada for encontrado — só usado pra ordenar a coluna
 * Concluído da mais recente pra mais antiga. */
function taskCompletedAt(t: Task): string {
  if (t.completedAt) return t.completedAt;
  const entries = (t.activity ?? []).filter((a) => a.action === ACTIVITY_STATUS_COMPLETED_ACTION);
  return entries.length > 0 ? entries[entries.length - 1].createdAt : t.createdAt;
}

export type Member = { id?: string; name: string; initials: string; color: string; photo?: string };

const AVATAR_COLORS = [
  "bg-rose-500 text-white",
  "bg-sky-500 text-white",
  "bg-emerald-500 text-white",
  "bg-amber-500 text-white",
  "bg-violet-500 text-white",
  "bg-teal-500 text-white",
  "bg-fuchsia-500 text-white",
  "bg-orange-500 text-white",
];
export function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
export function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function readTeamMembers(): Member[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("time:membros");
    const arr = raw
      ? (JSON.parse(raw) as Array<{ id?: string; name?: string; photo?: string }>)
      : [];
    const seen = new Set<string>();
    const out: Member[] = [];
    for (const m of arr) {
      const name = (m.name ?? "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({
        id: m.id,
        name,
        initials: initialsOf(name) || "?",
        color: colorFor(name),
        photo: m.photo,
      });
    }
    return out;
  } catch {
    return [];
  }
}
function useTeamMembers(): Member[] {
  const [members, setMembers] = useState<Member[]>(() => readTeamMembers());
  useEffect(() => {
    const upd = () => setMembers(readTeamMembers());
    window.addEventListener("time:membros:changed", upd);
    window.addEventListener("storage", upd);
    return () => {
      window.removeEventListener("time:membros:changed", upd);
      window.removeEventListener("storage", upd);
    };
  }, []);
  return members;
}

/** Registro compartilhado de etiquetas (nome + cor) — mesmo padrão de
 * `useTeamMembers`, só que sincronizado via Supabase Realtime
 * (task-tags-store.ts) em vez de localStorage/evento de storage. */
function useTaskTags(): TaskTag[] {
  const [tags, setTags] = useState<TaskTag[]>(() => loadTaskTags());
  useEffect(() => onTaskTagsChange(() => setTags(loadTaskTags())), []);
  return tags;
}

/** Cor de uma etiqueta pelo nome — resolvida do registro compartilhado
 * quando existe; cai pro hash antigo (`colorFor`) só pra etiqueta que
 * ainda não foi "confirmada" no registro (texto livre de antes desse
 * sistema existir), sem exigir migração de dado nenhuma. */
function colorForTag(name: string, taskTags: TaskTag[]): string {
  return taskTags.find((t) => t.name === name)?.color ?? colorFor(name);
}
function getCurrentAuthor(): Member {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("config:perfil");
      if (raw) {
        const p = JSON.parse(raw) as { nome?: string; foto?: string };
        const name = (p.nome ?? "").trim();
        if (name)
          return { name, initials: initialsOf(name) || "?", color: colorFor(name), photo: p.foto };
      }
    } catch {
      /* ignore */
    }
  }
  return { name: "Você", initials: "VC", color: "bg-foreground text-background" };
}

/* ============================================================
 * Timer por tarefa — inicia sozinho ao mover para "Em andamento"
 * (drag no board ou troca de status no diálogo), ou manualmente pelo
 * botão de play no card. Ao parar (pausa manual ou troca de status),
 * a sessão vira um comentário + entrada de atividade na própria
 * tarefa, e o total em segundos fica em `timeEntries` para a aba
 * Gestão calcular horas trabalhadas por pessoa.
 * ============================================================ */

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min`;
  return `${sec}s`;
}

export function liveElapsedSeconds(t: Task): number {
  if (!t.timerRunning || !t.timerStartedAt) return 0;
  return (Date.now() - Date.parse(t.timerStartedAt)) / 1000;
}

export function startTaskTimer(task: Task): Task {
  if (task.timerRunning) return task;
  return { ...task, timerRunning: true, timerStartedAt: new Date().toISOString() };
}

export function stopTaskTimer(task: Task): Task {
  if (!task.timerRunning || !task.timerStartedAt) {
    return { ...task, timerRunning: false, timerStartedAt: undefined };
  }
  const elapsedSec = (Date.now() - Date.parse(task.timerStartedAt)) / 1000;
  const next: Task = { ...task, timerRunning: false, timerStartedAt: undefined };
  if (elapsedSec < 1) return next;
  const me = getCurrentAuthor();
  const now = new Date().toISOString();
  return {
    ...next,
    activity: [
      ...(task.activity ?? []),
      {
        id: crypto.randomUUID(),
        author: me.name,
        initials: me.initials,
        color: me.color,
        action: `registrou ${formatDuration(elapsedSec)} de trabalho`,
        createdAt: now,
      },
    ],
    timeEntries: [
      ...(task.timeEntries ?? []),
      { seconds: elapsedSec, author: me.name, endedAt: now },
    ],
  };
}

/** Aplica uma mudança de status junto com os efeitos de timer que ela dispara
 * (para o timer se estava rodando; inicia sozinho se o novo status é "Em
 * andamento") e a entrada de atividade correspondente — usado tanto pelo
 * drag-and-drop do board quanto pelo diálogo de edição, para os dois
 * caminhos ficarem consistentes. */
export function withStatusChange(task: Task, newStatus: TaskStatus): Task {
  if (task.status === newStatus) return task;
  let next = task.timerRunning ? stopTaskTimer(task) : task;
  const me = getCurrentAuthor();
  const now = new Date().toISOString();
  const wasCompleted = task.status === "Concluído";
  const kind: ActivityKind =
    newStatus === "Concluído" ? "completed" : wasCompleted ? "reopened" : "status";
  next = {
    ...next,
    status: newStatus,
    // `completedAt` é a fonte de verdade estruturada de "quando concluiu"
    // (Score Operacional precisa de precisão de minuto, não só o dia) —
    // vive em paralelo à entrada de `activity` abaixo, nunca a
    // substitui. Some de novo se a tarefa sair de "Concluído"
    // (reaberta) — deixa de estar concluída agora, mesmo que já tenha
    // sido no passado (esse fato fica só no ledger de performance).
    completedAt: newStatus === "Concluído" ? now : undefined,
    activity: [
      ...(next.activity ?? []),
      {
        id: crypto.randomUUID(),
        author: me.name,
        initials: me.initials,
        color: me.color,
        // Texto igual a `ACTIVITY_STATUS_COMPLETED_ACTION` quando
        // `newStatus === "Concluído"` — nunca mude este formato sem
        // atualizar a constante e `score.ts`'s `taskCompletionDate`.
        action: `mudou status para ${newStatus}`,
        createdAt: now,
        kind,
      },
    ],
  };
  if (newStatus === "Em andamento") next = startTaskTimer(next);
  return next;
}

function taskOriginFromScope(scope?: TaskBoardScope): "projeto" | "campanha" | "marketing" | null {
  return scope?.kind ?? null;
}

function resolvePersonId(name: string, members: Member[]): string | null {
  return members.find((m) => m.name === name)?.id ?? null;
}

/** Emite o(s) evento(s) de performance relevantes quando uma tarefa
 * conclui ou é reaberta — chamado tanto pelo `save()` do diálogo quanto
 * pelo drag-and-drop do board, os dois pontos que já passam por
 * `withStatusChange`. Nunca bloqueia a ação principal: `recordPerformanceEvent`
 * já é fire-and-forget, e o `me.id` inválido (perfil ainda não
 * hidratado) simplesmente pula a emissão em vez de tentar gravar lixo. */
function recordTaskLedgerEventsOnStatusChange(
  prev: Task,
  next: Task,
  ctx: { scope?: TaskBoardScope; members: Member[]; performanceSettings: PerformanceSettings },
) {
  const me = getMe();
  if (!isValidUuid(me.id)) return;
  const actor = getCurrentAuthor();
  const origin = taskOriginFromScope(ctx.scope);
  const assigneeNames = getTaskAssignees(next);
  // Conclusão/reabertura geram XP — quando há responsável principal
  // definido, ele é o único alvo (accountability real, item 19 do
  // pedido). Sem principal (tarefa legada), mantém o comportamento
  // anterior: distribui entre todos os assignees, sem inventar um
  // principal arbitrário pra fins de pontuação.
  const primary = getTaskPrimaryAssignee(next);
  const targets = primary ? [primary] : assigneeNames.length ? assigneeNames : [actor.name];
  const enteredConcluido = next.status === "Concluído" && prev.status !== "Concluído";
  const leftConcluido = prev.status === "Concluído" && next.status !== "Concluído";

  if (enteredConcluido && next.completedAt) {
    const ref = effectivePerformanceDueDate(
      next.originalDueDate ?? next.dueDate,
      next.deadlineHistory,
    );
    const { outcome, delayMinutes } = classifyOutcome(
      ref,
      next.completedAt,
      ctx.performanceSettings.deadlineCutoffHour,
    );
    const xpDelta = xpForCompletion(outcome, ctx.performanceSettings, targets.length);
    for (const name of targets) {
      recordPerformanceEvent({
        eventType: "task_completed",
        personId: resolvePersonId(name, ctx.members),
        personName: name,
        actorId: me.id,
        actorName: actor.name,
        taskId: next.id,
        taskOrigin: origin,
        taskTitle: next.title,
        meetingId: null,
        data: { outcome, delayMinutes, performanceDueDateUsed: ref ?? null, xpDelta },
      });
    }
  } else if (leftConcluido) {
    for (const name of targets) {
      recordPerformanceEvent({
        eventType: "task_reopened",
        personId: resolvePersonId(name, ctx.members),
        personName: name,
        actorId: me.id,
        actorName: actor.name,
        taskId: next.id,
        taskOrigin: origin,
        taskTitle: next.title,
        meetingId: null,
        data: {},
      });
    }
  }
}

/** Se `next` acabou de entrar em "Concluído" e tem uma `recurrence`
 * configurada, o ciclo NUNCA fica concluído de vez — o registro volta
 * sozinho pra "Aberto" com um novo prazo (calculado a partir da
 * conclusão), igual ao ClickUp (a tarefa recorrente não duplica, ela
 * "gira"). Chamado DEPOIS de `recordTaskLedgerEventsOnStatusChange` nos
 * dois pontos de entrada (drag-and-drop e `save()`), pra que o evento de
 * conclusão do ciclo que está terminando seja registrado com o prazo
 * REAL desse ciclo, antes do reset. Histórico de prazo (`deadlineHistory`/
 * `originalDueDate`/`performanceDueDate`) é zerado a cada novo ciclo —
 * cada volta da tarefa recorrente começa com uma folha em branco, sem
 * carregar replanejamentos do ciclo anterior. */
function applyRecurrenceIfCompleted(prev: Task, next: Task): Task {
  if (!(next.status === "Concluído" && prev.status !== "Concluído")) return next;
  if (!next.recurrence) return next;
  const actor = getCurrentAuthor();
  const completedAt = next.completedAt ?? new Date().toISOString();
  const nextDue = computeNextRecurrenceDueDate(completedAt, next.recurrence);
  return {
    ...next,
    status: "Aberto",
    completedAt: undefined,
    dueDate: nextDue,
    startDate: undefined,
    originalDueDate: nextDue,
    performanceDueDate: nextDue,
    deadlineHistory: [],
    activity: [
      ...(next.activity ?? []),
      {
        id: crypto.randomUUID(),
        author: actor.name,
        initials: actor.initials,
        color: actor.color,
        action: `tarefa recorrente: novo prazo em ${fmtDate(nextDue)}`,
        createdAt: new Date().toISOString(),
        kind: "minor",
      },
    ],
  };
}

export function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Avatar({ member, size = 20 }: { member: Member; size?: number }) {
  const cls = `flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[9px] font-semibold ${member.photo ? "bg-muted" : member.color}`;
  return (
    <span className={cls} style={{ width: size, height: size }} title={member.name}>
      {member.photo ? (
        <img src={member.photo} alt="" className="h-full w-full object-cover" />
      ) : (
        member.initials
      )}
    </span>
  );
}

/** Seletor compacto de vários responsáveis — usado no quick-add de
 * subtarefa (linha estreita, um `<select>` só permitia escolher UM
 * responsável ali, diferente da tarefa de nível raiz que já suporta
 * vários). Mesma ideia do picker de "Responsáveis" do diálogo principal,
 * só que como botão+dropdown compacto pra caber numa linha apertada. */
function CompactAssigneePicker({
  selected,
  members,
  onToggle,
}: {
  selected: string[];
  members: Member[];
  onToggle: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const label =
    selected.length === 0
      ? "Responsável"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} responsáveis`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs outline-none hover:bg-muted/40"
      >
        <User className="h-3 w-3 text-muted-foreground" />
        {label}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-48 w-44 overflow-auto rounded-md border border-border bg-popover p-1 shadow">
          {members.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">Nenhum membro cadastrado.</div>
          ) : (
            members.map((m) => {
              const checked = selected.includes(m.name);
              return (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => onToggle(m.name)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${
                    checked ? "bg-muted font-medium text-foreground" : ""
                  }`}
                >
                  <Avatar member={m} size={18} />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {checked && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/** Fileira de swatches de cor — reaproveitada tanto pra "criar etiqueta
 * nova" quanto pra "editar a cor" de uma já existente (o popover que a
 * envolve decide o resto do layout/título). */
function TagColorSwatches({ value, onPick }: { value?: string; onPick: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 p-1">
      {TASK_TAG_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          title={c.label}
          onClick={() => onPick(c.value)}
          className={`h-6 w-6 shrink-0 rounded-full ${c.value.split(" ")[0]} ${
            value === c.value ? "ring-2 ring-offset-2 ring-offset-popover ring-foreground" : ""
          }`}
        />
      ))}
    </div>
  );
}

export function renderMentions(text: string, members: Member[]) {
  const parts = text.split(/(@[\wÀ-ÿ]+(?:\s[\wÀ-ÿ]+)?)/g);
  return parts.map((p, i) => {
    if (p.startsWith("@")) {
      const name = p.slice(1);
      const match = members.find((m) => m.name.toLowerCase().startsWith(name.toLowerCase()));
      if (match) {
        return (
          <span key={i} className="rounded bg-foreground/10 px-1 font-medium text-primary">
            @{match.name}
          </span>
        );
      }
    }
    return <span key={i}>{linkifyText(p, `mention-link-${i}`)}</span>;
  });
}

// `new Date("2026-07-29")` (data sem hora) é interpretada como meia-noite UTC;
// formatar em horário local (Brasil, UTC-3) mostra um dia a menos. Ancorar em
// meio-dia local evita esse desvio de fuso horário.
export const fmtDate = (d: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR") : "—";

/** Formato compacto pro card do kanban: "04 set" (ano só quando
 * diferente do atual, ex. "04 set 2027") — evita repetir o ano óbvio na
 * maioria dos casos sem esconder informação quando o prazo é de outro
 * ano. Mesmo ancoramento em horário local de `fmtDate`, pro mesmo
 * desvio de fuso não se repetir aqui. */
export const fmtDateCompact = (d: string) => {
  if (!d) return "—";
  const date = new Date(`${d}T00:00:00`);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date
    .toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: sameYear ? undefined : "numeric",
    })
    .replace(".", "");
};

export type TaskBoardScope =
  | { kind: "campanha"; id: string }
  | { kind: "projeto"; id: string }
  | { kind: "marketing" };

/* ============================================================
 * Componentes do card do kanban — extraídos pra deixar o card em si
 * (dentro de TaskBoard) mais enxuto. Cada um só lê dados que a tarefa já
 * tem — nenhuma lógica de negócio nova, só apresentação.
 * ============================================================ */

/** Versão leve de `DeadlineHealthBadge` (mais abaixo, usada só dentro do
 * diálogo de edição com Popover + histórico de replanejamento) — mesma
 * fonte de verdade (`taskDeadlineHealth`, mesmo `deadlineCutoffHour`),
 * sem o Popover, só o rótulo compacto pro card. Nunca discorda do
 * diálogo porque chama exatamente a mesma função com os mesmos
 * parâmetros. */
function CardDeadlineBadge({ task }: { task: Task }) {
  const { settings: performanceSettings } = usePerformanceSettings();
  const health = taskDeadlineHealth(task, undefined, performanceSettings.deadlineCutoffHour);
  const isOverdue = health.health === "atrasada";
  const isDueToday = health.health === "vence_hoje";
  const Icon = isOverdue ? AlertTriangle : Calendar;

  let text: string;
  if (isOverdue && health.delayDays) {
    text = `${health.delayDays} ${health.delayDays === 1 ? "dia" : "dias"} atrasada`;
  } else if (isDueToday) {
    text = "Hoje";
  } else if (task.status === "Concluído") {
    text = health.label;
  } else if (task.dueDate) {
    text = fmtDateCompact(task.dueDate);
  } else {
    text = health.label;
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${health.tone}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {text}
    </span>
  );
}

/** Pilha de avatares sobrepostos — sem nomes escritos no card (poluía
 * visualmente); os nomes completos ficam num único Tooltip pra pilha
 * inteira, em vez de um `title` nativo por avatar (que só mostraria um
 * nome de cada vez). */
function AssigneeStack({ names, members }: { names: string[]; members: Member[] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center -space-x-1.5">
          {names.map((a) => (
            <Avatar
              key={a}
              member={
                members.find((m) => m.name === a) ?? {
                  name: a,
                  initials: initialsOf(a) || "?",
                  color: colorFor(a),
                }
              }
              size={18}
            />
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent>{names.join(", ")}</TooltipContent>
    </Tooltip>
  );
}

/** Etiquetas do card — no máximo 2 pills, o resto vira um badge neutro
 * "+N" com Tooltip listando as demais (evita o card crescer sem limite
 * quando há muitas etiquetas). */
function CardTags({ tags, taskTags }: { tags: string[]; taskTags: TaskTag[] }) {
  const shown = tags.slice(0, 2);
  const overflow = tags.slice(2);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((tag) => (
        <span
          key={tag}
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colorForTag(tag, taskTags)}`}
        >
          {tag}
        </span>
      ))}
      {overflow.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              +{overflow.length}
            </span>
          </TooltipTrigger>
          <TooltipContent>{overflow.join(", ")}</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

/** Menu "•••" de ações rápidas do card, revelado só no hover — substitui
 * o antigo botão de lixeira solto. "Abrir tarefa" é a mesma ação de
 * clicar no card (não existe um modo de visualização separado do de
 * edição nesta plataforma); "Excluir" reaproveita exatamente a mesma
 * distinção subtarefa-vs-tarefa-raiz que o botão antigo já fazia.
 * "Duplicar"/"Mover" ficam fora desta rodada — não existe essa lógica em
 * nenhum lugar do código hoje, e criá-la é além do escopo de uma
 * refatoração visual. */
function CardQuickActions({
  onOpen,
  onDelete,
}: {
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Mais ações"
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" /> Abrir tarefa
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-3.5 w-3.5" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Preferência de ordenação/filtro do board — persistida em localStorage
 * (mesmo par chave/JSON em todo lugar que usa), não é por-board: a mesma
 * escolha vale em qualquer kanban, já que é o mesmo componente
 * compartilhado (mesmo raciocínio já usado em `showSubtasksInline`). */
function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue];
}

/* ============================================================
 * TaskBoard — Kanban (same shape as Campanhas)
 * ============================================================ */

export function TaskBoard({
  tasks,
  onChange,
  scope,
  title = "Tarefas",
  breadcrumb,
  initialOpenTaskId,
  onInitialOpenTaskHandled,
}: {
  tasks: Task[];
  onChange: (next: Task[]) => void;
  scope?: TaskBoardScope;
  title?: string;
  breadcrumb?: string;
  initialOpenTaskId?: string;
  onInitialOpenTaskHandled?: () => void;
}) {
  const [taskDialog, setTaskDialog] = useState<{
    mode: "new" | "edit";
    data?: Task;
    defaultStatus?: TaskStatus;
    // Quando se clica numa subtarefa (card achatado ou prévia expandida no
    // board), `data` continua sendo a tarefa-mãe (é ela quem tem o
    // diálogo) mas isso diz pro diálogo abrir já direto na subtarefa —
    // sem isso, clicar numa subtarefa mostrava a tarefa-mãe em vez dela.
    openSubtaskId?: string;
  } | null>(null);
  // Dependências pendentes por tarefa — só pra alimentar o indicador
  // discreto "⛓ N" no card (item que a própria `Task` não guarda, já que
  // a relação vive numa tabela à parte, sem FK real, ver
  // `task-dependencies-store.ts`).
  const allDepsForCards = useTaskDependencies();
  const pendingDepCountByTaskId = useMemo(() => {
    // `task_dependencies` só conhece o id real (sem prefixo) — o board do
    // Marketing mistura tarefas próprias com avulsas, cujo `t.id` aqui
    // carrega o prefixo "mkt:" (convenção de deep-link, ver
    // `TaskDirectoryEntry.rawId` em `task-directory.ts`). Normaliza antes
    // de consultar, senão a contagem nunca bate pra essas tarefas.
    const rawId = (id: string) => id.replace(/^mkt:/, "");
    const map = new Map<string, number>();
    for (const t of tasks) {
      const { dependsOn } = dependenciesOf(rawId(t.id), allDepsForCards);
      const pending = dependsOn.filter((id) => {
        // Só conta quem realmente não está concluído — procura o status
        // real na própria lista de tarefas deste board se existir ali,
        // senão assume pendente (conservador: card nunca esconde um
        // bloqueio real por falta de dado local).
        const local = tasks.find(
          (x) => rawId(x.id) === id || x.subtasks?.some((s) => rawId(s.id) === id),
        );
        if (!local) return true;
        const sub =
          rawId(local.id) === id ? local : local.subtasks?.find((s) => rawId(s.id) === id);
        return sub?.status !== "Concluído";
      }).length;
      if (pending > 0) map.set(t.id, pending);
    }
    return map;
  }, [tasks, allDepsForCards]);
  const [dragId, setDragId] = useState<string | null>(null);
  // Coluna que está recebendo o drag no momento — só feedback visual, não
  // participa da lógica de mudança de status (que continua inteira no
  // `onDrop` de cada coluna).
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);
  // Expandir subtarefas direto no card do board (fora da tarefa) — pedido
  // explícito de dar pra ver as subtarefas sem abrir a tarefa-mãe. Estado
  // só de sessão (não persiste), igual a qualquer accordion aberto/fechado.
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const members = useTeamMembers();
  const { settings: performanceSettings } = usePerformanceSettings();

  useEffect(() => {
    if (!initialOpenTaskId) return;
    const t = tasks.find((x) => x.id === initialOpenTaskId);
    if (t) {
      setTaskDialog({ mode: "edit", data: t });
      onInitialOpenTaskHandled?.();
    }
  }, [initialOpenTaskId, tasks, onInitialOpenTaskHandled]);

  const persist = (next: Task[]) => onChange(next);

  // Persists the timer toggle immediately (doesn't wait for the dialog's own
  // "Salvar") so a running timer survives the dialog being closed, and
  // returns the updated task so the dialog can mirror the new comment/
  // activity entry into its own local state without touching unsaved edits.
  const toggleTimer =
    scope?.kind === "marketing"
      ? undefined
      : (taskId: string): Task | null => {
          const t = tasks.find((x) => x.id === taskId);
          if (!t) return null;
          const updated = t.timerRunning ? stopTaskTimer(t) : startTaskTimer(t);
          persist(tasks.map((x) => (x.id === taskId ? updated : x)));
          return updated;
        };

  // Etiquetas — antes eram só texto livre digitado no diálogo, nunca
  // aparecendo em lugar nenhum do board nem servindo pra filtrar nada
  // (na prática, invisíveis depois de criadas). `allTags` alimenta o
  // filtro de etiquetas; a cor de cada uma vem do registro compartilhado
  // (`task-tags-store.ts`), não mais de um hash local — mudar a cor lá
  // reflete aqui pra todo mundo.
  const taskTags = useTaskTags();
  const allTags = useMemo(
    () =>
      Array.from(new Set(tasks.flatMap((t) => t.tags ?? []))).sort((a, b) => a.localeCompare(b)),
    [tasks],
  );
  const allAssignees = useMemo(
    () =>
      Array.from(new Set(tasks.flatMap((t) => getTaskAssignees(t)))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [tasks],
  );

  // Filtro combinável — pedido explícito de filtrar por responsável,
  // etiquetas etc., podendo combinar mais de um critério. Dentro de uma
  // mesma categoria é "ou" (qualquer etiqueta marcada já inclui a
  // tarefa); entre categorias diferentes é "e" (só entra quem bate em
  // TODAS as categorias com algo marcado).
  const [assigneeFilters, setAssigneeFilters] = usePersistedState<string[]>(
    "taskboard:assigneeFilters",
    [],
  );
  const [tagFilters, setTagFilters] = usePersistedState<string[]>("taskboard:tagFilters", []);
  const [priorityFilters, setPriorityFilters] = usePersistedState<TaskPriority[]>(
    "taskboard:priorityFilters",
    [],
  );
  const [deadlineFilters, setDeadlineFilters] = usePersistedState<DeadlinePeriodFilter[]>(
    "taskboard:deadlineFilters",
    [],
  );
  const [filterOpen, setFilterOpen] = useState(false);
  useEffect(() => {
    setAssigneeFilters((prev) => prev.filter((a) => allAssignees.includes(a)));
  }, [allAssignees, setAssigneeFilters]);
  useEffect(() => {
    setTagFilters((prev) => prev.filter((t) => allTags.includes(t)));
  }, [allTags, setTagFilters]);
  const activeFilterCount = [
    assigneeFilters.length > 0,
    tagFilters.length > 0,
    priorityFilters.length > 0,
    deadlineFilters.length > 0,
  ].filter(Boolean).length;
  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  const taskMatchesFilters = (t: Task) => {
    if (assigneeFilters.length > 0) {
      const assignees = getTaskAssignees(t);
      if (!assigneeFilters.some((a) => assignees.includes(a))) return false;
    }
    if (tagFilters.length > 0) {
      if (!tagFilters.some((tag) => t.tags?.includes(tag))) return false;
    }
    if (priorityFilters.length > 0 && !priorityFilters.includes(t.priority)) return false;
    if (
      deadlineFilters.length > 0 &&
      !deadlineFilters.some((key) =>
        matchesDeadlinePeriod(t, key, performanceSettings.deadlineCutoffHour),
      )
    )
      return false;
    return true;
  };
  const visibleTasks = tasks.filter(taskMatchesFilters);

  // Uma linha de chips removíveis abaixo da barra de controles — mostra
  // cada VALOR ativo (não cada categoria), sempre visível enquanto
  // houver algo filtrado, pra não depender de abrir o popover de novo
  // só pra ver/tirar um filtro.
  const activeFilterChips = useMemo(
    () => [
      ...assigneeFilters.map((name) => ({
        id: `assignee:${name}`,
        label: name,
        onRemove: () => setAssigneeFilters((prev) => prev.filter((x) => x !== name)),
      })),
      ...tagFilters.map((tag) => ({
        id: `tag:${tag}`,
        label: tag,
        onRemove: () => setTagFilters((prev) => prev.filter((x) => x !== tag)),
      })),
      ...priorityFilters.map((p) => ({
        id: `priority:${p}`,
        label: p,
        onRemove: () => setPriorityFilters((prev) => prev.filter((x) => x !== p)),
      })),
      ...deadlineFilters.map((key) => ({
        id: `deadline:${key}`,
        label: DEADLINE_PERIOD_FILTER_LABEL[key],
        onRemove: () => setDeadlineFilters((prev) => prev.filter((x) => x !== key)),
      })),
    ],
    [
      assigneeFilters,
      tagFilters,
      priorityFilters,
      deadlineFilters,
      setAssigneeFilters,
      setTagFilters,
      setPriorityFilters,
      setDeadlineFilters,
    ],
  );

  // "Exibir subtarefas no board" — preferência pessoal, persistida (não é
  // por-board: a mesma escolha vale em qualquer kanban, já que é o mesmo
  // componente compartilhado). Quando ligado, cada subtarefa aparece como
  // um card próprio na coluna do SEU status (não só como contador "N/M"
  // dentro do card da tarefa-mãe) — passa pelos mesmos filtros/ordenação
  // que as tarefas de nível raiz, já que uma subtarefa é uma `Task`
  // completa. Clicar nela abre o diálogo da tarefa-mãe (subtarefa nunca
  // teve diálogo próprio no board — só é editável de dentro da tarefa
  // raiz que a contém).
  const [showSubtasksInline, setShowSubtasksInline] = useState(() => {
    try {
      return localStorage.getItem("taskboard:showSubtasksInline") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      if (showSubtasksInline) localStorage.setItem("taskboard:showSubtasksInline", "1");
      else localStorage.removeItem("taskboard:showSubtasksInline");
    } catch {
      /* ignore */
    }
  }, [showSubtasksInline]);
  const allSubtasksFlat = useMemo(
    () =>
      tasks.flatMap((parent) => (parent.subtasks ?? []).map((subtask) => ({ subtask, parent }))),
    [tasks],
  );

  // Ordenação combinável de cada coluna do kanban — pedido explícito de
  // poder ordenar por prioridade e/ou prazo, um servindo de desempate do
  // outro. Fica de fora da coluna "Concluído", que já tem sua própria
  // ordenação por data de conclusão (mais recente primeiro).
  const [sortPrimary, setSortPrimary] = usePersistedState<TaskSortKey>(
    "taskboard:sortPrimary",
    "none",
  );
  const [sortSecondary, setSortSecondary] = usePersistedState<TaskSortKey>(
    "taskboard:sortSecondary",
    "none",
  );
  // Estado só de UI do popover de Filtrar — nunca persiste, reseta
  // sozinho quando o popover fecha e reabre (comportamento normal de um
  // campo de busca/expandir).
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const isMobile = useIsMobile();
  const [sortOpen, setSortOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{tasks.length} no total</p>
          </div>
          <div className="flex items-center gap-2">
            <Popover open={sortOpen} onOpenChange={setSortOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40 ${
                    sortPrimary !== "none" ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  {sortPrimary === "none" ? (
                    "Ordenar"
                  ) : (
                    <>
                      {TASK_SORT_CATEGORY_LABEL[sortKeyCategory(sortPrimary)!]}
                      <span aria-hidden>{sortKeyDirection(sortPrimary) === "asc" ? "↑" : "↓"}</span>
                    </>
                  )}
                  {sortSecondary !== "none" && (
                    <span className="rounded-full bg-foreground px-1.5 text-[10px] text-background">
                      2
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 space-y-0.5 p-2">
                <p className="px-2 py-1 text-[11px] font-semibold text-foreground">
                  Ordenar tarefas
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSortPrimary("none");
                    setSortSecondary("none");
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60 ${
                    sortPrimary === "none" ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {sortPrimary === "none" && <Check className="h-3.5 w-3.5" />}
                  </span>
                  Manual
                </button>
                {TASK_SORT_MENU_GROUPS.map((group) => (
                  <div key={group.category} className="pt-1.5">
                    <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      {group.label}
                    </p>
                    {group.options.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          setSortPrimary(opt.key);
                          if (sortKeyCategory(opt.key) === sortKeyCategory(sortSecondary)) {
                            setSortSecondary("none");
                          }
                        }}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60 ${
                          sortPrimary === opt.key ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                          {sortPrimary === opt.key && <Check className="h-3.5 w-3.5" />}
                        </span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ))}
                {sortPrimary !== "none" && (
                  <div className="mt-1 border-t border-border pt-1.5">
                    <p className="px-2 py-1 text-[11px] font-semibold text-foreground">Desempate</p>
                    <button
                      type="button"
                      onClick={() => setSortSecondary("none")}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60 ${
                        sortSecondary === "none" ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                        {sortSecondary === "none" && <Check className="h-3.5 w-3.5" />}
                      </span>
                      Nenhum
                    </button>
                    {TASK_SORT_MENU_GROUPS.filter(
                      (g) => g.category !== sortKeyCategory(sortPrimary),
                    ).map((group) => (
                      <div key={group.category} className="pt-1.5">
                        <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                          {group.label}
                        </p>
                        {group.options.map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setSortSecondary(opt.key)}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60 ${
                              sortSecondary === opt.key
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                              {sortSecondary === opt.key && <Check className="h-3.5 w-3.5" />}
                            </span>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40 ${
                    activeFilterCount > 0 ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filtrar
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-foreground px-1.5 text-[10px] text-background">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="max-h-[70vh] w-80 space-y-3 overflow-y-auto p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-foreground">Filtrar tarefas</p>
                  <button
                    type="button"
                    disabled={activeFilterCount === 0}
                    onClick={() => {
                      setAssigneeFilters([]);
                      setTagFilters([]);
                      setPriorityFilters([]);
                      setDeadlineFilters([]);
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
                  >
                    Limpar
                  </button>
                </div>

                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Responsável</p>
                  {allAssignees.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">Nenhuma tarefa atribuída.</p>
                  ) : (
                    <>
                      {allAssignees.length > 6 && (
                        <div className="relative mt-1.5">
                          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <input
                            type="search"
                            value={assigneeSearch}
                            onChange={(e) => setAssigneeSearch(e.target.value)}
                            placeholder="Buscar membro..."
                            className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      )}
                      <div className="mt-1.5 max-h-36 space-y-0.5 overflow-y-auto">
                        {allAssignees
                          .filter((name) =>
                            name.toLowerCase().includes(assigneeSearch.trim().toLowerCase()),
                          )
                          .map((name) => {
                            const active = assigneeFilters.includes(name);
                            const member = members.find((m) => m.name === name) ?? {
                              name,
                              initials: initialsOf(name) || "?",
                              color: colorFor(name),
                            };
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() => setAssigneeFilters((prev) => toggleIn(prev, name))}
                                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted/60"
                              >
                                <input
                                  type="checkbox"
                                  readOnly
                                  checked={active}
                                  className="h-3.5 w-3.5 shrink-0 rounded border-border accent-foreground"
                                />
                                <Avatar member={member} size={18} />
                                <span
                                  className={active ? "text-foreground" : "text-muted-foreground"}
                                >
                                  {name}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Prioridade</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {TASK_PRIORITIES.map((p) => {
                      const active = priorityFilters.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriorityFilters((prev) => toggleIn(prev, p))}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            active
                              ? `bg-muted ${PRIORITY_TONE[p]}`
                              : "bg-muted/50 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Flag className="h-3 w-3" />
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Etiquetas</p>
                  {allTags.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">Nenhuma etiqueta em uso.</p>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(tagsExpanded ? allTags : allTags.slice(0, 8)).map((tag) => {
                        const active = tagFilters.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setTagFilters((prev) => toggleIn(prev, tag))}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity ${colorForTag(tag, taskTags)} ${
                              active ? "" : "opacity-40 hover:opacity-70"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                      {!tagsExpanded && allTags.length > 8 && (
                        <button
                          type="button"
                          onClick={() => setTagsExpanded(true)}
                          className="rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                        >
                          Ver todas ({allTags.length})
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Prazo</p>
                  <div className="mt-1.5 space-y-0.5">
                    {(["atrasada", "hoje", "semana", "sem_prazo"] as DeadlinePeriodFilter[]).map(
                      (key) => {
                        const active = deadlineFilters.includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setDeadlineFilters((prev) => toggleIn(prev, key))}
                            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted/60"
                          >
                            <input
                              type="checkbox"
                              readOnly
                              checked={active}
                              className="h-3.5 w-3.5 shrink-0 rounded border-border accent-foreground"
                            />
                            <span className={active ? "text-foreground" : "text-muted-foreground"}>
                              {DEADLINE_PERIOD_FILTER_LABEL[key]}
                            </span>
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>

                <label className="flex items-center gap-2 border-t border-border pt-3 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={showSubtasksInline}
                    onChange={(e) => setShowSubtasksInline(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border accent-foreground"
                  />
                  Exibir subtarefas no board
                </label>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={() => setTaskDialog({ mode: "new" })}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Nova Tarefa
            </button>
          </div>
        </div>

        {activeFilterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {(isMobile ? activeFilterChips.slice(0, 2) : activeFilterChips).map((chip) => (
              <span
                key={chip.id}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  aria-label={`Remover filtro ${chip.label}`}
                  className="hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {isMobile && activeFilterChips.length > 2 && (
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                +{activeFilterChips.length - 2}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAssigneeFilters([]);
                setTagFilters([]);
                setPriorityFilters([]);
                setDeadlineFilters([]);
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Limpar tudo
            </button>
          </div>
        )}

        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
          {TASK_STATUSES.map((col) => {
            const rootItems: BoardItem[] = visibleTasks.filter((t) => t.status === col);
            const subtaskItems: BoardItem[] = showSubtasksInline
              ? allSubtasksFlat
                  .filter(({ subtask }) => subtask.status === col && taskMatchesFilters(subtask))
                  .map(({ subtask, parent }) => ({ ...subtask, __parentTask: parent }))
              : [];
            const allItems: BoardItem[] = [...rootItems, ...subtaskItems];
            // Concluído acumula pra sempre — sem limite, uma campanha/projeto
            // antigo vira uma coluna infinita de tarefas que ninguém mais
            // precisa ver no dia a dia. Mostra só as 4 mais recentes por
            // padrão (derivado do log de atividade, ver `taskCompletedAt`),
            // com "Mostrar tudo" pra quem realmente precisar olhar o histórico
            // completo.
            const isDone = col === "Concluído";
            const sortedItems = isDone
              ? [...allItems].sort((a, b) => taskCompletedAt(b).localeCompare(taskCompletedAt(a)))
              : sortTasksBy(allItems, sortPrimary, sortSecondary);
            const items = isDone && !showAllDone ? sortedItems.slice(0, 4) : sortedItems;
            const hiddenCount = allItems.length - items.length;
            return (
              <div
                key={col}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setDragOverCol(col)}
                onDragLeave={() => setDragOverCol((cur) => (cur === col ? null : cur))}
                onDrop={() => {
                  if (dragId) {
                    const dragged = tasks.find((t) => t.id === dragId);
                    if (
                      dragged &&
                      col === "Em andamento" &&
                      (pendingDepCountByTaskId.get(dragged.id) ?? 0) > 0
                    ) {
                      toast.error("Esta tarefa depende de outra ainda não concluída.");
                      setDragId(null);
                      setDragOverCol(null);
                      return;
                    }
                    if (dragged) {
                      const updated = withStatusChange(dragged, col);
                      if (updated !== dragged)
                        recordTaskLedgerEventsOnStatusChange(dragged, updated, {
                          scope,
                          members,
                          performanceSettings,
                        });
                      const finalTask = applyRecurrenceIfCompleted(dragged, updated);
                      persist(tasks.map((t) => (t.id === dragId ? finalTask : t)));
                      // Cronômetro de `time_entries` (não é mais o campo
                      // antigo que `withStatusChange` já tratou acima) — só
                      // "Concluído" para sozinho, silenciosamente.
                      const dragOrigin = taskOriginFromScope(scope);
                      if (col === "Concluído" && dragOrigin) {
                        void stopIfRunningOnTask(dragged.id.replace(/^mkt:/, ""), dragOrigin);
                      }
                    }
                  }
                  setDragId(null);
                  setDragOverCol(null);
                }}
                className={`flex w-[288px] shrink-0 flex-col rounded-xl border p-3 transition-colors ${dragOverCol === col ? "border-foreground/30 bg-muted/10" : "border-border bg-background"}`}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${TASK_STATUS_DOT[col]}`} />
                    <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {col}
                    </h3>
                  </div>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {allItems.length}
                  </span>
                </div>
                <div className="flex-1 space-y-2.5">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      draggable={!t.__parentTask}
                      onDragStart={() => !t.__parentTask && setDragId(t.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() =>
                        setTaskDialog({
                          mode: "edit",
                          data: t.__parentTask ?? t,
                          openSubtaskId: t.__parentTask ? t.id : undefined,
                        })
                      }
                      className={`group relative cursor-pointer rounded-lg border border-border bg-card p-3.5 text-sm shadow-sm transition-all hover:border-foreground/30 hover:shadow-md ${dragId === t.id ? "scale-[0.98] opacity-50 shadow-lg" : ""}`}
                    >
                      {/* Nível 1 — título (maior peso visual do card) */}
                      <div className="flex items-start gap-2">
                        {t.__parentTask && (
                          <span
                            title={`Subtarefa de "${t.__parentTask.title}"`}
                            className="mt-0.5 inline-flex shrink-0 items-center rounded border border-border bg-muted/60 px-1 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-muted-foreground"
                          >
                            Sub
                          </span>
                        )}
                        <span className="flex-1 font-semibold leading-snug text-foreground">
                          {t.title}
                        </span>
                        <CardQuickActions
                          onOpen={() =>
                            setTaskDialog({
                              mode: "edit",
                              data: t.__parentTask ?? t,
                              openSubtaskId: t.__parentTask ? t.id : undefined,
                            })
                          }
                          onDelete={(e) => {
                            e.stopPropagation();
                            if (t.__parentTask) {
                              const parent = t.__parentTask;
                              persist(
                                tasks.map((x) =>
                                  x.id === parent.id
                                    ? {
                                        ...x,
                                        subtasks: (x.subtasks ?? []).filter((s) => s.id !== t.id),
                                      }
                                    : x,
                                ),
                              );
                            } else {
                              persist(tasks.filter((x) => x.id !== t.id));
                            }
                          }}
                        />
                      </div>

                      {/* Nível 2 — indicadores rápidos: descrição preenchida, subtarefas */}
                      {(!!t.description || (t.subtasks?.length ?? 0) > 0) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          {!!t.description && (
                            <span title="Tem descrição">
                              <FileText className="h-3 w-3" />
                            </span>
                          )}
                          {(t.subtasks?.length ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedCards((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(t.id)) next.delete(t.id);
                                  else next.add(t.id);
                                  return next;
                                });
                              }}
                              className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                              {expandedCards.has(t.id) ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                              {t.subtasks!.length}{" "}
                              {t.subtasks!.length === 1 ? "subtarefa" : "subtarefas"}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Nível 3 — responsáveis + prazo + prioridade, numa única linha */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {getTaskAssignees(t).length > 0 && (
                          <AssigneeStack names={getTaskAssignees(t)} members={members} />
                        )}
                        {(t.dueDate || t.performanceDueDate) && <CardDeadlineBadge task={t} />}
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium ${PRIORITY_TONE[t.priority]}`}
                        >
                          <Flag className="h-3 w-3" /> {t.priority}
                        </span>
                      </div>

                      {/* Nível 4 — etiquetas / comentários / anexos / dependências */}
                      {((t.tags?.length ?? 0) > 0 ||
                        (t.comments?.length ?? 0) > 0 ||
                        (t.attachments?.length ?? 0) > 0 ||
                        (pendingDepCountByTaskId.get(t.id) ?? 0) > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          {(t.tags?.length ?? 0) > 0 && (
                            <>
                              <Tag className="h-3 w-3 shrink-0" />
                              <CardTags tags={t.tags!} taskTags={taskTags} />
                            </>
                          )}
                          {(t.comments?.length ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" /> {t.comments!.length}
                            </span>
                          )}
                          {(t.attachments?.length ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Paperclip className="h-3 w-3" /> {t.attachments!.length}
                            </span>
                          )}
                          {(pendingDepCountByTaskId.get(t.id) ?? 0) > 0 && (
                            <span
                              className="inline-flex items-center gap-1"
                              title={`${pendingDepCountByTaskId.get(t.id)} dependências pendentes`}
                            >
                              <Link2 className="h-3 w-3" /> {pendingDepCountByTaskId.get(t.id)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Subtarefas expandidas direto no card — cada uma como uma
                          prévia compacta; clicar nela abre a própria subtarefa
                          (o diálogo é sempre o da tarefa-mãe por baixo, mas já
                          chega direto na subtarefa — ver `openSubtaskId`). */}
                      {expandedCards.has(t.id) && (t.subtasks?.length ?? 0) > 0 && (
                        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                          {t.subtasks!.map((s) => (
                            <div
                              key={s.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setTaskDialog({ mode: "edit", data: t, openSubtaskId: s.id });
                              }}
                              className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded px-1.5 py-1 text-[11px] hover:bg-muted/40"
                            >
                              <span
                                className={`h-2.5 w-2.5 shrink-0 rounded-full ${TASK_STATUS_DOT[s.status]}`}
                                title={s.status}
                              />
                              <span
                                className={`min-w-0 flex-1 truncate ${s.status === "Concluído" ? "text-muted-foreground line-through" : "text-foreground"}`}
                              >
                                {s.title}
                              </span>
                              {!!s.description && (
                                <span
                                  title="Tem descrição"
                                  className="shrink-0 text-muted-foreground"
                                >
                                  <FileText className="h-3 w-3" />
                                </span>
                              )}
                              {getTaskAssignees(s).length > 0 && (
                                <AssigneeStack names={getTaskAssignees(s)} members={members} />
                              )}
                              {s.dueDate && (
                                <span className="shrink-0 text-muted-foreground">
                                  {fmtDateCompact(s.dueDate)}
                                </span>
                              )}
                              <span
                                className={`inline-flex shrink-0 items-center gap-1 font-medium ${PRIORITY_TONE[s.priority]}`}
                              >
                                <Flag className="h-3 w-3" /> {s.priority}
                              </span>
                              {(s.attachments?.length ?? 0) > 0 && (
                                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {isDone && hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllDone(true)}
                      className="w-full rounded-md px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    >
                      Mostrar tudo ({allItems.length})
                    </button>
                  )}
                  {isDone && showAllDone && allItems.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setShowAllDone(false)}
                      className="w-full rounded-md px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    >
                      Mostrar só as recentes
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setTaskDialog({ mode: "new", defaultStatus: col })}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" /> Adicionar
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <TaskDialog
          open={!!taskDialog}
          onOpenChange={(o) => !o && setTaskDialog(null)}
          initial={taskDialog?.data}
          defaultStatus={taskDialog?.defaultStatus}
          initialEditSubtaskId={taskDialog?.openSubtaskId}
          scope={scope}
          breadcrumb={breadcrumb}
          onSave={(t) => {
            if (taskDialog?.mode === "edit") {
              persist(tasks.map((x) => (x.id === t.id ? t : x)));
            } else {
              persist([...tasks, t]);
            }
            setTaskDialog(null);
          }}
          onDelete={
            taskDialog?.mode === "edit" && taskDialog.data
              ? () => {
                  persist(tasks.filter((x) => x.id !== taskDialog.data!.id));
                  void cleanupDependenciesForTask(taskDialog.data!.id);
                  setTaskDialog(null);
                }
              : undefined
          }
          onToggleTimer={toggleTimer}
        />
      </section>
    </TooltipProvider>
  );
}

/** Uma linha de dependência (seção Dependências do `TaskDialog`) — status
 * (bolinha colorida, mesma paleta do resto do board), título, projeto,
 * prazo quando houver, e um "•••" só visível no hover pra remover. Se a
 * tarefa referenciada não existir mais no diretório (raro — ex. dado
 * ainda propagando), cai num rótulo mínimo em vez de sumir a linha. */
function DependencyRow({
  entry,
  fallbackId,
  onOpen,
  onRemove,
}: {
  entry?: TaskDirectoryEntry;
  fallbackId: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const done = entry?.status === "Concluído";
  return (
    <div className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/50">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        {done ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${TASK_STATUS_DOT[(entry?.status as TaskStatus) ?? "Aberto"]}`}
          />
        )}
        <span
          className={`min-w-0 truncate text-xs ${done ? "text-muted-foreground line-through" : "text-foreground"}`}
        >
          {entry?.label ?? fallbackId}
        </span>
        {entry?.project && (
          <span className="shrink-0 text-[10px] text-muted-foreground">{entry.project}</span>
        )}
        {entry?.dueDate && !done && (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {formatIsoDate(entry.dueDate)}
          </span>
        )}
        <ChevronRight className="ml-auto h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Mais opções"
            className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onRemove} className="text-destructive focus:text-destructive">
            Remover dependência
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* ============================================================
 * Task dialog — ClickUp-style (shared)
 * ============================================================ */

export function TaskDialog({
  open,
  onOpenChange,
  initial,
  defaultStatus,
  parentTitle,
  scope,
  breadcrumb,
  onSave,
  onDelete,
  onToggleTimer,
  initialEditSubtaskId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: Task;
  defaultStatus?: TaskStatus;
  parentTitle?: string;
  scope?: TaskBoardScope;
  breadcrumb?: string;
  onSave: (t: Task) => void;
  onDelete?: () => void;
  onToggleTimer?: (taskId: string) => Task | null;
  /** Abre o diálogo já direto na subtarefa indicada (clique numa subtarefa
      no board não deve mostrar a tarefa-mãe primeiro). */
  initialEditSubtaskId?: string;
}) {
  const members = useTeamMembers();
  const taskTags = useTaskTags();
  const { settings: performanceSettings } = usePerformanceSettings();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [descEditing, setDescEditing] = useState(false);
  const [descMentionQuery, setDescMentionQuery] = useState<string | null>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  // Mesmo padrão de @menção do composer de comentário
  // (`TaskActivityPanel.tsx`'s `onCommentChange`/`insertMention`) —
  // replicado aqui pra descrição também ganhar autocomplete, não só
  // exibição.
  const onDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setDescription(v);
    const caret = e.target.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const m = before.match(/(?:^|\s)@([\wÀ-ÿ]*)$/);
    setDescMentionQuery(m ? m[1] : null);
  };
  const insertDescMention = (name: string) => {
    const el = descRef.current;
    const caret = el?.selectionStart ?? description.length;
    const before = description.slice(0, caret).replace(/@([\wÀ-ÿ]*)$/, `@${name} `);
    const after = description.slice(caret);
    setDescription(before + after);
    setDescMentionQuery(null);
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    }, 0);
  };
  const descMentionMatches =
    descMentionQuery !== null
      ? members
          .filter((m) => m.name.toLowerCase().includes(descMentionQuery.toLowerCase()))
          .slice(0, 5)
      : [];
  const [status, setStatus] = useState<TaskStatus>("Aberto");
  const [priority, setPriority] = useState<TaskPriority>("Normal");
  const [dueDate, setDueDate] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  // Elevados de `let`s recalculados a cada `save()` pra estado de
  // verdade — precisam refletir mudanças de prazo já confirmadas NESTA
  // sessão (silenciosas ou via formulário) antes mesmo do "Salvar" do
  // diálogo inteiro, senão o feed do Activity mostraria o evento sem
  // seus detalhes (motivo/isCritical) enquanto o diálogo ainda está
  // aberto.
  const [originalDueDate, setOriginalDueDate] = useState<string | undefined>();
  const [performanceDueDate, setPerformanceDueDate] = useState<string | undefined>();
  const [deadlineHistory, setDeadlineHistory] = useState<DeadlineChangeEntry[]>([]);
  // Mudança de prazo crítica (vence hoje/atrasada, sendo adiada) ainda
  // não confirmada — o campo já mostra a nova data (feedback visual
  // imediato), mas nada foi persistido: o formulário inline no Activity
  // decide se vira `deadlineHistory` de verdade ou é descartado.
  const [pendingDeadlineChange, setPendingDeadlineChange] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [estimate, setEstimate] = useState<string>("");
  const [recurrence, setRecurrence] = useState<TaskRecurrence | undefined>(undefined);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStartedAt, setTimerStartedAt] = useState<string | undefined>();
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [primaryAssignee, setPrimaryAssignee] = useState<string | undefined>();
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  // Exibição sempre por prazo (mais próxima primeiro, sem prazo por
  // último) — pedido explícito; a ordem de criação/`subtasks` em si não
  // muda, só a lista mostrada na tela.
  const sortedSubtasks = useMemo(
    () => [...subtasks].sort((a, b) => compareTasksByKey(a, b, "dueDate_asc")),
    [subtasks],
  );
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newSubtaskDate, setNewSubtaskDate] = useState("");
  const [newSubtaskAssignees, setNewSubtaskAssignees] = useState<string[]>([]);
  const toggleNewSubtaskAssignee = (name: string) =>
    setNewSubtaskAssignees((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );
  const [newSubtaskPriority, setNewSubtaskPriority] = useState<TaskPriority>("Normal");
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [editSubtask, setEditSubtask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [commentText, setCommentText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [, forceTimerTick] = useState(0);
  useEffect(() => {
    if (!timerRunning) return;
    const iv = setInterval(() => forceTimerTick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, [timerRunning]);

  // Dependências entre tarefas — a relação em si vive numa tabela própria
  // (`task_dependencies`, sem FK real: `Task` mora em 3 tabelas diferentes
  // conforme o escopo), carregada globalmente e mantida por realtime
  // (`useTaskDependencies`), nunca dentro do próprio `Task`. `directory`
  // resolve os ids das duas pontas pra título/projeto/status/prazo — mesmo
  // diretório usado pelo `TaskPicker` e pelo @menção do Chat.
  const allDeps = useTaskDependencies();
  const taskDirectory = useTaskDirectory();
  const directoryByRawId = useMemo(
    () => new Map(taskDirectory.map((t) => [t.rawId, t])),
    [taskDirectory],
  );
  // Nesta board (o projeto especial "Marketing" mistura tarefas próprias
  // com avulsas do Marketing) `initial.id` pode vir com o prefixo "mkt:"
  // (convenção de deep-link, não um id de banco de verdade — ver
  // `TaskDirectoryEntry.rawId` em `task-directory.ts`). `task_dependencies`
  // só aceita o uuid real, então qualquer operação de dependência sobre
  // "esta tarefa" precisa passar por esse id normalizado, nunca `initial.id`
  // direto.
  const depTaskId = initial?.id.replace(/^mkt:/, "");
  // Mesma normalização de id que `task_dependencies` já usa (acima) — o
  // painel de tempo grava em `time_entries` por uuid real, nunca pelo id
  // com prefixo "mkt:" (convenção de deep-link, não um id de banco).
  const timeTrackingTaskId = depTaskId;
  const timeTrackingOrigin = taskOriginFromScope(scope);
  const { dependsOn, blocks } = depTaskId
    ? dependenciesOf(depTaskId, allDeps)
    : { dependsOn: [], blocks: [] };
  const dependsOnPending = dependsOn.filter(
    (id) => directoryByRawId.get(id)?.status !== "Concluído",
  );
  const [depPopover, setDepPopover] = useState<null | "menu" | "depends" | "blocks">(null);
  const depsSectionRef = useRef<HTMLDivElement>(null);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [pendingSaveCloseAfter, setPendingSaveCloseAfter] = useState(false);

  const handlePickDependency = async (mode: "depends" | "blocks", picked: TaskDirectoryEntry) => {
    if (!depTaskId) return;
    const blockingId = mode === "depends" ? picked.rawId : depTaskId;
    const blockedId = mode === "depends" ? depTaskId : picked.rawId;
    const { error } = await createDependency(blockingId, blockedId);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Dependência adicionada.");
    setActivity((a) =>
      pushActivity(
        a,
        mode === "depends"
          ? `adicionou uma dependência: aguardando "${picked.label}"`
          : `definiu que esta tarefa bloqueia "${picked.label}"`,
        "dependency",
      ),
    );
    setDepPopover(null);
  };

  const handleRemoveDependency = async (dep: TaskDependency, label: string) => {
    await removeDependency(dep.id);
    setActivity((a) => pushActivity(a, `removeu a dependência "${label}"`, "dependency"));
  };

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setDescEditing(false);
    setStatus(initial?.status ?? defaultStatus ?? "Aberto");
    setPriority(initial?.priority ?? "Normal");
    setDueDate(initial?.dueDate ?? "");
    setStartDate(initial?.startDate ?? "");
    setOriginalDueDate(initial?.originalDueDate);
    setPerformanceDueDate(initial?.performanceDueDate);
    setDeadlineHistory(initial?.deadlineHistory ?? []);
    setPendingDeadlineChange(null);
    setEstimate(initial?.estimate ?? "");
    setRecurrence(initial?.recurrence);
    setTimerRunning(!!initial?.timerRunning);
    setTimerStartedAt(initial?.timerStartedAt);
    setTimeEntries(initial?.timeEntries ?? []);
    setAssignees(initial ? getTaskAssignees(initial) : []);
    setPrimaryAssignee(initial?.primaryAssignee);
    setTags(initial?.tags ?? []);
    setAttachments(initial?.attachments ?? []);
    setPreviewAttachment(null);
    setSubtasks(initial?.subtasks ?? []);
    setComments(initial?.comments ?? []);
    // Só fabrica a entrada "criando esta tarefa" pra tarefa NOVA de
    // verdade (quem está com o diálogo aberto agora é mesmo quem está
    // criando). Pra uma tarefa JÁ EXISTENTE sem histórico de atividade
    // (dado antigo, ou que chegou por um caminho que nunca gravou
    // `activity`), não inventa um "criou esta tarefa" atribuído a quem
    // só abriu o diálogo pra olhar — isso atribuía a criação a quem
    // meramente visualizava, não a quem de fato criou.
    setActivity(
      initial?.activity ??
        (initial
          ? []
          : (() => {
              const me = getCurrentAuthor();
              return [
                {
                  id: crypto.randomUUID(),
                  author: me.name,
                  initials: me.initials,
                  color: me.color,
                  action: "está criando esta tarefa",
                  createdAt: new Date().toISOString(),
                },
              ];
            })()),
    );
    setCommentText("");
    setNewSubtaskTitle("");
    setNewSubtaskDate("");
    setNewSubtaskAssignees([]);
    setNewSubtaskPriority("Normal");
    setNewTag("");
    setShowSubtaskInput(false);
    setEditSubtask(
      (initialEditSubtaskId && initial?.subtasks?.find((s) => s.id === initialEditSubtaskId)) ||
        null,
    );
    setAssigneePickerOpen(false);
  }, [open, initial, defaultStatus, initialEditSubtaskId]);

  const canSave = title.trim().length > 0;

  const pushActivity = (
    list: Activity[],
    action: string,
    kind: ActivityKind = "minor",
  ): Activity[] => {
    const me = getCurrentAuthor();
    return [
      ...list,
      {
        id: crypto.randomUUID(),
        author: me.name,
        initials: me.initials,
        color: me.color,
        action,
        createdAt: new Date().toISOString(),
        kind,
      },
    ];
  };

  /** Grava uma mudança de prazo de verdade (tarefa que já tinha prazo)
   * direto no estado local — chamada tanto no caminho silencioso
   * (antecipar, ou tarefa com prazo futuro, sem `justification`) quanto
   * na confirmação do formulário inline do Activity (`justification`
   * presente). NUNCA emite o evento de ledger aqui — isso fica só
   * dentro de `save()` (ver comentário lá), pra "Cancelar" (que
   * descarta tudo sem passar por `save()`) nunca deixar um evento órfão
   * gravado no Supabase. */
  const commitDeadlineChange = (
    to: string,
    justification?: { motivo: DeadlineChangeMotivo; observacao?: string },
  ) => {
    if (!initial?.dueDate) return;
    const from = initial.dueDate;
    const nowISO = new Date().toISOString();
    setActivity((a) => pushActivity(a, to ? `definiu prazo ${to}` : "removeu prazo", "deadline"));
    // Tarefa legada sem `originalDueDate` (backfill, mesma lógica de
    // sempre): a âncora passa a ser o prazo que ela tinha até agora.
    const anchor = originalDueDate ?? from;
    const motivo = justification?.motivo ?? "replanejamento_operacional";
    const critical = isCriticalReplan(from, nowISO);
    const entry: DeadlineChangeEntry = {
      id: crypto.randomUUID(),
      from,
      to: to || undefined,
      changedAt: nowISO,
      changedBy: getCurrentAuthor().name,
      isCritical: critical,
      motivo,
      observacao: justification?.observacao || undefined,
      exemptFromResponsibility: DEADLINE_CHANGE_MOTIVO_EXEMPTS_BY_DEFAULT[motivo],
    };
    const nextHistory = [...deadlineHistory, entry];
    setOriginalDueDate(anchor);
    setDeadlineHistory(nextHistory);
    setPerformanceDueDate(effectivePerformanceDueDate(anchor, nextHistory));
  };

  const discardPendingDeadlineChange = () => {
    setPendingDeadlineChange((pending) => {
      if (pending) setDueDate(pending.from);
      return null;
    });
  };

  /** Único ponto de entrada pro campo "Entrega" — decide se a mudança
   * salva direto (silenciosa) ou fica pendente aguardando o formulário
   * inline do Activity (crítica: vence hoje/atrasada E sendo adiada). */
  const handleDueDateChange = (v?: string) => {
    const next = v ?? "";
    if (!initial?.dueDate || next === initial.dueDate) {
      // 1ª definição de prazo, tarefa nova, ou voltou pro valor original
      // (cancela qualquer pendência obsoleta).
      setDueDate(next);
      setPendingDeadlineChange(null);
      return;
    }
    if (isCriticalDeadlineMove(initial.dueDate, next, new Date().toISOString())) {
      setDueDate(next); // feedback visual imediato — ainda não persistido
      setPendingDeadlineChange({ from: initial.dueDate, to: next });
      return;
    }
    setDueDate(next);
    setPendingDeadlineChange(null);
    commitDeadlineChange(next);
  };

  const save = (dueDateOverride?: string) => {
    if (!canSave) return;
    let act = activity;
    let cmts = comments;
    let nextTimerRunning = timerRunning;
    let nextTimerStartedAt = timerStartedAt;
    let finalTimeEntries = timeEntries;
    // `originalDueDate`/`performanceDueDate`/`deadlineHistory` já são
    // estado (ver acima) — mudanças de prazo desta sessão (silenciosas
    // ou confirmadas via formulário) já estão refletidas neles antes de
    // "Salvar" rodar, então `save()` só precisa LER, nunca recalcular.
    let finalOriginalDueDate = originalDueDate;
    let finalPerformanceDueDate = performanceDueDate;
    let finalDeadlineHistory = deadlineHistory;
    let finalCompletedAt = initial?.completedAt;
    let finalStatus = status;
    // `dueDateOverride` cobre o caso de uma pendência crítica descartada
    // no exato momento de salvar (`attemptSave`) — `dueDate` (estado)
    // ainda não refletiu a reversão síncrona quando `save()` roda logo
    // em seguida, então o valor certo precisa vir por parâmetro, não do
    // estado.
    let finalDueDate = (dueDateOverride ?? dueDate) || undefined;
    let finalStartDate = startDate || undefined;
    const me = getMe();
    const actor = getCurrentAuthor();
    const origin = taskOriginFromScope(scope);
    if (initial) {
      if (initial.title !== title.trim())
        act = pushActivity(act, `renomeou para "${title.trim()}"`);
      let statusChangedTask: Task | null = null;
      if (initial.status !== status) {
        const withTimer = withStatusChange(
          { ...initial, activity: act, comments: cmts, timerRunning, timerStartedAt, timeEntries },
          status,
        );
        act = withTimer.activity ?? act;
        cmts = withTimer.comments ?? cmts;
        // Cronômetro de `time_entries` (independente do campo antigo que
        // `withStatusChange` tratou acima) — só "Concluído" para sozinho,
        // silenciosamente; qualquer outra troca de status nunca toca nele.
        if (status === "Concluído" && origin && timeTrackingTaskId) {
          void stopIfRunningOnTask(timeTrackingTaskId, origin);
        }
        nextTimerRunning = withTimer.timerRunning ?? false;
        nextTimerStartedAt = withTimer.timerStartedAt;
        finalTimeEntries = withTimer.timeEntries ?? finalTimeEntries;
        finalCompletedAt = withTimer.completedAt;
        statusChangedTask = withTimer;
      }
      if (initial.priority !== priority) act = pushActivity(act, `definiu prioridade ${priority}`);
      const prevAssignees = getTaskAssignees(initial);
      if (prevAssignees.join(",") !== assignees.join(",")) {
        act = pushActivity(
          act,
          assignees.length ? `atribuiu a ${assignees.join(", ")}` : "removeu responsável",
          "assignee",
        );
        void notifyNewAssignees(
          assignees.filter((a) => !prevAssignees.includes(a)),
          title.trim(),
          scope,
        );
        if (isValidUuid(me.id)) {
          const ref = initial.performanceDueDate ?? initial.dueDate;
          const wasOverdueAtChange =
            initial.status !== "Concluído" &&
            !!ref &&
            Date.now() > deadlineCutoff(ref, performanceSettings.deadlineCutoffHour).getTime();
          const removed = prevAssignees.filter((a) => !assignees.includes(a));
          const added = assignees.filter((a) => !prevAssignees.includes(a));
          for (const name of [...removed, ...added]) {
            recordPerformanceEvent({
              eventType: "task_assignee_changed",
              personId: resolvePersonId(name, members),
              personName: name,
              actorId: me.id,
              actorName: actor.name,
              taskId: initial.id,
              taskOrigin: origin,
              taskTitle: title.trim(),
              meetingId: null,
              data: { change: removed.includes(name) ? "removed" : "added", wasOverdueAtChange },
            });
          }
        }
      }
      if ((initial.primaryAssignee ?? "") !== (primaryAssignee ?? "")) {
        act = pushActivity(
          act,
          primaryAssignee
            ? `transferiu a responsabilidade principal para ${primaryAssignee}`
            : "removeu o responsável principal",
          "primary_assignee",
        );
        if (isValidUuid(me.id)) {
          recordPerformanceEvent({
            eventType: "task_assignee_changed",
            personId: primaryAssignee ? resolvePersonId(primaryAssignee, members) : null,
            personName: primaryAssignee ?? actor.name,
            actorId: me.id,
            actorName: actor.name,
            taskId: initial.id,
            taskOrigin: origin,
            taskTitle: title.trim(),
            meetingId: null,
            data: {
              change: "primary_changed",
              from: initial.primaryAssignee ?? null,
              to: primaryAssignee ?? null,
            },
          });
        }
      }
      if (!initial.dueDate && finalDueDate) {
        // 1ª definição de prazo — sem motivo, sem entrada de histórico
        // (qualquer mudança SUBSEQUENTE já passou por
        // `commitDeadlineChange`, silenciosa ou via formulário, antes
        // mesmo do "Salvar" rodar).
        act = pushActivity(act, `definiu prazo ${finalDueDate}`, "deadline");
        finalOriginalDueDate = finalDueDate;
        finalPerformanceDueDate = finalDueDate;
      }
      // Emite o(s) evento(s) de ledger só aqui (nunca em
      // `commitDeadlineChange`) — por diff contra o histórico ORIGINAL
      // da tarefa, pra cobrir tanto o caminho silencioso quanto o
      // confirmado com uma única emissão, e pra "Cancelar" (que descarta
      // tudo sem passar por `save()`) nunca deixar um evento gravado no
      // Supabase pra uma edição que nunca foi salva.
      const priorDeadlineEntryIds = new Set((initial.deadlineHistory ?? []).map((e) => e.id));
      const newDeadlineEntries = finalDeadlineHistory.filter(
        (e) => !priorDeadlineEntryIds.has(e.id),
      );
      if (newDeadlineEntries.length && isValidUuid(me.id)) {
        for (const entry of newDeadlineEntries) {
          for (const name of getTaskAssignees(initial).length
            ? getTaskAssignees(initial)
            : [actor.name]) {
            recordPerformanceEvent({
              eventType: "task_deadline_changed",
              personId: resolvePersonId(name, members),
              personName: name,
              actorId: me.id,
              actorName: actor.name,
              taskId: initial.id,
              taskOrigin: origin,
              taskTitle: title.trim(),
              meetingId: null,
              data: {
                from: entry.from ?? null,
                to: entry.to ?? null,
                isCritical: entry.isCritical,
                motivo: entry.motivo ?? null,
                observacao: entry.observacao ?? null,
                exemptFromResponsibility: entry.exemptFromResponsibility,
              },
            });
          }
        }
      }
      if ((initial.description ?? "") !== description)
        act = pushActivity(act, "atualizou a descrição");
      if (statusChangedTask) {
        const candidateNext: Task = {
          ...statusChangedTask,
          deadlineHistory: finalDeadlineHistory,
          originalDueDate: finalOriginalDueDate,
          // `withStatusChange` só recebeu `initial` como base (assignees
          // antigos) — se responsável e status mudam na mesma edição, o
          // evento de conclusão precisa creditar quem está sendo salvo
          // agora, não quem estava atribuído antes.
          assignees,
          assignee: undefined,
          dueDate: finalDueDate,
          recurrence,
        };
        recordTaskLedgerEventsOnStatusChange(initial, candidateNext, {
          scope,
          members,
          performanceSettings,
        });
        const afterRecurrence = applyRecurrenceIfCompleted(initial, candidateNext);
        finalStatus = afterRecurrence.status;
        finalCompletedAt = afterRecurrence.completedAt;
        finalDueDate = afterRecurrence.dueDate;
        finalStartDate = afterRecurrence.startDate;
        finalOriginalDueDate = afterRecurrence.originalDueDate;
        finalPerformanceDueDate = afterRecurrence.performanceDueDate;
        finalDeadlineHistory = afterRecurrence.deadlineHistory ?? [];
        act = afterRecurrence.activity ?? act;
      }
    } else {
      void notifyNewAssignees(assignees, title.trim(), scope);
      if (dueDate) {
        finalOriginalDueDate = dueDate;
        finalPerformanceDueDate = dueDate;
      }
    }
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim() || undefined,
      status: finalStatus,
      priority,
      dueDate: finalDueDate,
      startDate: finalStartDate,
      estimate: estimate || undefined,
      assignees: assignees.length ? assignees : undefined,
      primaryAssignee,
      tags: tags.length ? tags : undefined,
      attachments: attachments.length ? attachments : undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      subtasks,
      comments: cmts,
      activity: act,
      timerRunning: nextTimerRunning,
      timerStartedAt: nextTimerStartedAt,
      timeEntries: finalTimeEntries,
      completedAt: finalCompletedAt,
      originalDueDate: finalOriginalDueDate,
      performanceDueDate: finalPerformanceDueDate,
      deadlineHistory: finalDeadlineHistory.length ? finalDeadlineHistory : undefined,
      recurrence,
    });
  };

  /** Ponto único de entrada pro "Salvar" (botão explícito ou fechar o
   * diálogo clicando fora/Esc). Qualquer mudança de prazo já foi
   * resolvida antes de chegar aqui (`handleDueDateChange`/formulário
   * inline do Activity) — se ainda houver uma pendência não confirmada
   * nesse momento, ela é descartada (revertida) e o resto da edição
   * salva normalmente, sem bloquear nada (item 14 do pedido). */
  const doSave = (closeAfter: boolean) => {
    // `pendingDeadlineChange` só reverte via `setState` (assíncrono) —
    // `save()` não pode confiar em `dueDate` já refletir isso quando
    // roda logo em seguida, por isso o valor de volta é passado direto.
    const dueDateOverride = pendingDeadlineChange?.from;
    discardPendingDeadlineChange();
    save(dueDateOverride);
    if (closeAfter) onOpenChange(false);
  };

  const attemptSave = (closeAfter: boolean) => {
    if (!canSave) {
      if (closeAfter) onOpenChange(false);
      return;
    }
    // Dependência não bloqueia a conclusão de verdade — só avisa. Uma
    // tarefa com dependência ainda pendente sendo marcada "Concluído"
    // pausa aqui pra confirmar, em vez de impedir (a modelagem de
    // dependência pode estar errada, e travar duro seria pior).
    if (status === "Concluído" && dependsOnPending.length > 0) {
      setPendingSaveCloseAfter(closeAfter);
      setShowCompleteConfirm(true);
      return;
    }
    doSave(closeAfter);
  };

  const toggleTimer = () => {
    if (!initial || !onToggleTimer) return;
    const updated = onToggleTimer(initial.id);
    if (!updated) return;
    setTimerRunning(!!updated.timerRunning);
    setTimerStartedAt(updated.timerStartedAt);
    setTimeEntries(updated.timeEntries ?? []);
    if ((updated.comments?.length ?? 0) > comments.length) {
      setComments((c) => [...c, updated.comments![updated.comments!.length - 1]]);
    }
    if ((updated.activity?.length ?? 0) > activity.length) {
      setActivity((a) => [...a, updated.activity![updated.activity!.length - 1]]);
    }
  };

  const addSubtask = () => {
    const t = newSubtaskTitle.trim();
    if (!t) return;
    const s: Task = {
      id: crypto.randomUUID(),
      title: t,
      status: "Aberto",
      priority: newSubtaskPriority,
      dueDate: newSubtaskDate || undefined,
      assignees: newSubtaskAssignees.length ? newSubtaskAssignees : undefined,
      createdAt: new Date().toISOString(),
    };
    setSubtasks((prev) => [...prev, s]);
    setActivity((a) => pushActivity(a, `adicionou subtarefa "${t}"`));
    setNewSubtaskTitle("");
    setNewSubtaskDate("");
    setNewSubtaskAssignees([]);
    setNewSubtaskPriority("Normal");
    setShowSubtaskInput(false);
  };
  // Toggle manual do timer de uma subtarefa, a partir do seu próprio
  // diálogo aninhado — sem isso, o campo "Timer" ali só mostrava "—",
  // sem nenhum jeito de parar um timer preso rodando numa subtarefa
  // (só dava pra ver o problema, nunca resolvê-lo pela UI).
  const toggleSubtaskTimer =
    scope?.kind === "marketing"
      ? undefined
      : (subtaskId: string): Task | null => {
          const st = subtasks.find((s) => s.id === subtaskId);
          if (!st) return null;
          const updated = st.timerRunning ? stopTaskTimer(st) : startTaskTimer(st);
          setSubtasks((prev) => prev.map((s) => (s.id === subtaskId ? updated : s)));
          return updated;
        };
  const removeSubtask = (id: string) => {
    const st = subtasks.find((x) => x.id === id);
    setSubtasks((s) => s.filter((x) => x.id !== id));
    if (st) setActivity((a) => pushActivity(a, `removeu subtarefa "${st.title}"`));
  };

  const [tagSuggestOpen, setTagSuggestOpen] = useState(false);
  // Nome da etiqueta cuja cor está sendo editada (afeta todo mundo, via
  // updateTaskTagColor) — null quando nenhum popover de cor está aberto.
  const [editingTagColor, setEditingTagColor] = useState<string | null>(null);
  // Nome digitado sem correspondência no registro — aguardando a escolha
  // de cor antes de virar uma TaskTag de verdade (createTaskTag).
  const [creatingTagName, setCreatingTagName] = useState<string | null>(null);
  const tagFieldRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tagSuggestOpen && !editingTagColor && !creatingTagName) return;
    const onDocClick = (e: MouseEvent) => {
      if (!tagFieldRef.current?.contains(e.target as Node)) {
        setTagSuggestOpen(false);
        setEditingTagColor(null);
        setCreatingTagName(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [tagSuggestOpen, editingTagColor, creatingTagName]);

  const addTag = (raw?: string) => {
    const typed = (raw ?? newTag).trim();
    if (!typed) return;
    // Reaproveita a etiqueta já existente com a MESMA grafia (comparando
    // sem diferenciar maiúsculas) em vez de criar uma quase-duplicata só
    // por causa de "Cliente" vs "cliente".
    const existing = taskTags.find((t) => t.name.toLowerCase() === typed.toLowerCase());
    if (existing) {
      setTagSuggestOpen(false);
      setNewTag("");
      if (!tags.includes(existing.name)) setTags((prev) => [...prev, existing.name]);
      return;
    }
    // Nome novo — estilo ClickUp: escolhe a cor antes de criar de fato no
    // registro compartilhado, em vez de cair numa cor aleatória.
    setTagSuggestOpen(false);
    setCreatingTagName(typed);
  };
  const confirmCreateTag = (color: string) => {
    if (!creatingTagName) return;
    const tag = createTaskTag(creatingTagName, color);
    setTags((prev) => (prev.includes(tag.name) ? prev : [...prev, tag.name]));
    setCreatingTagName(null);
    setNewTag("");
  };
  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));
  const tagSuggestions = taskTags.filter(
    (t) =>
      !tags.includes(t.name) &&
      (!newTag.trim() || t.name.toLowerCase().includes(newTag.trim().toLowerCase())),
  );

  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  // `URL.createObjectURL` só é válido na aba/sessão que criou o anexo — ao
  // recarregar a página (ou abrir em outro dispositivo) a URL já não existe
  // mais, então o anexo "sumia" mesmo salvo. Persistindo como data URL
  // (base64) direto no campo da tarefa, o arquivo sobrevive a refresh igual
  // já acontece com foto/contrato de influenciador.
  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const items: Attachment[] = await Promise.all(
      Array.from(files).map(async (f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        url: await readAsDataUrl(f),
      })),
    );
    setAttachments((a) => [...a, ...items]);
    setActivity((a) => pushActivity(a, `anexou ${items.length} arquivo(s)`));
  };
  const removeAttachment = (id: string) => setAttachments((a) => a.filter((x) => x.id !== id));

  const postComment = () => {
    const t = commentText.trim();
    if (!t) return;
    const me = getCurrentAuthor();
    setComments((c) => [
      ...c,
      {
        id: crypto.randomUUID(),
        author: me.name,
        initials: me.initials,
        color: me.color,
        text: t,
        createdAt: new Date().toISOString(),
      },
    ]);
    // O comentário em si já é o evento no feed — empurrar uma entrada de
    // activity "comentou" ao lado dele duplicava o mesmo fato duas
    // vezes (bug corrigido, item 13 do pedido).
    setCommentText("");
  };

  const doneCount = subtasks.filter((s) => s.status === "Concluído").length;
  const toggleAssignee = (name: string) => {
    setAssignees((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name],
    );
    // Remover quem era o principal limpa o campo — nunca deixa apontar
    // pra alguém que já não está mais na tarefa.
    setPrimaryAssignee((prev) => (prev === name ? undefined : prev));
  };
  const promoteToPrimary = (name: string) => {
    setPrimaryAssignee((prev) => (prev === name ? undefined : name));
  };
  const rootLabel =
    breadcrumb ??
    (scope?.kind === "projeto"
      ? "Projetos"
      : scope?.kind === "marketing"
        ? "Marketing"
        : "Campanhas");

  // Clicar fora do card (ou apertar Esc) dispara o onOpenChange do Radix com
  // `false` — antes isso só fechava e descartava qualquer edição feita sem
  // apertar "Salvar". Agora salva primeiro (se houver título) e só então
  // fecha. O botão "Cancelar" continua descartando de propósito — ele chama
  // `onOpenChange(false)` direto, sem passar por aqui.
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      attemptSave(true);
      return;
    }
    onOpenChange(o);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-6xl gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">{initial ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          <DialogDescription className="sr-only">
            Formulário de tarefa no estilo ClickUp
          </DialogDescription>

          <div className="flex items-center gap-2 border-b border-border bg-muted/30 py-2.5 pl-4 pr-12 text-[11px] text-muted-foreground">
            <span>{rootLabel}</span>
            <ChevronRight className="h-3 w-3 opacity-60" />
            <span>Tarefas</span>
            {parentTitle && (
              <>
                <ChevronRight className="h-3 w-3 opacity-60" />
                <span className="max-w-[240px] truncate" title={parentTitle}>
                  {parentTitle}
                </span>
              </>
            )}
            <ChevronRight className="h-3 w-3 opacity-60" />
            <span className="text-foreground">
              {initial ? "Editar" : parentTitle ? "Nova subtarefa" : "Nova tarefa"}
            </span>
          </div>

          <div className="grid max-h-[80vh] grid-cols-1 overflow-hidden md:grid-cols-[1fr_340px]">
            <div className="min-h-0 overflow-y-auto">
              <div className="px-8 pb-3 pt-6">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TASK_STATUS_TONE[status]}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${TASK_STATUS_DOT[status]}`} />
                    {parentTitle ? "Subtarefa" : "Tarefa"}
                  </span>
                  {dependsOnPending.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        depsSectionRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        })
                      }
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                    >
                      <Link2 className="h-3 w-3" /> Bloqueada por {dependsOnPending.length}
                    </button>
                  )}
                  {parentTitle && (
                    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                      de{" "}
                      <span
                        className="max-w-[220px] truncate font-medium text-foreground"
                        title={parentTitle}
                      >
                        {parentTitle}
                      </span>
                    </span>
                  )}
                </div>

                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
                  }}
                  placeholder="Nome da tarefa"
                  className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="grid grid-cols-1 border-y border-border bg-muted/10 px-6 py-3 sm:grid-cols-2 sm:gap-x-6 sm:px-8">
                <Field label="Status" icon={<CircleDashed className="h-3.5 w-3.5" />}>
                  <select
                    value={status}
                    onChange={(e) => {
                      const next = e.target.value as TaskStatus;
                      // Uma tarefa que ainda depende de outra não pode ser
                      // colocada "Em andamento" — a dependência pendente
                      // precisa ser resolvida primeiro. Diferente de
                      // concluir (que só avisa e deixa seguir), aqui a
                      // troca é bloqueada de verdade.
                      if (next === "Em andamento" && dependsOnPending.length > 0) {
                        toast.error("Esta tarefa depende de outra ainda não concluída.");
                        depsSectionRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                        return;
                      }
                      setStatus(next);
                    }}
                    className={`h-6 cursor-pointer rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide outline-none ${TASK_STATUS_TONE[status]}`}
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s} className="bg-background text-foreground">
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Responsável" icon={<User className="h-3.5 w-3.5" />}>
                  <Popover open={assigneePickerOpen} onOpenChange={setAssigneePickerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex min-h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-2 py-1 text-left text-sm shadow-sm hover:bg-muted/40"
                      >
                        {assignees.length === 0 ? (
                          <span className="text-muted-foreground">— Selecionar responsável —</span>
                        ) : (
                          (() => {
                            // Sem `primaryAssignee` explícito, o primeiro
                            // assignee vira um fallback visual só de exibição
                            // — nunca usado por scoring/ledger (ver
                            // `getTaskPrimaryAssignee`).
                            const primaryName = primaryAssignee ?? assignees[0];
                            const m = members.find((mm) => mm.name === primaryName);
                            const othersCount = assignees.length - 1;
                            return (
                              <>
                                <Avatar
                                  member={
                                    m ?? {
                                      name: primaryName,
                                      initials: initialsOf(primaryName) || "?",
                                      color: colorFor(primaryName),
                                    }
                                  }
                                  size={20}
                                />
                                <span className="min-w-0 flex-1 truncate">{primaryName}</span>
                                {othersCount > 0 && (
                                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    +{othersCount}
                                  </span>
                                )}
                              </>
                            );
                          })()
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="max-h-64 w-72 overflow-auto p-1">
                      {members.length === 0 ? (
                        <div className="px-2 py-2 text-xs text-muted-foreground">
                          Nenhum membro cadastrado.
                        </div>
                      ) : (
                        <>
                          <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Responsável e colaboradores
                          </p>
                          {members.map((m) => {
                            const checked = assignees.includes(m.name);
                            const isPrimary = primaryAssignee
                              ? primaryAssignee === m.name
                              : checked && assignees[0] === m.name;
                            return (
                              <div
                                key={m.name}
                                className={`flex w-full items-center gap-1 rounded px-1.5 py-1.5 text-sm hover:bg-muted ${
                                  checked ? "bg-muted/60" : ""
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleAssignee(m.name)}
                                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                >
                                  <Avatar member={m} size={20} />
                                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                                  {checked && <Check className="h-3.5 w-3.5 shrink-0" />}
                                </button>
                                {checked && (
                                  <button
                                    type="button"
                                    title={
                                      isPrimary
                                        ? "Responsável principal"
                                        : "Tornar responsável principal"
                                    }
                                    onClick={() => promoteToPrimary(m.name)}
                                    className={`shrink-0 rounded p-1 hover:bg-background ${
                                      isPrimary
                                        ? "text-amber-500"
                                        : "text-muted-foreground/50 hover:text-amber-500"
                                    }`}
                                  >
                                    <Star
                                      className={`h-3.5 w-3.5 ${isPrimary ? "fill-amber-500" : ""}`}
                                    />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </PopoverContent>
                  </Popover>
                </Field>

                <Field label="Prioridade" icon={<Flag className="h-3.5 w-3.5" />}>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className={`w-full cursor-pointer border-0 bg-transparent p-0 text-sm font-medium outline-none ${PRIORITY_TONE[priority]}`}
                  >
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p} className="text-foreground">
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Prazo" icon={<Calendar className="h-3.5 w-3.5" />}>
                  <div className="flex w-full flex-wrap items-center gap-2">
                    <DateField
                      variant="inline"
                      value={startDate || undefined}
                      onChange={(v) => setStartDate(v ?? "")}
                      max={dueDate || undefined}
                      rangeStart={startDate || undefined}
                      rangeEnd={dueDate || undefined}
                      ariaLabel="Início"
                      placeholder="Início"
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <DateField
                      variant="inline"
                      value={dueDate || undefined}
                      onChange={handleDueDateChange}
                      min={startDate || undefined}
                      rangeStart={startDate || undefined}
                      rangeEnd={dueDate || undefined}
                      ariaLabel="Entrega"
                      placeholder="Entrega"
                      recurrence={recurrence}
                      onRecurrenceChange={setRecurrence}
                    />
                    {initial && (dueDate || initial.performanceDueDate) && (
                      <DeadlineHealthBadge task={initial} />
                    )}
                  </div>
                </Field>

                <Field label="Tempo" icon={<Clock className="h-3.5 w-3.5" />}>
                  {initial && timeTrackingOrigin ? (
                    <TimeTrackingPanel
                      taskId={timeTrackingTaskId!}
                      taskOrigin={timeTrackingOrigin}
                      members={members}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {initial ? "—" : "Disponível após criar a tarefa"}
                    </span>
                  )}
                </Field>

                <Field label="Etiquetas" icon={<Tag className="h-3.5 w-3.5" />}>
                  <div className="relative w-full" ref={tagFieldRef}>
                    <div className="flex w-full flex-wrap items-center gap-1.5">
                      {tags.map((t) => (
                        <span
                          key={t}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${colorForTag(t, taskTags)}`}
                        >
                          <button
                            type="button"
                            title="Editar cor desta etiqueta (reflete pra todo mundo)"
                            onClick={() => setEditingTagColor(editingTagColor === t ? null : t)}
                          >
                            {t}
                          </button>
                          <button type="button" onClick={() => removeTag(t)}>
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                      <input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onFocus={() => setTagSuggestOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag();
                          }
                        }}
                        placeholder={tags.length ? "" : "Adicionar etiqueta"}
                        className="min-w-24 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
                      />
                    </div>

                    {editingTagColor && (
                      <div className="absolute z-20 mt-1 w-56 rounded-md border border-border bg-popover p-2 shadow">
                        <p className="mb-1.5 px-1 text-[11px] text-muted-foreground">
                          Cor de "{editingTagColor}" — reflete em todas as tarefas
                        </p>
                        <TagColorSwatches
                          value={taskTags.find((t) => t.name === editingTagColor)?.color}
                          onPick={(color) => {
                            const tag = taskTags.find((t) => t.name === editingTagColor);
                            if (tag) updateTaskTagColor(tag.id, color);
                            setEditingTagColor(null);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const tag = taskTags.find((t) => t.name === editingTagColor);
                            if (tag) deleteTaskTag(tag.id);
                            removeTag(editingTagColor);
                            setEditingTagColor(null);
                          }}
                          className="mt-1 w-full rounded px-2 py-1 text-left text-[11px] text-destructive hover:bg-destructive/10"
                        >
                          Excluir etiqueta do registro
                        </button>
                      </div>
                    )}

                    {creatingTagName && (
                      <div className="absolute z-20 mt-1 w-56 rounded-md border border-border bg-popover p-2 shadow">
                        <p className="mb-1.5 px-1 text-[11px] text-muted-foreground">
                          Escolha uma cor para "{creatingTagName}"
                        </p>
                        <TagColorSwatches onPick={confirmCreateTag} />
                      </div>
                    )}

                    {tagSuggestOpen && !editingTagColor && !creatingTagName && (
                      <div className="absolute z-10 mt-1 max-h-48 w-full max-w-56 overflow-auto rounded-md border border-border bg-popover p-1 shadow">
                        {tagSuggestions.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => addTag(t.name)}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                          >
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${t.color}`}
                            >
                              {t.name}
                            </span>
                          </button>
                        ))}
                        {newTag.trim() &&
                          !taskTags.some(
                            (t) => t.name.toLowerCase() === newTag.trim().toLowerCase(),
                          ) && (
                            <button
                              type="button"
                              onClick={() => addTag()}
                              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-primary hover:bg-muted"
                            >
                              + Criar etiqueta "{newTag.trim()}"
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                </Field>
              </div>

              <div className="px-8 py-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Descrição
                </p>
                {descEditing ? (
                  <div className="relative">
                    {descMentionMatches.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
                        {descMentionMatches.map((m) => (
                          <button
                            key={m.name}
                            type="button"
                            // `onMouseDown` (não `onClick`) pra disparar antes do
                            // `onBlur` do textarea — senão o dropdown já tinha
                            // fechado (e a descrição saído de edição) antes do
                            // clique registrar.
                            onMouseDown={(e) => {
                              e.preventDefault();
                              insertDescMention(m.name);
                            }}
                            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                          >
                            <Avatar member={m} size={20} />
                            {m.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <textarea
                      ref={descRef}
                      value={description}
                      onChange={onDescriptionChange}
                      onBlur={() => {
                        setDescEditing(false);
                        setDescMentionQuery(null);
                      }}
                      placeholder="Escreva algo, adicione detalhes, links, use @ para mencionar…"
                      rows={10}
                      className="min-h-[120px] w-full resize-y border-0 bg-transparent p-0 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70"
                    />
                  </div>
                ) : description ? (
                  // Links e @menções viram clicáveis/destacados só na
                  // visualização — o textarea de edição continua sendo texto
                  // puro, senão editar vira um problema.
                  <div
                    onClick={() => {
                      setDescEditing(true);
                      setTimeout(() => descRef.current?.focus(), 0);
                    }}
                    className="min-h-[120px] w-full cursor-text whitespace-pre-wrap text-sm leading-relaxed text-foreground"
                  >
                    {renderMentions(description, members)}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDescEditing(true);
                      setTimeout(() => descRef.current?.focus(), 0);
                    }}
                    className="min-h-[60px] w-full text-left text-sm text-muted-foreground/70"
                  >
                    Escreva algo, adicione detalhes, links…
                  </button>
                )}
              </div>

              {initial && (
                <div className="space-y-4 border-t border-border px-8 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Relações
                  </p>

                  <div ref={depsSectionRef} className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">Dependências</span>
                      {dependsOn.length + blocks.length > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          {dependsOn.length + blocks.length}
                        </span>
                      )}
                    </div>

                    {dependsOn.length === 0 && blocks.length === 0 ? (
                      <p className="pl-5 text-xs text-muted-foreground">Nenhuma dependência</p>
                    ) : (
                      <div className="space-y-2 pl-5">
                        {dependsOn.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Depende de
                            </p>
                            {dependsOn.map((id) => {
                              const dep = allDeps.find(
                                (d) => d.blockedTaskId === depTaskId && d.blockingTaskId === id,
                              );
                              const entry = directoryByRawId.get(id);
                              if (!dep) return null;
                              return (
                                <DependencyRow
                                  key={dep.id}
                                  entry={entry}
                                  fallbackId={id}
                                  onOpen={() => pushTaskModal(id)}
                                  onRemove={() =>
                                    void handleRemoveDependency(dep, entry?.label ?? id)
                                  }
                                />
                              );
                            })}
                          </div>
                        )}

                        {blocks.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Bloqueia
                            </p>
                            {blocks.map((id) => {
                              const dep = allDeps.find(
                                (d) => d.blockingTaskId === depTaskId && d.blockedTaskId === id,
                              );
                              const entry = directoryByRawId.get(id);
                              if (!dep) return null;
                              return (
                                <DependencyRow
                                  key={dep.id}
                                  entry={entry}
                                  fallbackId={id}
                                  onOpen={() => pushTaskModal(id)}
                                  onRemove={() =>
                                    void handleRemoveDependency(dep, entry?.label ?? id)
                                  }
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="pl-5">
                      <Popover
                        open={depPopover !== null}
                        onOpenChange={(o) => !o && setDepPopover(null)}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setDepPopover("menu")}
                            className="flex items-center gap-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Adicionar dependência
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          side="bottom"
                          align="start"
                          sideOffset={6}
                          collisionPadding={16}
                          className={
                            depPopover === "menu" ? "w-56 p-1" : "w-[380px] max-w-[90vw] p-0"
                          }
                        >
                          {depPopover === "menu" && (
                            <div className="space-y-0.5">
                              <button
                                type="button"
                                onClick={() => setDepPopover("depends")}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                              >
                                ← Esta tarefa depende de...
                              </button>
                              <button
                                type="button"
                                onClick={() => setDepPopover("blocks")}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                              >
                                → Esta tarefa bloqueia...
                              </button>
                            </div>
                          )}
                          {(depPopover === "depends" || depPopover === "blocks") && (
                            <TaskPicker
                              excludeTaskId={depTaskId ?? ""}
                              currentProjectId={scope?.kind === "projeto" ? scope.id : undefined}
                              currentCampanhaId={scope?.kind === "campanha" ? scope.id : undefined}
                              onSelect={(picked) => void handlePickDependency(depPopover, picked)}
                            />
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-foreground">Subtarefas</span>
                      {subtasks.length > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          {doneCount}/{subtasks.length}
                        </span>
                      )}
                    </div>

                    {(showSubtaskInput || subtasks.length > 0) && (
                      <div className="space-y-1 pl-5">
                        {sortedSubtasks.map((s) => {
                          const done = s.status === "Concluído";
                          const subtaskAssignees = getTaskAssignees(s);
                          return (
                            <div
                              key={s.id}
                              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                            >
                              {/* Subtarefa é uma tarefa completa (status/prioridade/responsável/data),
                            não um item de checklist — status muda direto aqui, sem passar pela
                            subtarefa. A cor do círculo é o status (mesma paleta de sempre,
                            TASK_STATUS_DOT); o <select> continua funcional por baixo, só fica
                            visualmente reduzido a um círculo (texto transparente). */}
                              <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
                                <select
                                  value={s.status}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const next = e.target.value as TaskStatus;
                                    // `withStatusChange` já para o timer da
                                    // subtarefa se ele estava rodando (e inicia se
                                    // o novo status for "Em andamento") — sem
                                    // passar por ela aqui, um timer preso rodando
                                    // nunca parava só porque o status mudou.
                                    const updated = withStatusChange(s, next);
                                    setSubtasks((prev) =>
                                      prev.map((st) => (st.id === s.id ? updated : st)),
                                    );
                                    setActivity((a) =>
                                      pushActivity(a, `mudou status de "${s.title}" para ${next}`),
                                    );
                                    // Cronômetro de `time_entries` da subtarefa —
                                    // só "Concluído" para sozinho, silenciosamente.
                                    if (next === "Concluído" && timeTrackingOrigin) {
                                      void stopIfRunningOnTask(
                                        s.id.replace(/^mkt:/, ""),
                                        timeTrackingOrigin,
                                      );
                                    }
                                    // Sem isso, concluir/reabrir uma subtarefa por
                                    // aqui (o caminho mais usado, direto na linha)
                                    // nunca gerava o evento de XP/"concluídas
                                    // hoje" — só concluir a tarefa-mãe (drag no
                                    // board ou Salvar no diálogo) ou abrir a
                                    // subtarefa em seu próprio diálogo passavam
                                    // por `recordTaskLedgerEventsOnStatusChange`.
                                    // Isso fazia o Score subcontar completions de
                                    // verdade (ex.: 10 concluídas no dia, só 3
                                    // contadas).
                                    if (updated !== s) {
                                      recordTaskLedgerEventsOnStatusChange(s, updated, {
                                        scope,
                                        members,
                                        performanceSettings,
                                      });
                                    }
                                  }}
                                  title={s.status}
                                  aria-label={`Status: ${s.status}`}
                                  className={`absolute inset-0 h-4 w-4 cursor-pointer appearance-none rounded-full text-transparent outline-none ${TASK_STATUS_DOT[s.status]}`}
                                >
                                  {TASK_STATUSES.map((st) => (
                                    <option
                                      key={st}
                                      value={st}
                                      className="bg-background text-foreground"
                                    >
                                      {st}
                                    </option>
                                  ))}
                                </select>
                                {done && (
                                  <Check className="pointer-events-none h-2.5 w-2.5 text-background" />
                                )}
                              </span>

                              <button
                                type="button"
                                onClick={() => setEditSubtask(s)}
                                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              >
                                <span
                                  className={`flex-1 truncate text-sm ${done ? "text-muted-foreground line-through" : ""}`}
                                >
                                  {s.title}
                                </span>
                                {!!s.description && (
                                  <span
                                    title="Tem descrição"
                                    className="shrink-0 text-muted-foreground"
                                  >
                                    <FileText className="h-3 w-3" />
                                  </span>
                                )}
                                {subtaskAssignees.length > 0 && (
                                  <span className="inline-flex shrink-0 items-center -space-x-1.5">
                                    {subtaskAssignees.map((a) => (
                                      <Avatar
                                        key={a}
                                        member={
                                          members.find((m) => m.name === a) ?? {
                                            name: a,
                                            initials: initialsOf(a) || "?",
                                            color: colorFor(a),
                                          }
                                        }
                                        size={16}
                                      />
                                    ))}
                                  </span>
                                )}
                              </button>

                              {/* Prioridade — mesmo truque do status: select funcional por baixo,
                            visual de bandeira+texto (mesma cor de sempre, PRIORITY_TONE). */}
                              <span className="relative inline-flex shrink-0 items-center">
                                <Flag
                                  className={`pointer-events-none absolute left-1 h-3 w-3 ${PRIORITY_TONE[s.priority]}`}
                                />
                                <select
                                  value={s.priority}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const next = e.target.value as TaskPriority;
                                    setSubtasks((prev) =>
                                      prev.map((st) =>
                                        st.id === s.id ? { ...st, priority: next } : st,
                                      ),
                                    );
                                  }}
                                  className={`cursor-pointer appearance-none rounded bg-transparent py-0.5 pl-5 pr-1 text-[11px] font-medium outline-none ${PRIORITY_TONE[s.priority]}`}
                                >
                                  {(["Urgente", "Alta", "Normal", "Baixa"] as TaskPriority[]).map(
                                    (p) => (
                                      <option
                                        key={p}
                                        value={p}
                                        className="bg-background text-foreground"
                                      >
                                        {p}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </span>

                              {s.dueDate && (
                                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  {fmtDate(s.dueDate)}
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => removeSubtask(s.id)}
                                className="opacity-0 transition group-hover:opacity-100"
                              >
                                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          );
                        })}
                        {showSubtaskInput && (
                          <div className="rounded-md border border-border bg-background p-2">
                            <input
                              autoFocus
                              value={newSubtaskTitle}
                              onChange={(e) => setNewSubtaskTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addSubtask();
                                }
                              }}
                              placeholder="Nome da subtarefa"
                              className="mb-2 w-full border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground/70"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <DateField
                                variant="input"
                                value={newSubtaskDate || undefined}
                                onChange={(v) => setNewSubtaskDate(v ?? "")}
                                placeholder="Data"
                                ariaLabel="Data da subtarefa"
                                className="h-auto w-auto rounded border px-2 py-1 text-xs shadow-none"
                              />
                              <CompactAssigneePicker
                                selected={newSubtaskAssignees}
                                members={members}
                                onToggle={toggleNewSubtaskAssignee}
                              />
                              <select
                                value={newSubtaskPriority}
                                onChange={(e) =>
                                  setNewSubtaskPriority(e.target.value as TaskPriority)
                                }
                                className={`rounded px-2 py-1 text-xs font-medium outline-none ${PRIORITY_TONE[newSubtaskPriority]}`}
                              >
                                {(["Urgente", "Alta", "Normal", "Baixa"] as TaskPriority[]).map(
                                  (p) => (
                                    <option
                                      key={p}
                                      value={p}
                                      className="bg-background text-foreground"
                                    >
                                      {p}
                                    </option>
                                  ),
                                )}
                              </select>
                              <div className="ml-auto flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowSubtaskInput(false);
                                    setNewSubtaskTitle("");
                                    setNewSubtaskDate("");
                                    setNewSubtaskAssignees([]);
                                  }}
                                  className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={addSubtask}
                                  disabled={!newSubtaskTitle.trim()}
                                  className="rounded bg-foreground px-2 py-1 text-[11px] font-medium text-background hover:opacity-90 disabled:opacity-50"
                                >
                                  Adicionar
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowSubtaskInput((v) => !v)}
                      className="flex items-center gap-2 py-1 pl-5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar subtarefa
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2 border-t border-border px-8 py-4">
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Anexos
                  </p>
                  {attachments.length > 0 && (
                    <span className="text-[11px] text-muted-foreground">{attachments.length}</span>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />

                {attachments.length > 0 && (
                  <div className="space-y-1">
                    {attachments.map((a) => (
                      <div
                        key={a.id}
                        className="group flex items-center gap-2 rounded border border-border bg-background px-2 py-1 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => setPreviewAttachment(a)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{a.name}</span>
                        </button>
                        {a.url && (
                          <a
                            href={a.url}
                            download={a.name}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Baixar ${a.name}`}
                            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(a.id)}
                          className="shrink-0 opacity-0 transition group-hover:opacity-100"
                        >
                          <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void addFiles(e.dataTransfer.files);
                  }}
                >
                  Arraste arquivos aqui ou{" "}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="text-primary hover:underline"
                  >
                    procure nos arquivos
                  </button>
                </div>
              </div>
            </div>

            <TaskActivityPanel
              task={{
                status,
                dueDate: dueDate || undefined,
                originalDueDate,
                performanceDueDate,
                deadlineHistory,
                completedAt: initial?.completedAt,
              }}
              activity={activity}
              comments={comments}
              members={members}
              commentText={commentText}
              onCommentTextChange={setCommentText}
              onPostComment={postComment}
              deadlineCutoffHour={performanceSettings.deadlineCutoffHour}
              pendingDeadlineChange={pendingDeadlineChange}
              onConfirmDeadlineChange={(motivo, observacao) => {
                if (!pendingDeadlineChange) return;
                commitDeadlineChange(pendingDeadlineChange.to, { motivo, observacao });
                setPendingDeadlineChange(null);
              }}
              onCancelDeadlineChange={discardPendingDeadlineChange}
            />
          </div>

          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-3">
            <div>
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => attemptSave(false)}
                disabled={!canSave}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
              >
                {initial ? "Salvar" : "Criar tarefa"}
              </button>
            </div>
          </div>
        </DialogContent>
        {editSubtask && (
          <TaskDialog
            open={!!editSubtask}
            onOpenChange={(o) => !o && setEditSubtask(null)}
            initial={editSubtask ?? undefined}
            scope={scope}
            parentTitle={title || "Tarefa mãe"}
            onSave={(t) => {
              setSubtasks((prev) => prev.map((s) => (s.id === t.id ? t : s)));
              setActivity((a) => pushActivity(a, `atualizou subtarefa "${t.title}"`));
              setEditSubtask(null);
            }}
            onDelete={() => {
              removeSubtask(editSubtask.id);
              setEditSubtask(null);
            }}
            onToggleTimer={toggleSubtaskTimer}
          />
        )}
        <AttachmentPreviewDialog
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      </Dialog>
      <AlertDialog
        open={showCompleteConfirm}
        onOpenChange={(o) => !o && setShowCompleteConfirm(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esta tarefa ainda possui dependências pendentes</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Aguardando:</p>
                <ul className="list-disc pl-4">
                  {dependsOnPending.map((id) => (
                    <li key={id}>{directoryByRawId.get(id)?.label ?? id}</li>
                  ))}
                </ul>
                <p>Tem certeza que deseja concluir mesmo assim?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCompleteConfirm(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowCompleteConfirm(false);
                doSave(pendingSaveCloseAfter);
              }}
            >
              Concluir mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function isImageAttachment(a: Attachment): boolean {
  if (a.url?.startsWith("data:image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(a.name);
}

// Anexos são salvos como data URL (ver `addFiles`), e navegadores modernos
// bloqueiam abrir um `data:` diretamente numa nova aba via target="_blank"
// (mostra "about:blank#blocked") — por segurança contra phishing. Convertendo
// pra um Blob e abrindo a `blob:` URL resultante contorna o bloqueio.
function openAttachment(url: string) {
  if (!url.startsWith("data:")) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const [header, base64] = url.split(",");
  const mime = header.match(/data:(.*?)(;base64)?$/)?.[1] || "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  window.open(blobUrl, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

function AttachmentPreviewDialog({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  if (!attachment) return null;
  const isImage = isImageAttachment(attachment);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <DialogTitle className="min-w-0 truncate text-sm font-medium">
            {attachment.name}
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-1">
            {attachment.url && (
              <>
                <button
                  type="button"
                  onClick={() => openAttachment(attachment.url!)}
                  aria-label="Abrir em nova aba"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
                <a
                  href={attachment.url}
                  download={attachment.name}
                  aria-label="Baixar"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Download className="h-4 w-4" />
                </a>
              </>
            )}
          </div>
        </div>
        <DialogDescription className="sr-only">Pré-visualização do anexo</DialogDescription>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/20 p-4">
          {isImage && attachment.url ? (
            <img
              src={attachment.url}
              alt={attachment.name}
              className="max-h-full max-w-full rounded-md object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <FileText className="h-10 w-10" />
              <p>Sem pré-visualização disponível para este arquivo.</p>
              {attachment.url && (
                <button
                  type="button"
                  onClick={() => openAttachment(attachment.url!)}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir em nova aba
                </button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Badge compacto de saúde do prazo (item 7 do pedido — DIMENSÃO
 * separada do status operacional, nunca um status novo) + ícone de
 * replanejamento quando `deadlineHistory` não está vazio (fato
 * ortogonal à saúde, não um 6º estado concorrente). Clicar/abrir mostra
 * o popover de contexto (item 17): prazo atual, original, e cada
 * replanejamento com motivo — lido direto de `deadlineHistory`
 * estruturado, nunca reconstruído por parsing de texto livre. */
function DeadlineHealthBadge({ task }: { task: Task }) {
  const { settings: performanceSettings } = usePerformanceSettings();
  const health = taskDeadlineHealth(task, undefined, performanceSettings.deadlineCutoffHour);
  const history = task.deadlineHistory ?? [];
  const hasHistory = history.length > 0;
  const showOriginal = task.originalDueDate && task.originalDueDate !== task.dueDate;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${health.tone}`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${health.dot}`} />
          {health.label}
          {hasHistory && <CornerUpRight className="h-3 w-3 shrink-0 opacity-70" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs" align="start">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Prazo atual</span>
            <span className="font-medium text-foreground">{fmtDate(task.dueDate ?? "")}</span>
          </div>
          {showOriginal && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Prazo original</span>
              <span className="font-medium text-foreground">{fmtDate(task.originalDueDate!)}</span>
            </div>
          )}
        </div>
        {hasHistory && (
          <div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Replanejamentos
            </p>
            {[...history].reverse().map((h) => {
              const critico = h.isCritical && !h.exemptFromResponsibility;
              return (
                <div key={h.id} className={critico ? "text-red-700 dark:text-red-400" : ""}>
                  <p className="flex items-center gap-1 font-medium">
                    <CornerUpRight className="h-3 w-3 shrink-0" />
                    {h.from ? fmtDate(h.from) : "—"} → {h.to ? fmtDate(h.to) : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {h.changedBy} · {formatWhen(h.changedAt)}
                    {h.motivo && <> · Motivo: {DEADLINE_CHANGE_MOTIVO_LABEL[h.motivo]}</>}
                  </p>
                  {critico && (
                    <p className="text-[11px] font-medium">Alterado após o prazo operacional</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2.5 border-t border-border pt-2 text-[10px] text-muted-foreground">
          Prazos encerram às {performanceSettings.deadlineCutoffHour}h.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function Field({
  label,
  icon,
  children,
  className,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`group grid min-h-12 grid-cols-[104px_minmax(0,1fr)] items-start gap-3 border-b border-border/60 px-1 py-2.5 transition-colors hover:bg-muted/30 sm:px-2 ${className ?? ""}`}
    >
      <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground/70">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-foreground">
        {children}
      </div>
    </div>
  );
}
