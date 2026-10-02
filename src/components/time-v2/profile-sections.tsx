import { forwardRef, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { MiniStat } from "@/components/team/member-ui";
import { PRIORITY_TONE, TASK_STATUS_TONE } from "@/components/tasks/TaskBoard";
import { OPEN_STATUSES } from "@/lib/score";
import { BUCKET_ORDER, type DashTask } from "@/lib/task-aggregation";
import {
  SAMPLE_CONFIDENCE_LABEL,
  SCORE_CLASSIFICACAO_TONE,
  type AggregateIndicators,
  type ScoreOperacionalV2,
} from "@/lib/performance-engine";
import type { TimeEntry } from "@/lib/time-entries";
import type { Meeting } from "@/lib/reunioes-store";
import type {
  ProfileAttendance,
  ProfileCompletion,
  ProfileDeadlineChange,
} from "@/components/team/ScoreOperacionalPanel";
import type { Member, TimeField } from "@/components/TimeSection";
import { todayIsoInBrasilia } from "@/lib/timezone";
import { canSeeField, formatHours, groupJourneyByDay, totalSecondsByUser } from "./time-v2-utils";

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

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-4 text-center text-sm text-text-secondary">
      {children}
    </p>
  );
}

function SubTitle({
  children,
  count,
  tone,
}: {
  children: ReactNode;
  count?: number;
  tone?: "danger";
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <h4
        className={`text-[11px] font-semibold uppercase tracking-wide ${tone === "danger" ? "text-destructive" : "text-text-secondary"}`}
      >
        {children}
      </h4>
      {count != null && (
        <span className="text-[11px] tabular-nums text-text-secondary">{count}</span>
      )}
    </div>
  );
}

/** "Ver mais (N)" / "Ver menos" — usado em toda lista que pode crescer, pra
 * nunca despejar dezenas de itens de uma vez. */
function useLimited<T>(items: T[], limit: number) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, limit);
  const hidden = items.length - visible.length;
  const toggle =
    items.length > limit ? (
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="mt-1 w-full rounded-md px-2 py-1.5 text-center text-[11px] font-medium text-text-secondary hover:bg-muted/50 hover:text-foreground"
      >
        {expanded ? "Ver menos" : `Ver mais (${hidden})`}
      </button>
    ) : null;
  return { visible, toggle };
}

/* ------------------------------------------------------------------ */
/* Moldura de seção (âncora do perfil contínuo)                         */
/* ------------------------------------------------------------------ */

export const ProfileSection = forwardRef<
  HTMLElement,
  {
    id: string;
    icon: ReactNode;
    title: string;
    highlighted?: boolean;
    right?: ReactNode;
    children: ReactNode;
  }
