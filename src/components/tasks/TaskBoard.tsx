import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronRight,
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
  ListChecks,
} from "lucide-react";

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { linkifyText } from "@/lib/linkify";
import {
  isRequested,
  requestForMarketing,
  removeRequest,
  onRequestsChange,
} from "@/lib/marketing-tasks";
import { loadTeamMembers } from "@/lib/projetos";
import { getMe } from "@/lib/chat-store";

/** Best-effort: notifica (push no celular/desktop) quem acabou de ser
 * atribuído a esta tarefa — nunca deve travar/quebrar o salvamento se
 * falhar. Resolve nome -> id via o diretório do time (o campo `assignees`
 * da tarefa guarda nomes, não ids). */
async function notifyNewAssignees(names: string[], taskTitle: string) {
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
        url: "/time?section=projetos",
      },
    });
  } catch (err) {
    console.warn("[task] push notification failed", err);
  }
}

/* ============================================================
 * Types & constants (shared task model — same as Campanhas)
 * ============================================================ */

export type TaskStatus =
  | "Aberto"
  | "Em andamento"
  | "Em aprovação"
  | "Em ajustes"
  | "Aprovado"
  | "Concluído"
  | "Arquivado";

export const TASK_STATUSES: TaskStatus[] = [
  "Aberto",
  "Em andamento",
  "Em aprovação",
  "Em ajustes",
  "Aprovado",
  "Concluído",
  "Arquivado",
];

export const TASK_STATUS_TONE: Record<TaskStatus, string> = {
  Aberto: "bg-muted text-muted-foreground",
  "Em andamento": "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  "Em aprovação": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "Em ajustes": "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  Aprovado: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Concluído: "bg-foreground text-background",
  Arquivado: "bg-muted/60 text-muted-foreground line-through",
};

export const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  Aberto: "bg-muted-foreground/50",
  "Em andamento": "bg-sky-500",
  "Em aprovação": "bg-amber-500",
  "Em ajustes": "bg-orange-500",
  Aprovado: "bg-emerald-500",
  Concluído: "bg-foreground",
  Arquivado: "bg-muted-foreground/30",
};

export type TaskPriority = "Urgente" | "Alta" | "Normal" | "Baixa";
const TASK_PRIORITIES: TaskPriority[] = ["Urgente", "Alta", "Normal", "Baixa"];
const PRIORITY_TONE: Record<TaskPriority, string> = {
  Urgente: "text-red-600 dark:text-red-400",
  Alta: "text-amber-600 dark:text-amber-400",
  Normal: "text-sky-600 dark:text-sky-400",
  Baixa: "text-muted-foreground",
};

export type Comment = {
  id: string;
  author: string;
  initials: string;
  color: string;
  text: string;
  createdAt: string;
};
export type Activity = {
  id: string;
  author: string;
  initials: string;
  color: string;
  action: string;
  createdAt: string;
};
export type Attachment = { id: string; name: string; url?: string };
export type TimeEntry = { seconds: number; author: string; endedAt: string };
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
  tags?: string[];
  attachments?: Attachment[];
  createdAt: string;
  subtasks?: Task[];
  comments?: Comment[];
  activity?: Activity[];
  timerRunning?: boolean;
  timerStartedAt?: string;
  timeEntries?: TimeEntry[];
};

/** `assignees` (novo, múltiplos) tem prioridade; cai para `assignee` (legado, único) quando ausente. */
export function getTaskAssignees(t: Pick<Task, "assignee" | "assignees">): string[] {
  if (t.assignees?.length) return t.assignees;
  return t.assignee ? [t.assignee] : [];
}

/** Quando a tarefa foi concluída — a última vez que o log de atividade
 * registrou "mudou status para Concluído" (mesma derivação de
 * `src/lib/score.ts:taskCompletionDate`, sem campo `completedAt`
 * dedicado). Cai pra `createdAt` se não achar (tarefa concluída sem
 * passar pelo fluxo normal, ou dado antigo sem esse log) — só usado pra
 * ordenar a coluna Concluído da mais recente pra mais antiga. */
