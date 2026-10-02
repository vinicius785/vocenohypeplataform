import { forwardRef, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { MiniStat } from "@/components/team/member-ui";
import { TASK_BLOCK_CATEGORY_LABEL } from "@/lib/task-blocks-rules";
import {
  TaskDeadlineBadge,
  TaskPriorityFlag,
  TaskStatusBadge,
  deadlineViewFromDashTask,
} from "@/components/tasks/task-ui";
import { OPEN_STATUSES } from "@/lib/score";
import { BUCKET_ORDER, type DashTask } from "@/lib/task-aggregation";
import {
  COMPROMISSOS_MAX_PONTOS,
  ENTREGA_MAX_PONTOS,
  PREVISIBILIDADE_MAX_PONTOS,
  SAMPLE_CONFIDENCE_LABEL,
  SCORE_CLASSIFICACAO_TONE,
  type AggregateIndicators,
  type ScoreOperacionalV2,
} from "@/lib/performance-engine";
import { INSIGHT_THRESHOLDS } from "@/lib/insights-engine";
import type { TimeEntry } from "@/lib/time-entries";
import type { Meeting } from "@/lib/reunioes-store";
import type {
  ProfileAttendance,
  ProfileCompletion,
  ProfileDeadlineChange,
} from "@/components/team/ScoreOperacionalPanel";
import type { Member, TimeField } from "@/components/TimeSection";
import { todayIsoInBrasilia } from "@/lib/timezone";
import { LoadBadge } from "./LoadBadge";
import {
  DEPENDENCY_GROUP_LABEL,
  DEPENDENCY_GROUPS,
  dependencyGroupOf,
  formatDays,
  formatSeries,
  MEMBER_INSIGHT_LABEL,
  type CycleTimeStats,
  type DependencySummary,
  type LoadAssessment,
  type MemberInsight,
} from "./member-metrics";
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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
      {task.priority && task.priority !== "Normal" && (
        <TaskPriorityFlag priority={task.priority} size="xs" className="hidden sm:inline-flex" />
      )}
      <TaskStatusBadge status={task.status} size="xs" className="hidden md:inline-flex" />
      <TaskDeadlineBadge
        view={deadlineViewFromDashTask(task)}
        size="xs"
        className="w-28 justify-end"
      />
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

/** "Carga atual" — linha objetiva no topo de Tarefas: números + nível +
 * motivo por extenso (nunca um rótulo solto). */
export function ProfileWorkload({ stats, load }: { stats: MemberTaskStats; load: LoadAssessment }) {
  const parts = [
    `${stats.abertas} ${stats.abertas === 1 ? "aberta" : "abertas"}`,
    `${stats.vencemHoje} ${stats.vencemHoje === 1 ? "vence" : "vencem"} hoje`,
    `${stats.atrasadas} ${stats.atrasadas === 1 ? "atrasada" : "atrasadas"}`,
    `${stats.emAndamento} em andamento`,
  ];
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          Carga atual
        </span>
        <LoadBadge load={load} withTooltip={false} />
        <span className="min-w-0 text-xs tabular-nums text-foreground">{parts.join(" · ")}</span>
      </div>
      <p className="mt-1 text-[11px] text-text-secondary">{load.reasons.join(" · ")}</p>
    </div>
  );
}

