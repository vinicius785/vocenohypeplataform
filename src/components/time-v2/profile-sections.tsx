import { useMemo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { MiniStat } from "@/components/team/member-ui";
import { PRIORITY_TONE, TASK_STATUS_TONE } from "@/components/tasks/TaskBoard";
import { OPEN_STATUSES } from "@/lib/score";
import { BUCKET_ORDER, type DashTask } from "@/lib/task-aggregation";
import type { AggregateIndicators } from "@/lib/performance-engine";
import type { TimeEntry } from "@/lib/time-entries";
import type { Meeting } from "@/lib/reunioes-store";
import {
  type ProfileAttendance,
  type ProfileCompletion,
  type ProfileDeadlineChange,
} from "@/components/team/ScoreOperacionalPanel";
import type { Member, TimeField } from "@/components/TimeSection";
import { todayIsoInBrasilia } from "@/lib/timezone";
import {
  canSeeField,
  formatHours,
  groupJourneyByDay,
  totalSecondsByUser,
  type MemberTaskStats,
} from "./time-v2-utils";

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
};

function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
        {children}
      </h3>
      {right}
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-text-secondary">
      {children}
    </p>
  );
}

/** Linha de tarefa — uma lista enxuta (nome, contexto, prioridade, status,
 * prazo), nunca um card por tarefa. Clicável: abre a tarefa de verdade. */