function taskCompletedAt(t: Task): string {
  const entries = (t.activity ?? []).filter((a) => a.action === "mudou status para Concluído");
  return entries.length > 0 ? entries[entries.length - 1].createdAt : t.createdAt;
}

type Member = { name: string; initials: string; color: string; photo?: string };

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
function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function readTeamMembers(): Member[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("time:membros");
    const arr = raw ? (JSON.parse(raw) as Array<{ name?: string; photo?: string }>) : [];
    const seen = new Set<string>();
    const out: Member[] = [];
    for (const m of arr) {
      const name = (m.name ?? "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, initials: initialsOf(name) || "?", color: colorFor(name), photo: m.photo });
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
  next = {
    ...next,
    status: newStatus,
    activity: [
      ...(next.activity ?? []),
      {
        id: crypto.randomUUID(),
        author: me.name,
        initials: me.initials,
        color: me.color,
        action: `mudou status para ${newStatus}`,
        createdAt: new Date().toISOString(),
      },
    ],
  };
  if (newStatus === "Em andamento") next = startTaskTimer(next);
  return next;
}

function formatWhen(iso: string) {
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

function Avatar({ member, size = 20 }: { member: Member; size?: number }) {
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

function renderMentions(text: string, members: Member[]) {
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
const fmtDate = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR") : "—");

export type TaskBoardScope =
  | { kind: "campanha"; id: string }
  | { kind: "projeto"; id: string }
  | { kind: "marketing" };

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
  } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const members = useTeamMembers();

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

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{tasks.length} no total</p>
        </div>
        <button
          type="button"
          onClick={() => setTaskDialog({ mode: "new" })}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Nova Tarefa
        </button>
      </div>

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
        {TASK_STATUSES.map((col) => {
          const allItems = tasks.filter((t) => t.status === col);
          // Concluído acumula pra sempre — sem limite, uma campanha/projeto
          // antigo vira uma coluna infinita de tarefas que ninguém mais
          // precisa ver no dia a dia. Mostra só as 4 mais recentes por
          // padrão (derivado do log de atividade, ver `taskCompletedAt`),
          // com "Mostrar tudo" pra quem realmente precisar olhar o histórico
          // completo.
          const isDone = col === "Concluído";
          const sortedItems = isDone
            ? [...allItems].sort((a, b) => taskCompletedAt(b).localeCompare(taskCompletedAt(a)))
            : allItems;
          const items = isDone && !showAllDone ? sortedItems.slice(0, 4) : sortedItems;
          const hiddenCount = allItems.length - items.length;
          return (
            <div
              key={col}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId)
                  persist(tasks.map((t) => (t.id === dragId ? withStatusChange(t, col) : t)));
                setDragId(null);
              }}
              className="flex w-[260px] shrink-0 flex-col rounded-xl border border-border bg-background p-3"
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
              <div className="flex-1 space-y-2">
                {items.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    onClick={() => setTaskDialog({ mode: "edit", data: t })}
                    className="group cursor-pointer rounded-md border border-border bg-background p-3 text-sm shadow-sm hover:border-foreground/20"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-1 text-foreground">{t.title}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          persist(tasks.filter((x) => x.id !== t.id));
                        }}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                    {(t.dueDate ||
                      getTaskAssignees(t).length > 0 ||
                      (t.subtasks?.length ?? 0) > 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {getTaskAssignees(t).length > 0 && (
                          <span className="inline-flex items-center -space-x-1.5 truncate">
                            {getTaskAssignees(t).map((a) => (
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
                            <span className="ml-2 truncate">{getTaskAssignees(t).join(", ")}</span>
                          </span>
                        )}
                        {t.dueDate && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {fmtDate(t.dueDate)}
                          </span>
                        )}
                        {(t.subtasks?.length ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <ListChecks className="h-3 w-3" />
                            {t.subtasks!.filter((s) => s.status === "Concluído").length}/
                            {t.subtasks!.length}
                          </span>
                        )}
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
                setTaskDialog(null);
              }
            : undefined
        }
        onToggleTimer={toggleTimer}
      />
    </section>
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
}) {
  const members = useTeamMembers();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [descEditing, setDescEditing] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<TaskStatus>("Aberto");
  const [priority, setPriority] = useState<TaskPriority>("Normal");
  const [dueDate, setDueDate] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [estimate, setEstimate] = useState<string>("");
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStartedAt, setTimerStartedAt] = useState<string | undefined>();
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const assigneePickerRef = useRef<HTMLDivElement>(null);
  // Sem isso, o dropdown de responsáveis só fechava clicando de novo no
  // próprio botão — clicar em qualquer outro campo do formulário (Prazo,
  // Prioridade etc.) ficava bloqueado por ele, sem fechar nada.
  useEffect(() => {
    if (!assigneePickerOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!assigneePickerRef.current?.contains(e.target as Node)) setAssigneePickerOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [assigneePickerOpen]);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
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
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [, forceTimerTick] = useState(0);
  useEffect(() => {
    if (!timerRunning) return;
    const iv = setInterval(() => forceTimerTick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, [timerRunning]);

  const mktScope = scope && (scope.kind === "campanha" || scope.kind === "projeto") ? scope : null;
  const [mktRequested, setMktRequested] = useState(
    () => !!(mktScope && initial && isRequested(mktScope.kind, mktScope.id, initial.id)),
  );
  useEffect(() => {
    setMktRequested(!!(mktScope && initial && isRequested(mktScope.kind, mktScope.id, initial.id)));
    if (!mktScope || !initial) return;
    return onRequestsChange(() =>
      setMktRequested(isRequested(mktScope.kind, mktScope.id, initial.id)),
    );
  }, [mktScope?.kind, mktScope?.id, initial, open]);
  const [justRequested, setJustRequested] = useState(false);
  const toggleMarketing = () => {
    if (!mktScope || !initial) return;
    if (mktRequested) {
      removeRequest(mktScope.kind, mktScope.id, initial.id);
    } else {
      requestForMarketing(mktScope.kind, mktScope.id, initial.id);
      setJustRequested(true);
      setTimeout(() => setJustRequested(false), 1400);
    }
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
    setEstimate(initial?.estimate ?? "");
    setTimerRunning(!!initial?.timerRunning);
    setTimerStartedAt(initial?.timerStartedAt);
    setTimeEntries(initial?.timeEntries ?? []);
    setAssignees(initial ? getTaskAssignees(initial) : []);
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
    setMentionQuery(null);
    setEditSubtask(null);
    setAssigneePickerOpen(false);
  }, [open, initial, defaultStatus]);

  const canSave = title.trim().length > 0;

  const pushActivity = (list: Activity[], action: string): Activity[] => {
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
      },
    ];
  };

  const save = () => {
    if (!canSave) return;
    let act = activity;
    let cmts = comments;
    let nextTimerRunning = timerRunning;
    let nextTimerStartedAt = timerStartedAt;
    let finalTimeEntries = timeEntries;
    if (initial) {
      if (initial.title !== title.trim())
        act = pushActivity(act, `renomeou para "${title.trim()}"`);
      if (initial.status !== status) {
        const withTimer = withStatusChange(
          { ...initial, activity: act, comments: cmts, timerRunning, timerStartedAt, timeEntries },
          status,
        );
        act = withTimer.activity ?? act;
        cmts = withTimer.comments ?? cmts;
        nextTimerRunning = withTimer.timerRunning ?? false;
        nextTimerStartedAt = withTimer.timerStartedAt;
        finalTimeEntries = withTimer.timeEntries ?? finalTimeEntries;
      }
      if (initial.priority !== priority) act = pushActivity(act, `definiu prioridade ${priority}`);
      const prevAssignees = getTaskAssignees(initial);
      if (prevAssignees.join(",") !== assignees.join(",")) {
        act = pushActivity(
          act,
          assignees.length ? `atribuiu a ${assignees.join(", ")}` : "removeu responsável",
        );
        void notifyNewAssignees(
          assignees.filter((a) => !prevAssignees.includes(a)),
          title.trim(),
        );
      }
      if ((initial.dueDate ?? "") !== dueDate)
        act = pushActivity(act, dueDate ? `definiu prazo ${dueDate}` : "removeu prazo");
      if ((initial.description ?? "") !== description)
        act = pushActivity(act, "atualizou a descrição");
    } else {
      void notifyNewAssignees(assignees, title.trim());
    }
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      dueDate: dueDate || undefined,
      startDate: startDate || undefined,
      estimate: estimate || undefined,
      assignees: assignees.length ? assignees : undefined,
      tags: tags.length ? tags : undefined,
      attachments: attachments.length ? attachments : undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      subtasks,
      comments: cmts,
      activity: act,
      timerRunning: nextTimerRunning,
      timerStartedAt: nextTimerStartedAt,
      timeEntries: finalTimeEntries,
    });
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
  const toggleSubtask = (id: string) => {
    setSubtasks((prev) =>
      prev.map((st) => {
        if (st.id === id) {
          const done = st.status === "Concluído";
          setActivity((a) =>
            pushActivity(a, `${done ? "reabriu" : "concluiu"} subtarefa "${st.title}"`),
          );
          // Concluir por aqui é uma troca de status na marra (não passa por
          // `withStatusChange`) — sem parar o timer da própria subtarefa
          // manualmente, um timer deixado rodando nela nunca parava,
          // mesmo com a subtarefa já concluída.
          const next = !done && st.timerRunning ? stopTaskTimer(st) : st;
          return { ...next, status: done ? "Aberto" : "Concluído" };
        }
        return st;
      }),
    );
  };
  const removeSubtask = (id: string) => {
    const st = subtasks.find((x) => x.id === id);
    setSubtasks((s) => s.filter((x) => x.id !== id));
    if (st) setActivity((a) => pushActivity(a, `removeu subtarefa "${st.title}"`));
  };

  const addTag = () => {
    const t = newTag.trim();
    if (!t || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
    setNewTag("");
  };
  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

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
    setActivity((a) => pushActivity(a, "comentou"));
    setCommentText("");
    setMentionQuery(null);
  };

  const onCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setCommentText(v);
    const caret = e.target.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const m = before.match(/(?:^|\s)@([\wÀ-ÿ]*)$/);
    setMentionQuery(m ? m[1] : null);
  };
  const insertMention = (name: string) => {
    const el = commentRef.current;
    const caret = el?.selectionStart ?? commentText.length;
    const before = commentText.slice(0, caret).replace(/@([\wÀ-ÿ]*)$/, `@${name} `);
    const after = commentText.slice(caret);
    setCommentText(before + after);
    setMentionQuery(null);
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    }, 0);
  };
  const mentionMatches =
    mentionQuery !== null
      ? members.filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
      : [];

  const doneCount = subtasks.filter((s) => s.status === "Concluído").length;
  const toggleAssignee = (name: string) => {
    setAssignees((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name],
    );
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
    if (!o && canSave) save();
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{initial ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
        <DialogDescription className="sr-only">
          Formulário de tarefa no estilo ClickUp
        </DialogDescription>

        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
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
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className={`h-6 cursor-pointer rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide outline-none ${TASK_STATUS_TONE[status]}`}
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-background text-foreground">
                      {s}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Responsáveis" icon={<User className="h-3.5 w-3.5" />}>
                <div className="relative w-full" ref={assigneePickerRef}>
                  <button
                    type="button"
                    onClick={() => setAssigneePickerOpen((v) => !v)}
                    className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-left text-sm shadow-sm hover:bg-muted/40"
                  >
                    {assignees.length === 0 ? (
                      <span className="text-muted-foreground">— Selecione responsáveis —</span>
                    ) : (
                      assignees.map((a) => {
                        const m = members.find((mm) => mm.name === a);
                        return (
                          <span
                            key={a}
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[11px]"
                          >
                            <Avatar
                              member={
                                m ?? { name: a, initials: initialsOf(a) || "?", color: colorFor(a) }
                              }
                              size={16}
                            />
                            {a}
                            <X
                              className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleAssignee(a);
                              }}
                            />
                          </span>
                        );
                      })
                    )}
                  </button>
                  {assigneePickerOpen && (
                    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow">
                      {members.length === 0 ? (
                        <div className="px-2 py-2 text-xs text-muted-foreground">
                          Nenhum membro cadastrado.
                        </div>
                      ) : (
                        members.map((m) => {
                          const checked = assignees.includes(m.name);
                          return (
                            <button
                              key={m.name}
                              type="button"
                              onClick={() => toggleAssignee(m.name)}
                              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${
                                checked ? "bg-muted font-medium text-foreground" : ""
                              }`}
                            >
                              <Avatar member={m} size={20} />
                              <span className="min-w-0 flex-1 truncate">{m.name}</span>
                              {checked && <Check className="h-3.5 w-3.5 shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
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
                <div className="flex w-full items-center gap-2">
                  {startDate !== "" && (
                    <>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="border-0 bg-transparent p-0 text-sm outline-none"
                        aria-label="Início"
                      />
                      <span className="text-xs text-muted-foreground">→</span>
                    </>
                  )}
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="border-0 bg-transparent p-0 text-sm outline-none"
                    aria-label="Entrega"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setStartDate(
                        startDate === "" ? dueDate || new Date().toISOString().slice(0, 10) : "",
                      )
                    }
                    className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {startDate === "" ? "+ adicionar início" : "só entrega"}
                  </button>
                </div>
              </Field>

              <Field label="Timer" icon={<Clock className="h-3.5 w-3.5" />}>
                {initial && onToggleTimer ? (
                  (() => {
                    const accumulated = timeEntries.reduce((s, e) => s + e.seconds, 0);
                    const running = timerRunning
                      ? (Date.now() - Date.parse(timerStartedAt ?? "")) / 1000
                      : 0;
                    const total = accumulated + running;
                    return (
                      <button
                        type="button"
                        onClick={toggleTimer}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium tabular-nums ${
                          timerRunning
                            ? "bg-sky-500/10 text-sky-700 dark:text-sky-400"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {timerRunning ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        {total > 0 ? formatDuration(total) : "Iniciar"}
                      </button>
                    );
                  })()
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {initial ? "—" : "Disponível após criar a tarefa"}
                  </span>
                )}
              </Field>

              <Field label="Etiquetas" icon={<Tag className="h-3.5 w-3.5" />}>
                <div className="flex w-full flex-wrap items-center gap-1.5">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                    >
                      {t}
                      <button type="button" onClick={() => removeTag(t)}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                  <input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
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
              </Field>
            </div>

            <div className="px-8 py-4">
              {descEditing ? (
                <textarea
                  ref={descRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => setDescEditing(false)}
                  placeholder="Escreva algo, adicione detalhes, links…"
                  rows={10}
                  className="min-h-[220px] w-full resize-y border-0 bg-transparent p-0 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70"
                />
              ) : description ? (
                // Links viram clicáveis só na visualização — o textarea de edição
                // continua sendo texto puro, senão editar o link vira um problema.
                <div
                  onClick={() => {
                    setDescEditing(true);
                    setTimeout(() => descRef.current?.focus(), 0);
                  }}
                  className="min-h-[220px] w-full cursor-text whitespace-pre-wrap text-sm leading-relaxed text-foreground"
                >
                  {linkifyText(description, "task-desc")}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDescEditing(true);
                    setTimeout(() => descRef.current?.focus(), 0);
                  }}
                  className="min-h-[220px] w-full text-left text-sm text-muted-foreground/70"
                >
                  Escreva algo, adicione detalhes, links…
                </button>
              )}
            </div>

            <div className="space-y-0 px-8 pb-2">
              <button
                type="button"
                onClick={() => setShowSubtaskInput((v) => !v)}
                className="flex w-full items-center gap-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar subtarefa
                {subtasks.length > 0 && (
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    ({doneCount}/{subtasks.length})
                  </span>
                )}
              </button>

              {(showSubtaskInput || subtasks.length > 0) && (
                <div className="ml-1 space-y-1 py-1">
                  {subtasks.map((s) => {
                    const done = s.status === "Concluído";
                    const subtaskAssignees = getTaskAssignees(s);
                    return (
                      <div
                        key={s.id}
                        className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                      >
                        {/* Subtarefa é uma tarefa completa (status/prioridade/responsável/data),
                            não um item de checklist — status muda direto aqui, sem checkbox. */}
                        <select
                          value={s.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const next = e.target.value as TaskStatus;
                            setSubtasks((prev) =>
                              prev.map((st) => (st.id === s.id ? { ...st, status: next } : st)),
                            );
                            setActivity((a) =>
                              pushActivity(a, `mudou status de "${s.title}" para ${next}`),
                            );
                          }}
                          className={`shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide outline-none ${TASK_STATUS_TONE[s.status]}`}
                        >
                          {TASK_STATUSES.map((st) => (
                            <option key={st} value={st} className="bg-background text-foreground">
                              {st}
                            </option>
                          ))}
                        </select>
                        <select
                          value={s.priority}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const next = e.target.value as TaskPriority;
                            setSubtasks((prev) =>
                              prev.map((st) => (st.id === s.id ? { ...st, priority: next } : st)),
                            );
                          }}
                          className={`shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide outline-none ${PRIORITY_TONE[s.priority]}`}
                        >
                          {(["Urgente", "Alta", "Normal", "Baixa"] as TaskPriority[]).map((p) => (
                            <option key={p} value={p} className="bg-background text-foreground">
                              {p}
                            </option>
                          ))}
                        </select>
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
                          {s.dueDate && (
                            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {fmtDate(s.dueDate)}
                            </span>
                          )}
                        </button>

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
                        <input
                          type="date"
                          value={newSubtaskDate}
                          onChange={(e) => setNewSubtaskDate(e.target.value)}
                          className="rounded border border-border bg-background px-2 py-1 text-xs outline-none"
                        />
                        <CompactAssigneePicker
                          selected={newSubtaskAssignees}
                          members={members}
                          onToggle={toggleNewSubtaskAssignee}
                        />
                        <select
                          value={newSubtaskPriority}
                          onChange={(e) => setNewSubtaskPriority(e.target.value as TaskPriority)}
                          className={`rounded px-2 py-1 text-xs font-medium outline-none ${PRIORITY_TONE[newSubtaskPriority]}`}
                        >
                          {(["Urgente", "Alta", "Normal", "Baixa"] as TaskPriority[]).map((p) => (
                            <option key={p} value={p} className="bg-background text-foreground">
                              {p}
                            </option>
                          ))}
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
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center gap-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Anexos{" "}
                {attachments.length > 0 && (
                  <span className="text-[11px]">({attachments.length})</span>
                )}
              </button>
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
                <div className="ml-5 space-y-1 py-1">
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
            </div>

            <div
              className="mx-8 mb-6 mt-2 rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground"
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

          <div className="flex min-h-0 flex-col border-l border-border bg-muted/20">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <p className="text-sm font-semibold">Activity</p>
              <span className="text-[10px] text-muted-foreground">
                {activity.length + comments.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-3">
                {[
                  ...activity.map((a) => ({ kind: "activity" as const, item: a })),
                  ...comments.map((c) => ({ kind: "comment" as const, item: c })),
                ]
                  .sort(
                    (a, b) =>
                      new Date(a.item.createdAt).getTime() - new Date(b.item.createdAt).getTime(),
                  )
                  .map((e) =>
                    e.kind === "activity" ? (
                      <div key={e.item.id} className="flex min-w-0 items-start gap-2">
                        <Avatar
                          member={
                            members.find((m) => m.name === e.item.author) ?? {
                              name: e.item.author,
                              initials: e.item.initials,
                              color: e.item.color,
                            }
                          }
                          size={24}
                        />
                        <div className="min-w-0 flex-1 break-words text-xs leading-relaxed [overflow-wrap:anywhere]">
                          <span className="font-medium text-foreground">{e.item.author}</span>{" "}
                          <span className="text-muted-foreground">{e.item.action}</span>
                          <div className="text-[10px] text-muted-foreground/70">
                            {formatWhen(e.item.createdAt)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={e.item.id} className="flex min-w-0 items-start gap-2">
                        <Avatar
                          member={
                            members.find((m) => m.name === e.item.author) ?? {
                              name: e.item.author,
                              initials: e.item.initials,
                              color: e.item.color,
                            }
                          }
                          size={24}
                        />
                        <div className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-2">
                          <div className="mb-0.5 flex items-baseline gap-1.5">
                            <span className="text-xs font-medium">{e.item.author}</span>
                            <span className="text-[10px] text-muted-foreground/70">
                              {formatWhen(e.item.createdAt)}
                            </span>
                          </div>
                          <div className="whitespace-pre-wrap break-words text-xs leading-relaxed [overflow-wrap:anywhere]">
                            {renderMentions(e.item.text, members)}
                          </div>
                        </div>
                      </div>
                    ),
                  )}
              </div>
            </div>

            <div className="relative border-t border-border bg-background p-3">
              {mentionMatches.length > 0 && (
                <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
                  {mentionMatches.map((m) => (
                    <button
                      key={m.name}
                      type="button"
                      onClick={() => insertMention(m.name)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold ${m.color}`}
                      >
                        {m.initials}
                      </span>
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                ref={commentRef}
                value={commentText}
                onChange={onCommentChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    postComment();
                  }
                }}
                rows={2}
                placeholder="Escreva um comentário… use @ para mencionar"
                className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/70 focus:border-primary"
              />
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={postComment}
                  disabled={!commentText.trim()}
                  className="rounded-md bg-foreground px-2.5 py-1 text-[11px] font-medium text-background hover:opacity-90 disabled:opacity-50"
                >
                  Comentar
                </button>
              </div>
            </div>
          </div>
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
            {mktScope && initial && (
              <button
                type="button"
                onClick={toggleMarketing}
                disabled={justRequested}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-300 ${
                  justRequested
                    ? "scale-105 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : mktRequested
                      ? "bg-muted text-foreground hover:bg-muted/70"
                      : "border border-border text-foreground hover:bg-muted"
                }`}
              >
                {justRequested ? (
                  <>
                    <Check className="h-3.5 w-3.5 animate-in zoom-in duration-300" />
                    Solicitado!
                  </>
                ) : mktRequested ? (
                  "Remover do Marketing"
                ) : (
                  "Solicitar para o Marketing"
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
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
        />
      )}
      <AttachmentPreviewDialog
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </Dialog>
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

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="group grid min-h-12 grid-cols-[104px_minmax(0,1fr)] items-center gap-3 border-b border-border/60 px-1 transition-colors hover:bg-muted/30 sm:px-2">
      <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="flex min-w-0 items-center text-sm text-foreground">{children}</div>
    </div>
  );
}