export function ProfileActivity({
  tasks,
  onOpenTask,
  header,
}: {
  tasks: DashTask[];
  onOpenTask: (t: DashTask) => void;
  header?: ReactNode;
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
    return (
      <div className="space-y-4">
        {header}
        <EmptyLine>Nenhuma tarefa vinculada a esta pessoa.</EmptyLine>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {header}
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

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

/** Bloco de métrica do Desempenho — rótulo, valor, detalhe e (opcional)
 * tendência/nota. Sem card dentro de card: só uma moldura leve. */
function MetricBlock({
  label,
  value,
  detail,
  trend,
  note,
}: {
  label: string;
  value: string | number;
  detail?: ReactNode;
  trend?: string | null;
  note?: string | null;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
      {detail && <p className="mt-0.5 text-[11px] text-text-secondary">{detail}</p>}
      {trend && (
        <p className="mt-1 truncate text-[11px] tabular-nums text-text-secondary" title={trend}>
          {trend}
        </p>
      )}
      {note && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{note}</p>}
    </div>
  );
}

/** Score resumido — a composição completa vive no `ScoreOperacionalPanel`
 * (mesma fórmula), exibida sob demanda em "Ver composição do Score". As 3
 * dimensões aparecem já aqui: Previsibilidade é a "confiabilidade de
 * prazo" da plataforma (cumprimento + replanejamentos), reaproveitada em
 * vez de uma métrica paralela. */
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
  const dim = (v: number | null, max: number) => (v == null ? "—" : `${v}/${max}`);
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Provisório — amostra ou período ainda em andamento
                </span>
              ) : (
                score.classificacao && (
                  <span className="text-xs text-text-secondary">{score.classificacao}</span>
                )
              )}
              <span className="text-[11px] text-text-secondary">
                {SAMPLE_CONFIDENCE_LABEL[score.confidence]} · {score.amostra}{" "}
                {score.amostra === 1 ? "tarefa" : "tarefas"} na base
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
      {score.dataState !== "sem_dados" && (
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-text-secondary">
          <span>Entrega {dim(score.entregaPontos, ENTREGA_MAX_PONTOS)}</span>
          <span>
            Previsibilidade {dim(score.previsibilidadePontos, PREVISIBILIDADE_MAX_PONTOS)}
          </span>
          <span>
            Compromissos{" "}
            {score.compromissosAplicavel
              ? dim(score.compromissosPontos, COMPROMISSOS_MAX_PONTOS)
              : "não aplicável"}
          </span>
        </p>
      )}
      <p className="mt-1 text-[10px] text-text-secondary">
        Indicador de gestão do período, não uma nota da pessoa. Não compara membros.
      </p>
    </div>
  );
}

export type ReplanSummary = {
  /** Tarefas distintas com prazo alterado no período. */
  tasksReplanned: number;
  /** Base de tarefas do período (mesma base do Score). */
  taskBase: number;
  /** Alterações feitas com antecedência (antecipado/próximo do prazo). */
  before: number;
  /** Alterações no dia ou após o vencimento. */
  after: number;
};

export function ProfilePerformance({
  agg,
  aggPrevious,
  aggPrevious2,
  completed,
  lateCount,
  previousCompleted,
  previous2Completed,
  overdueNow,
  replan,
  cycle,
  periodInProgress,
  meetingsAttended,
  meetingsExpected,
  totalSeconds,
}: {
  agg: AggregateIndicators;
  aggPrevious: AggregateIndicators;
  aggPrevious2: AggregateIndicators;
  completed: number;
  lateCount: number;
  previousCompleted: number;
  previous2Completed: number;
  overdueNow: number;
  replan: ReplanSummary;
  cycle: CycleTimeStats;
  periodInProgress: boolean;
  meetingsAttended: number;
  meetingsExpected: number;
  totalSeconds: number;
}) {
  const smallSample = completed > 0 && completed < INSIGHT_THRESHOLDS.amostraMinima;
  const series = [
    previous2Completed > 0 ? aggPrevious2.pctNoPrazo : null,
    previousCompleted > 0 ? aggPrevious.pctNoPrazo : null,
    completed > 0 ? agg.pctNoPrazo : null,
  ];
  const hasTrend = series.filter((v) => v != null).length >= 2;
  const replanPct =
    replan.taskBase > 0 ? Math.round((100 * replan.tasksReplanned) / replan.taskBase) : null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <MetricBlock
          label="Conclusão no prazo"
          value={pct(agg.pctNoPrazo)}
          detail={
            completed === 0
              ? "Nenhuma conclusão no período"
              : `${completed - lateCount} no prazo · ${lateCount} com atraso · ${overdueNow} ${overdueNow === 1 ? "atrasada" : "atrasadas"} agora`
          }
          trend={hasTrend ? `Tendência: ${formatSeries(series, (v) => `${Math.round(v)}%`)}` : null}
          note={
            smallSample
              ? `Amostra pequena (${completed} ${completed === 1 ? "conclusão" : "conclusões"})`
              : periodInProgress && completed > 0
                ? "Período ainda em andamento"
                : null
          }
        />
        <MetricBlock
          label="Replanejamento"
          value={replanPct == null ? "—" : `${replanPct}%`}
          detail={
            replan.taskBase === 0
              ? "Sem base de tarefas no período"
              : `${replan.tasksReplanned} de ${replan.taskBase} ${replan.taskBase === 1 ? "tarefa" : "tarefas"} · ${replan.before} antes do vencimento · ${replan.after} no dia ou depois`
          }
          trend={delta(agg.qtdReplanejamentos, aggPrevious.qtdReplanejamentos)}
        />
        <MetricBlock
          label="Tempo médio de ciclo"
          value={formatDays(cycle.cycleDays)}
          detail={
            cycle.completedInRange === 0
              ? "Nenhuma tarefa concluída no período"
              : `Em andamento → concluída · ${cycle.cycleSample} de ${cycle.completedInRange} com início registrado`
          }
          trend={cycle.leadSample > 0 ? `Desde a criação: ${formatDays(cycle.leadDays)}` : null}
        />
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] tabular-nums text-text-secondary">
        <span>
          Concluídas: <b className="font-semibold text-foreground">{completed}</b> (
          {delta(completed, previousCompleted)})
        </span>
        <span>
          Reuniões:{" "}
          <b className="font-semibold text-foreground">
            {meetingsExpected === 0
              ? "nenhuma esperada"
              : `${meetingsAttended}/${meetingsExpected}`}
          </b>
        </span>
        <span>
          Horas: <b className="font-semibold text-foreground">{formatHours(totalSeconds)}</b>
        </span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dependências                                                         */