export function TaskRow({ task, onOpen }: { task: DashTask; onOpen: (t: DashTask) => void }) {
  const overdue = task.bucket === "atrasada";
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
        <p className="truncate text-xs text-text-secondary">{task.projectName}</p>
      </div>
      {task.priority && (
        <span
          className={`hidden shrink-0 text-[11px] font-semibold sm:inline ${PRIORITY_TONE[task.priority]}`}
        >
          {task.priority}
        </span>
      )}
      <span
        className={`hidden shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide md:inline-flex ${TASK_STATUS_TONE[task.status]}`}
      >
        {task.status}
      </span>
      <span
        className={`w-20 shrink-0 text-right text-xs tabular-nums ${overdue ? "font-semibold text-destructive" : "text-text-secondary"}`}
      >
        {task.due || "—"}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Visão geral                                                         */
/* ------------------------------------------------------------------ */

export function ProfileOverview({
  member,
  viewer,
  stats,
  completedCount,
  scoreValue,
  totalSeconds,
  overdueTasks,
  onOpenTask,
  startOfDayToday,
}: {
  member: Member;
  viewer: { isAdmin: boolean; meId: string | null };
  stats: MemberTaskStats;
  completedCount: number;
  scoreValue: number | null;
  totalSeconds: number;
  overdueTasks: DashTask[];
  onOpenTask: (t: DashTask) => void;
  startOfDayToday: string | null;
}) {
  const see = (f: TimeField) => canSeeField(member, f, viewer);
  const rows: { label: string; value: string }[] = [];
  if (see("role") && member.role) rows.push({ label: "Cargo", value: member.role });
  if (see("email") && member.email) rows.push({ label: "E-mail", value: member.email });
  if (see("birthday") && member.birthday)
    rows.push({ label: "Aniversário", value: member.birthday.split("-").reverse().join("/") });
  if (see("salary") && member.salary) rows.push({ label: "Salário", value: member.salary });
  if (see("startOfDay") && startOfDayToday)
    rows.push({ label: "Início do dia (hoje)", value: startOfDayToday });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MiniStat label="Abertas" value={stats.abertas} />
        <MiniStat
          label="Atrasadas"
          value={stats.atrasadas}
          tone={stats.atrasadas > 0 ? "danger" : "neutral"}
        />
        <MiniStat label="Concluídas" value={completedCount} />
        <MiniStat label="Horas" value={formatHours(totalSeconds)} />
        <MiniStat label="Score" value={scoreValue ?? "—"} />
      </div>

      {overdueTasks.length > 0 && (
        <section>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" /> Precisa de atenção
            </span>
          </SectionTitle>
          <div className="rounded-lg border border-border p-1">
            {overdueTasks.slice(0, 4).map((t) => (
              <TaskRow key={t.id} task={t} onOpen={onOpenTask} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Dados do membro</SectionTitle>
        {rows.length === 0 ? (
          <EmptyLine>Sem informações liberadas para visualização.</EmptyLine>
        ) : (
          <dl className="divide-y divide-border/60 rounded-lg border border-border">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-3 px-3 py-2">
                <dt className="shrink-0 text-xs text-text-secondary">{r.label}</dt>
                <dd className="min-w-0 break-words text-right text-xs font-medium text-foreground">
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tarefas                                                             */
/* ------------------------------------------------------------------ */

function TaskGroup({
  title,
  tasks,
  onOpen,
  tone,
}: {
  title: string;
  tasks: DashTask[];
  onOpen: (t: DashTask) => void;
  tone?: "danger";
}) {
  if (tasks.length === 0) return null;
  return (
    <section>
      <SectionTitle
        right={<span className="text-[11px] tabular-nums text-text-secondary">{tasks.length}</span>}
      >
        <span className={tone === "danger" ? "text-destructive" : undefined}>{title}</span>
      </SectionTitle>
      <div className="rounded-lg border border-border p-1">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

export function ProfileTasks({
  tasks,
  onOpenTask,
}: {
  tasks: DashTask[];
  onOpenTask: (t: DashTask) => void;
}) {
  const { atrasadas, proximas, abertas, concluidas } = useMemo(() => {
    const open = tasks
      .filter((t) => OPEN_STATUSES.has(t.status))
      .sort((a, b) => BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket]);
    return {
      atrasadas: open.filter((t) => t.bucket === "atrasada"),
      proximas: open.filter((t) => ["hoje", "amanha", "semana"].includes(t.bucket)),
      abertas: open.filter((t) => t.bucket === "outro"),
      concluidas: tasks
        .filter((t) => t.status === "Concluído" && t.completedAt)
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
        .slice(0, 8),
    };
  }, [tasks]);

  if (atrasadas.length + proximas.length + abertas.length + concluidas.length === 0) {
    return <EmptyLine>Nenhuma tarefa vinculada a esta pessoa.</EmptyLine>;
  }
  return (
    <div className="space-y-5">
      <TaskGroup title="Atrasadas" tasks={atrasadas} onOpen={onOpenTask} tone="danger" />
      <TaskGroup title="Próximas do vencimento" tasks={proximas} onOpen={onOpenTask} />
      <TaskGroup title="Abertas" tasks={abertas} onOpen={onOpenTask} />
      <TaskGroup title="Concluídas recentemente" tasks={concluidas} onOpen={onOpenTask} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Jornada                                                             */
/* ------------------------------------------------------------------ */

export function ProfileJourney({
  member,
  entries,
  loading,
  statusLabel,
  canSeeStart,
}: {
  member: Member;
  entries: TimeEntry[];
  loading: boolean;
  statusLabel: string;
  canSeeStart: boolean;
}) {
  const days = useMemo(() => groupJourneyByDay(entries), [entries]);
  const total = totalSecondsByUser(entries).get(member.id) ?? 0;
  const running = days.some((d) => d.running);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Status atual" value={running ? "Em atividade" : statusLabel} />
        <MiniStat label="Horas no período" value={formatHours(total)} />
        <MiniStat label="Dias com registro" value={days.length} />
      </div>
      {loading ? (
        <EmptyLine>Carregando registros…</EmptyLine>
      ) : days.length === 0 ? (
        <EmptyLine>Nenhum registro de jornada neste período.</EmptyLine>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] gap-2 border-b border-border bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-secondary sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
            <span>Dia</span>
            <span>Entrada</span>
            <span>Saída</span>
            <span className="text-right">Horas</span>
            {canSeeStart && <span className="hidden text-right sm:block">Início do dia</span>}
          </div>
          <div className="divide-y divide-border/60">
            {days.map((d) => (
              <div
                key={d.day}
                className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] items-center gap-2 px-3 py-2 text-xs tabular-nums sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]"
              >
                <span className="truncate font-medium capitalize text-foreground">
                  {dayLabel(d.day)}
                </span>
                <span className="text-text-secondary">{hhmm(d.firstStart)}</span>
                <span className="text-text-secondary">
                  {d.running ? "Em atividade" : d.lastEnd ? hhmm(d.lastEnd) : "—"}
                </span>
                <span className="text-right font-medium text-foreground">
                  {formatHours(d.seconds)}
                </span>
                {canSeeStart && (
                  <span className="hidden text-right text-text-secondary sm:block">
                    {member.startTimes?.[d.day] ?? "—"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desempenho                                                          */
/* ------------------------------------------------------------------ */

function delta(cur: number, prev: number, unit = ""): string | null {
  const d = cur - prev;
  if (d === 0) return `igual ao período anterior (${prev}${unit})`;
  return `${d > 0 ? "+" : "−"}${Math.abs(Math.round(d * 10) / 10)}${unit} vs período anterior`;
}

export function ProfilePerformance({
  completed,
  previousCompleted,
  agg,
  previousAgg,
  overdueNow,
  meetingsAttended,
  meetingsExpected,
  totalSeconds,
}: {
  completed: number;
  previousCompleted: number;
  agg: AggregateIndicators;
  previousAgg: AggregateIndicators;
  overdueNow: number;
  meetingsAttended: number;
  meetingsExpected: number;
  totalSeconds: number;
}) {
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
  const Card = ({
    label,
    value,
    hint,
  }: {
    label: string;
    value: string | number;
    hint?: string | null;
  }) => (
    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-text-secondary">{hint}</p>}
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Card
        label="Tarefas concluídas"
        value={completed}
        hint={delta(completed, previousCompleted)}
      />
      <Card
        label="No prazo"
        value={pct(agg.pctNoPrazo)}
        hint={
          completed > 0 ? `${completed} concluída${completed === 1 ? "" : "s"} na amostra` : null
        }
      />
      <Card label="Atrasadas agora" value={overdueNow} />
      <Card
        label="Replanejamentos"
        value={agg.qtdReplanejamentos}
        hint={delta(agg.qtdReplanejamentos, previousAgg.qtdReplanejamentos)}
      />
      <Card
        label="Reuniões"
        value={meetingsExpected === 0 ? "—" : `${meetingsAttended}/${meetingsExpected}`}
        hint={meetingsExpected === 0 ? "Nenhuma esperada no período" : "participadas / esperadas"}
      />
      <Card label="Horas trabalhadas" value={formatHours(totalSeconds)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Histórico                                                           */
/* ------------------------------------------------------------------ */

type HistoryItem = { at: string; label: string; detail?: string };

export function ProfileHistory({
  completions,
  deadlineChanges,
  attendance,
  meetingsById,
  projectNames,
}: {
  completions: ProfileCompletion[];
  deadlineChanges: ProfileDeadlineChange[];
  attendance: ProfileAttendance[];
  meetingsById: Map<string, Meeting>;
  projectNames: string[];
}) {
  const items = useMemo<HistoryItem[]>(() => {
    const out: HistoryItem[] = [];
    for (const c of completions) {
      out.push({
        at: c.occurredAt,
        label: `Concluiu “${c.taskTitle ?? "tarefa"}”`,
        detail: c.outcome === "late" ? "com atraso" : "no prazo",
      });
    }
    for (const d of deadlineChanges) {
      out.push({
        at: d.occurredAt,
        label: `Replanejou o prazo de “${d.taskTitle ?? "tarefa"}”`,
        detail: d.isCritical ? "no dia / após o vencimento" : undefined,
      });
    }
    for (const a of attendance) {
      const title = a.meetingId ? meetingsById.get(a.meetingId)?.titulo : undefined;
      out.push({
        at: a.occurredAt,
        label: `${a.attended ? "Participou" : "Não participou"} da reunião${title ? ` “${title}”` : ""}`,
      });
    }
    return out.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 25);
  }, [completions, deadlineChanges, attendance, meetingsById]);

  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Campanhas e projetos</SectionTitle>
        {projectNames.length === 0 ? (
          <EmptyLine>Nenhum projeto ou campanha vinculado.</EmptyLine>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {projectNames.slice(0, 12).map((n) => (
              <span
                key={n}
                className="max-w-[220px] truncate rounded-full border border-border px-2.5 py-1 text-[11px] text-text-secondary"
              >
                {n}
              </span>
            ))}
            {projectNames.length > 12 && (
              <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-text-secondary">
                +{projectNames.length - 12}
              </span>
            )}
          </div>
        )}
      </section>
      <section>
        <SectionTitle>Atividade no período</SectionTitle>
        {items.length === 0 ? (
          <EmptyLine>Sem atividade registrada neste período.</EmptyLine>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border border-border">
            {items.map((i, idx) => (
              <li key={`${i.at}-${idx}`} className="flex items-start gap-3 px-3 py-2">
                <span className="w-16 shrink-0 pt-0.5 text-[11px] tabular-nums text-text-secondary">
                  {todayIsoInBrasilia(new Date(i.at)).split("-").reverse().slice(0, 2).join("/")}
                </span>
                <p className="min-w-0 flex-1 break-words text-xs text-foreground">
                  {i.label}
                  {i.detail && <span className="text-text-secondary"> · {i.detail}</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