>(function ProfileSection({ id, icon, title, highlighted, right, children }, ref) {
  return (
    <section
      ref={ref}
      id={`perfil-${id}`}
      aria-labelledby={`perfil-${id}-titulo`}
      className={`scroll-mt-16 rounded-xl border bg-card p-4 transition-shadow ${highlighted ? "border-primary/60 ring-2 ring-primary/30" : "border-border"}`}
    >
      <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
        <h3
          id={`perfil-${id}-titulo`}
          className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground"
        >
          <span className="shrink-0 text-text-secondary">{icon}</span>
          <span className="truncate">{title}</span>
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
});

/* ------------------------------------------------------------------ */
/* Faixa de resumo                                                      */
/* ------------------------------------------------------------------ */

export type SummaryItem = {
  key: string;
  icon: ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "warn" | "danger";
  onClick: () => void;
};

/** Leitura imediata do membro. Cada item é só ATALHO pro lugar onde o dado
 * é aprofundado (nunca repete o bloco inteiro lá embaixo). */
export function ProfileSummary({ items }: { items: SummaryItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {items.map((i) => (
        <button
          key={i.key}
          type="button"
          onClick={i.onClick}
          aria-label={`${i.label}: ${i.value}. Ir para a seção`}
          className="min-w-0 cursor-pointer rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="flex items-center gap-1.5 truncate text-[10px] font-medium uppercase tracking-wide text-text-secondary">
            <span className="shrink-0">{i.icon}</span>
            <span className="truncate">{i.label}</span>
          </p>
          <p
            className={`mt-0.5 truncate text-lg font-semibold tabular-nums ${i.tone === "danger" ? "text-destructive" : i.tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}
          >
            {i.value}
          </p>
          {i.hint && <p className="truncate text-[10px] text-text-secondary">{i.hint}</p>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dados cadastrais (recolhido, no fim)                                 */
/* ------------------------------------------------------------------ */

export function MemberInfoSection({
  member,
  viewer,
  startOfDayToday,
}: {
  member: Member;
  viewer: { isAdmin: boolean; meId: string | null };
  startOfDayToday: string | null;
}) {
  const [open, setOpen] = useState(false);
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
    <section className="rounded-xl border border-border bg-card px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-sm font-semibold text-foreground"
      >
        Informações do membro
        <ChevronDown
          className={`h-4 w-4 text-text-secondary transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open &&
        (rows.length === 0 ? (
          <p className="mt-3 text-xs text-text-secondary">
            Sem informações liberadas para visualização.
          </p>
        ) : (
          <dl className="mt-3 divide-y divide-border/60 rounded-lg border border-border">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-3 px-3 py-2">
                <dt className="shrink-0 text-xs text-text-secondary">{r.label}</dt>
                <dd className="min-w-0 break-words text-right text-xs font-medium text-foreground">
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Atividade (tarefas)                                                  */
/* ------------------------------------------------------------------ */

/** Linha de tarefa — lista enxuta (nome, contexto, prioridade, status,
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

const TASK_GROUP_LIMIT = 4;

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
  const { visible, toggle } = useLimited(tasks, TASK_GROUP_LIMIT);
  if (tasks.length === 0) return null;
  return (
    <div>
      <SubTitle count={tasks.length} tone={tone}>
        {title}
      </SubTitle>
      <div className="rounded-lg border border-border p-1">
        {visible.map((t) => (
          <TaskRow key={t.id} task={t} onOpen={onOpen} />
        ))}
        {toggle}
      </div>
    </div>
  );
}

export function ProfileActivity({
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
        .slice(0, 12),
    };
  }, [tasks]);

  if (atrasadas.length + proximas.length + abertas.length + concluidas.length === 0) {
    return <EmptyLine>Nenhuma tarefa vinculada a esta pessoa.</EmptyLine>;
  }
  return (
    <div className="space-y-4">
      <TaskGroup title="Atrasadas" tasks={atrasadas} onOpen={onOpenTask} tone="danger" />
      <TaskGroup title="Próximas do vencimento" tasks={proximas} onOpen={onOpenTask} />
      <TaskGroup title="Abertas" tasks={abertas} onOpen={onOpenTask} />
      <TaskGroup title="Concluídas recentemente" tasks={concluidas} onOpen={onOpenTask} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Jornada                                                              */
/* ------------------------------------------------------------------ */

const JOURNEY_LIMIT = 5;

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
  const { visible, toggle } = useLimited(days, JOURNEY_LIMIT);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
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
            {visible.map((d) => (
              <div
                key={d.day}
                className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] items-center gap-2 px-3 py-2 text-xs tabular-nums sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]"
              >
                <span className="truncate font-medium capitalize text-foreground">
                  {dayLabel(d.day)}
                </span>
                <span className="text-text-secondary">{hhmm(d.firstStart)}</span>
                <span className="truncate text-text-secondary">
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
          {toggle && <div className="border-t border-border/60 p-1">{toggle}</div>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desempenho (+ resumo do Score)                                       */
/* ------------------------------------------------------------------ */

function delta(cur: number, prev: number): string {
  const d = cur - prev;
  if (d === 0) return `igual ao período anterior (${prev})`;
  return `${d > 0 ? "+" : "−"}${Math.abs(Math.round(d * 10) / 10)} vs período anterior`;
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string | null;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-text-secondary">{hint}</p>}
    </div>
  );
}

/** Score resumido — a composição completa vive no `ScoreOperacionalPanel`
 * (mesma fórmula da V1), exibida sob demanda em "Ver composição do Score". */
export function ProfileScoreSummary({
  score,
  trendLabel,
  expanded,
  onToggle,
}: {
  score: ScoreOperacionalV2;
  trendLabel: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tone =
    score.score == null || score.dataState !== "definitivo"
      ? "text-text-secondary"
      : (SCORE_CLASSIFICACAO_TONE[score.classificacao ?? "Sem avaliação"] ?? "text-foreground");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
          Score operacional
        </p>
        {score.score == null || score.dataState === "sem_dados" ? (
          <p className="mt-0.5 text-sm text-text-secondary">Sem dados suficientes no período</p>
        ) : (
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className={`text-xl font-semibold tabular-nums ${tone}`}>
              {score.score}
              <span className="text-xs font-normal text-text-secondary">/100</span>
            </span>
            {score.dataState === "provisorio" ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">Provisório</span>
            ) : (
              score.classificacao && (
                <span className="text-xs text-text-secondary">{score.classificacao}</span>
              )
            )}
            <span className="text-[11px] text-text-secondary">
              {SAMPLE_CONFIDENCE_LABEL[score.confidence]}
            </span>
            {trendLabel && <span className="text-[11px] text-text-secondary">{trendLabel}</span>}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary hover:text-foreground"
      >
        {expanded ? "Ocultar composição do Score" : "Ver composição do Score"}
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
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
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <MetricCard
        label="Tarefas concluídas"
        value={completed}
        hint={delta(completed, previousCompleted)}
      />
      <MetricCard
        label="No prazo"
        value={pct(agg.pctNoPrazo)}
        hint={
          completed > 0
            ? `${completed} concluída${completed === 1 ? "" : "s"} na amostra`
            : "Sem dados suficientes"
        }
      />
      <MetricCard label="Atrasadas agora" value={overdueNow} />
      <MetricCard
        label="Replanejamentos"
        value={agg.qtdReplanejamentos}
        hint={delta(agg.qtdReplanejamentos, previousAgg.qtdReplanejamentos)}
      />
      <MetricCard
        label="Reuniões"
        value={meetingsExpected === 0 ? "—" : `${meetingsAttended}/${meetingsExpected}`}
        hint={meetingsExpected === 0 ? "Nenhuma esperada no período" : "participadas / esperadas"}
      />
      <MetricCard label="Horas trabalhadas" value={formatHours(totalSeconds)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Histórico                                                            */
/* ------------------------------------------------------------------ */

type HistoryItem = { at: string; label: string; detail?: string };
const HISTORY_LIMIT = 6;

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
    return out.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 40);
  }, [completions, deadlineChanges, attendance, meetingsById]);
  const { visible, toggle } = useLimited(items, HISTORY_LIMIT);
  const { visible: visibleProjects, toggle: projectsToggle } = useLimited(projectNames, 8);

  return (
    <div className="space-y-4">
      <div>
        <SubTitle>Campanhas e projetos</SubTitle>
        {projectNames.length === 0 ? (
          <EmptyLine>Nenhum projeto ou campanha vinculado.</EmptyLine>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {visibleProjects.map((n) => (
                <span
                  key={n}
                  className="max-w-[220px] truncate rounded-full border border-border px-2.5 py-1 text-[11px] text-text-secondary"
                >
                  {n}
                </span>
              ))}
            </div>
            {projectsToggle}
          </>
        )}
      </div>
      <div>
        <SubTitle>Atividade no período</SubTitle>
        {items.length === 0 ? (
          <EmptyLine>Sem atividade registrada neste período.</EmptyLine>
        ) : (
          <div className="rounded-lg border border-border">
            <ul className="divide-y divide-border/60">
              {visible.map((i, idx) => (
                <li key={`${i.at}-${idx}`} className="flex items-start gap-3 px-3 py-2">
                  <span className="w-12 shrink-0 pt-0.5 text-[11px] tabular-nums text-text-secondary">
                    {todayIsoInBrasilia(new Date(i.at)).split("-").reverse().slice(0, 2).join("/")}
                  </span>
                  <p className="min-w-0 flex-1 break-words text-xs text-foreground">
                    {i.label}
                    {i.detail && <span className="text-text-secondary"> · {i.detail}</span>}
                  </p>
                </li>
              ))}
            </ul>
            {toggle && <div className="border-t border-border/60 p-1">{toggle}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