/* ------------------------------------------------------------------ */

const DEPENDENCY_LIMIT = 5;

export function ProfileDependencies({
  summary,
  onOpenTask,
}: {
  summary: DependencySummary;
  onOpenTask: (t: DashTask) => void;
}) {
  const { visible, toggle } = useLimited(summary.tasks, DEPENDENCY_LIMIT);
  if (summary.total === 0) return <EmptyLine>Nenhuma tarefa bloqueada agora.</EmptyLine>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-foreground">
          {summary.total} {summary.total === 1 ? "tarefa bloqueada" : "tarefas bloqueadas"}
        </p>
        {DEPENDENCY_GROUPS.filter((g) => summary.byGroup[g] > 0).map((g) => (
          <span key={g} className="text-[11px] text-text-secondary">
            {DEPENDENCY_GROUP_LABEL[g]}:{" "}
            <b className="font-semibold text-foreground">{summary.byGroup[g]}</b>
          </span>
        ))}
      </div>
      <div className="rounded-lg border border-border p-1">
        {visible.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onOpenTask(t)}
            className="flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
              <p className="truncate text-xs text-text-secondary">
                {t.blockCategory
                  ? TASK_BLOCK_CATEGORY_LABEL[t.blockCategory]
                  : DEPENDENCY_GROUP_LABEL[dependencyGroupOf(t)]}{" "}
                · {t.projectName}
              </p>
            </div>
            <span className="shrink-0 text-right text-[11px] tabular-nums text-text-secondary">
              {t.blockedSince
                ? `desde ${todayIsoInBrasilia(new Date(t.blockedSince)).split("-").reverse().slice(0, 2).join("/")}`
                : "—"}
            </span>
          </button>
        ))}
        {toggle}
      </div>
      <p className="text-[11px] text-text-secondary">
        Bloqueio não é atraso de execução: tarefas aguardando cliente ou fornecedor ficam fora da
        penalidade de atraso do Score; os demais bloqueios continuam contando, só rotulados.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Insights do membro                                                   */
/* ------------------------------------------------------------------ */

const INSIGHT_TONE: Record<MemberInsight["kind"], string> = {
  atencao: "text-amber-600 dark:text-amber-400",
  tendencia: "text-text-secondary",
  operacao: "text-emerald-600 dark:text-emerald-400",
  dependencia: "text-text-secondary",
};

export function ProfileInsights({ insights }: { insights: MemberInsight[] }) {
  if (insights.length === 0) {
    return <EmptyLine>Nenhum insight relevante neste período.</EmptyLine>;
  }
  return (
    <ul className="divide-y divide-border/60 rounded-lg border border-border">
      {insights.map((i, idx) => (
        <li key={`${i.kind}-${idx}`} className="flex items-start gap-3 px-3 py-2">
          <span
            className={`w-20 shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-wide ${INSIGHT_TONE[i.kind]}`}
          >
            {MEMBER_INSIGHT_LABEL[i.kind]}
          </span>
          <p className="min-w-0 flex-1 break-words text-xs text-foreground">{i.text}</p>
        </li>
      ))}
    </ul>
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
