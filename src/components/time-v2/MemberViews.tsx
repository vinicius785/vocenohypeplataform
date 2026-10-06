import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { WorkTaskRow } from "@/components/inicio/WorkTaskRow";
import {
  TaskDeadlineBadge,
  TaskStatusIcon,
  deadlineViewFromDashTask,
  isTaskStatus,
} from "@/components/tasks/task-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { EntregaHistorico } from "@/components/influenciadores/EntregaV2";
import type { HistoricoEvento } from "@/lib/entrega-historico";
import { formatResponseDuration } from "@/lib/member-response-time";
import {
  SAMPLE_CONFIDENCE_LABEL,
  SCORE_CLASSIFICACAO_TONE,
  type AggregateIndicators,
  type ScoreOperacionalV2,
} from "@/lib/performance-engine";
import { INSIGHT_THRESHOLDS } from "@/lib/insights-engine";
import { OPEN_STATUSES } from "@/lib/score";
import { BUCKET_ORDER, type DashTask } from "@/lib/task-aggregation";
import type { TaskStatus } from "@/lib/task-status";
import { cn } from "@/lib/utils";
import { LoadBadge } from "./LoadBadge";
import {
  formatDays,
  formatSeries,
  MEMBER_INSIGHT_LABEL,
  type CycleTimeStats,
  type LoadAssessment,
  type MemberInsight,
} from "./member-metrics";
import {
  overviewHighlights,
  scoreView,
  MIN_SCORE_TASKS,
  type BlockedTaskRow,
  type CommunicationReading,
} from "./member-v2";
import type { MemberTaskStats } from "./time-v2-utils";
import type { ResponseTimeState } from "./use-response-time";
import { ProfileJourney } from "./profile-sections";

/** Visões do detalhe do membro (V2). Só apresentação: dados e regras vêm de `MemberProfileV2`. */

export const VIEW_IDS = [
  "visao",
  "desempenho",
  "tarefas",
  "jornada",
  "comunicacao",
  "dependencias",
  "historico",
] as const;
export type ViewId = (typeof VIEW_IDS)[number];
export const VIEW_LABEL: Record<ViewId, string> = {
  visao: "Visão geral",
  desempenho: "Desempenho",
  tarefas: "Tarefas",
  jornada: "Jornada",
  comunicacao: "Comunicação",
  dependencias: "Dependências",
  historico: "Histórico",
};

/* ---------------- peças ---------------- */

export function Bloco({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function VerMais({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-0.5 text-xs font-medium text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {children}
      <ChevronRight className="h-3 w-3" />
    </button>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-secondary">{children}</p>;
}

const INSIGHT_TONE: Record<MemberInsight["kind"], string> = {
  atencao: "text-warning-soft-foreground",
  tendencia: "text-text-secondary",
  operacao: "text-text-secondary",
  dependencia: "text-text-secondary",
};

/* ---------------- tarefas (mesma linha do Início) ---------------- */

export type TaskCtx = {
  /** O membro aberto é quem está logado: só então o status (e o cronômetro) pode ser mudado aqui. */
  isSelf: boolean;
  context: (t: DashTask) => string;
  timerStartedAt: (t: DashTask) => string | null;
  onOpen: (t: DashTask) => void;
  onStatus: (t: DashTask, next: TaskStatus) => void;
  onTimerStart: (t: DashTask) => void;
  onTimerStop: () => void;
};

export function TaskLines({ tasks, ctx }: { tasks: DashTask[]; ctx: TaskCtx }) {
  return (
    <div className="-mx-4 divide-y divide-border/40">
      {tasks.map((t) => (
        <WorkTaskRow
          key={t.id}
          task={t}
          context={ctx.context(t)}
          timerStartedAt={ctx.isSelf ? ctx.timerStartedAt(t) : null}
          readOnlyStatus={!ctx.isSelf}
          hideTimer={!ctx.isSelf}
          onOpen={() => ctx.onOpen(t)}
          onStatus={(next) => ctx.onStatus(t, next)}
          onTimerStart={() => ctx.onTimerStart(t)}
          onTimerStop={ctx.onTimerStop}
        />
      ))}
    </div>
  );
}

function useExpand<T>(items: T[], limit: number) {
  const [open, setOpen] = useState(false);
  return {
    visible: open ? items : items.slice(0, limit),
    toggle:
      items.length > limit ? (
        <VerMais onClick={() => setOpen((v) => !v)}>
          {open ? "Ver menos" : `Ver mais (${items.length - limit})`}
        </VerMais>
      ) : null,
  };
}

export function splitTasks(tasks: DashTask[]) {
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
}

/* ---------------- Visão geral ---------------- */

export function OverviewView({
  insights,
  tasks,
  ctx,
  journey,
  communication,
  goTo,
}: {
  insights: MemberInsight[];
  tasks: DashTask[];
  ctx: TaskCtx;
  journey: { statusLabel: string; hours: string; days: number };
  communication: { state: ResponseTimeState; reading: CommunicationReading };
  goTo: (v: ViewId) => void;
}) {
  const highlights = overviewHighlights(insights);
  const { atrasadas, proximas, abertas } = useMemo(() => splitTasks(tasks), [tasks]);
  const work = [...atrasadas, ...proximas, ...abertas].slice(0, 5);
  const r = communication.reading;
  return (
    <div className="space-y-8">
      <Bloco title="Atenção">
        {highlights.length === 0 ? (
          <div className="rounded-lg bg-muted/30 px-4 py-3">
            <p className="text-sm font-medium text-foreground">Tudo sob controle</p>
            <p className="text-xs text-text-secondary">Nenhum ponto de atenção no período.</p>
          </div>
        ) : (
          <ul className="space-y-2.5 rounded-lg bg-muted/30 px-4 py-3">
            {highlights.map((i, idx) => (
              <li key={`${i.kind}-${idx}`} className="flex items-baseline gap-3">
                <span
                  className={cn(
                    "w-[6.75rem] shrink-0 text-[11px] font-semibold uppercase tracking-wide",
                    INSIGHT_TONE[i.kind],
                  )}
                >
                  {MEMBER_INSIGHT_LABEL[i.kind]}
                </span>
                <span className="min-w-0 text-sm text-foreground">{i.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      <Bloco
        title="Meu trabalho"
        action={<VerMais onClick={() => goTo("tarefas")}>Ver tarefas</VerMais>}
      >
        {work.length === 0 ? (
          <Vazio>Nenhuma tarefa aberta.</Vazio>
        ) : (
          <TaskLines tasks={work} ctx={ctx} />
        )}
      </Bloco>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10">
        <Bloco title="Jornada" action={<VerMais onClick={() => goTo("jornada")}>Ver</VerMais>}>
          <dl className="space-y-1 text-sm">
            <Linha label="Status atual" value={journey.statusLabel} />
            <Linha label="Horas no período" value={journey.hours} />
            <Linha label="Dias com registro" value={journey.days} />
          </dl>
        </Bloco>
        <Bloco
          title="Comunicação"
          action={<VerMais onClick={() => goTo("comunicacao")}>Ver</VerMais>}
        >
          {communication.state === "loading" ? (
            <Skeleton className="h-16 rounded-md" />
          ) : communication.state === "error" ? (
            <Vazio>Indisponível agora.</Vazio>
          ) : r.state === "sem_dados" ? (
            <Vazio>Ainda não há dados suficientes.</Vazio>
          ) : (
            <div className="space-y-1">
              <dl className="space-y-1 text-sm">
                <Linha
                  label="Tempo médio de resposta"
                  value={formatResponseDuration(r.averageSeconds)}
                />
                {r.slowest && (
                  <Linha
                    label="Demora mais em"
                    value={`${r.slowest.label} · ${formatResponseDuration(r.slowest.seconds)}`}
                  />
                )}
              </dl>
              {r.recommendation && (
                <p className="text-xs leading-snug text-text-secondary">{r.recommendation}</p>
              )}
            </div>
          )}
        </Bloco>
      </div>
    </div>
  );
}

function Linha({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-right font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

/* ---------------- Desempenho ---------------- */

const fmtAvg = (v: number | null) => (v == null ? "—" : v.toFixed(1).replace(".", ","));
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
function delta(cur: number, prev: number): string {
  const d = cur - prev;
  if (d === 0) return `igual ao período anterior (${prev})`;
  return `${d > 0 ? "+" : "−"}${Math.abs(Math.round(d * 10) / 10)} vs período anterior`;
}

export type ReplanSummary = {
  tasksReplanned: number;
  taskBase: number;
  before: number;
  after: number;
};

function Indicador({
  label,
  value,
  detail,
  trend,
}: {
  label: string;
  value: string;
  detail?: string;
  trend?: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-text-secondary">{detail}</p>}
      {trend && <p className="text-xs tabular-nums text-text-secondary">{trend}</p>}
    </div>
  );
}

export function PerformanceView({
  score,
  trendLabel,
  panel,
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
  meetings,
  deliveries,
}: {
  score: ScoreOperacionalV2;
  trendLabel: string | null;
  panel: ReactNode;
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
  meetings: { attended: number; expected: number };
  deliveries?: {
    thisWeek: number;
    monthlyAvg: number | null;
    quarterlyAvg: number | null;
    yearlyAvg: number | null;
  } | null;
}) {
  const [composition, setComposition] = useState(false);
  const view = scoreView(score);
  const series = [
    previous2Completed > 0 ? aggPrevious2.pctNoPrazo : null,
    previousCompleted > 0 ? aggPrevious.pctNoPrazo : null,
    completed > 0 ? agg.pctNoPrazo : null,
  ];
  const hasTrend = series.filter((v) => v != null).length >= 2;
  const smallSample = completed > 0 && completed < INSIGHT_THRESHOLDS.amostraMinima;
  const replanPct =
    replan.taskBase > 0 ? Math.round((100 * replan.tasksReplanned) / replan.taskBase) : null;
  const tone =
    SCORE_CLASSIFICACAO_TONE[score.classificacao ?? "Sem avaliação"] ?? "text-foreground";
  return (
    <div className="space-y-8">
      <Bloco
        title="Score operacional"
        action={
          view.mode !== "sem_dados" ? (
            <VerMais onClick={() => setComposition((v) => !v)}>
              {composition ? "Ocultar composição" : "Ver composição"}
            </VerMais>
          ) : undefined
        }
      >
        <div className="rounded-lg bg-muted/30 px-4 py-3">
          {view.mode === "ok" ? (
            <>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className={cn("text-3xl font-semibold tabular-nums", tone)}>
                  {view.score}
                </span>
                <span className="text-sm text-text-secondary">/100</span>
                {score.classificacao && (
                  <span className="text-sm text-text-secondary">· {score.classificacao}</span>
                )}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {SAMPLE_CONFIDENCE_LABEL[score.confidence]} · {view.amostra} tarefas na base
                {trendLabel ? ` · ${trendLabel}` : ""}
              </p>
            </>
          ) : view.mode === "insuficiente" ? (
            <>
              <p className="text-sm font-medium text-foreground">Dados insuficientes para score</p>
              <p className="mt-0.5 text-xs text-text-secondary">
                {view.amostra} {view.amostra === 1 ? "tarefa" : "tarefas"} na base; o score precisa
                de pelo menos {MIN_SCORE_TASKS}.
              </p>
            </>
          ) : (
            <p className="text-sm text-text-secondary">Sem dados suficientes no período.</p>
          )}
          <p className="mt-2 text-[11px] text-text-secondary">
            Mede comportamento operacional do período, não a qualidade da pessoa.
          </p>
        </div>
        {composition && panel}
      </Bloco>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
        <Indicador
          label="Conclusão no prazo"
          value={pct(agg.pctNoPrazo)}
          detail={
            completed === 0
              ? "Nenhuma conclusão no período"
              : `${completed - lateCount} no prazo · ${lateCount} com atraso${overdueNow > 0 ? ` · ${overdueNow} atrasada${overdueNow === 1 ? "" : "s"} agora` : ""}`
          }
          trend={
            smallSample
              ? `Amostra pequena (${completed})`
              : hasTrend
                ? `Tendência: ${formatSeries(series, (v) => `${Math.round(v)}%`)}`
                : periodInProgress && completed > 0
                  ? "Período em andamento"
                  : null
          }
        />
        <Indicador
          label="Replanejamento"
          value={replanPct == null ? "—" : `${replanPct}%`}
          detail={
            replan.taskBase === 0
              ? "Sem base de tarefas no período"
              : `${replan.tasksReplanned} de ${replan.taskBase} tarefas`
          }
          trend={delta(agg.qtdReplanejamentos, aggPrevious.qtdReplanejamentos)}
        />
        <Indicador
          label="Tempo médio de ciclo"
          value={formatDays(cycle.cycleDays)}
          detail={
            cycle.completedInRange === 0
              ? "Nenhuma tarefa concluída no período"
              : "Em andamento → concluída"
          }
          trend={cycle.leadSample > 0 ? `Desde a criação: ${formatDays(cycle.leadDays)}` : null}
        />
      </div>
      <p className="text-xs tabular-nums text-text-secondary">
        Concluídas no período: <b className="text-foreground">{completed}</b> (
        {delta(completed, previousCompleted)}) · Reuniões:{" "}
        <b className="text-foreground">
          {meetings.expected === 0
            ? "nenhuma esperada"
            : `${meetings.attended}/${meetings.expected}`}
        </b>
      </p>
      {deliveries && (
        <p className="text-xs tabular-nums text-text-secondary">
          Entregas por semana: esta <b className="text-foreground">{deliveries.thisWeek}</b> · média
          mensal <b className="text-foreground">{fmtAvg(deliveries.monthlyAvg)}</b> · trimestral{" "}
          <b className="text-foreground">{fmtAvg(deliveries.quarterlyAvg)}</b> · anual{" "}
          <b className="text-foreground">{fmtAvg(deliveries.yearlyAvg)}</b>
        </p>
      )}
    </div>
  );
}

/* ---------------- Tarefas ---------------- */

export function TasksView({
  tasks,
  stats,
  load,
  ctx,
}: {
  tasks: DashTask[];
  stats: MemberTaskStats;
  load: LoadAssessment;
  ctx: TaskCtx;
}) {
  const { atrasadas, proximas, abertas, concluidas } = useMemo(() => splitTasks(tasks), [tasks]);
  const urgentes = [...atrasadas, ...proximas];
  const u = useExpand(urgentes, 6);
  const o = useExpand(abertas, 5);
  const c = useExpand(concluidas, 5);
  if (urgentes.length + abertas.length + concluidas.length === 0)
    return <Vazio>Nenhuma tarefa vinculada a esta pessoa.</Vazio>;
  return (
    <div className="space-y-8">
      <Bloco title="Carga atual">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-sm tabular-nums text-foreground">
            {stats.abertas} {stats.abertas === 1 ? "aberta" : "abertas"} · {stats.vencemHoje}{" "}
            {stats.vencemHoje === 1 ? "vence" : "vencem"} hoje · {stats.atrasadas}{" "}
            {stats.atrasadas === 1 ? "atrasada" : "atrasadas"} · {stats.emAndamento} em andamento
          </p>
          <LoadBadge load={load} withTooltip={false} />
        </div>
        {load.reasons.length > 0 && (
          <p className="text-xs text-text-secondary">{load.reasons.join(" · ")}</p>
        )}
      </Bloco>
      {urgentes.length > 0 && (
        <Bloco title="Próximas do vencimento">
          <TaskLines tasks={u.visible} ctx={ctx} />
          {u.toggle}
        </Bloco>
      )}
      {abertas.length > 0 && (
        <Bloco title="Sem prazo próximo">
          <TaskLines tasks={o.visible} ctx={ctx} />
          {o.toggle}
        </Bloco>
      )}
      {concluidas.length > 0 && (
        <Bloco title="Concluídas recentemente">
          <TaskLines tasks={c.visible} ctx={ctx} />
          {c.toggle}
        </Bloco>
      )}
    </div>
  );
}

/* ---------------- Jornada ---------------- */

export { ProfileJourney as JourneyView };

/* ---------------- Dependências ---------------- */

export function DependenciesView({
  rows,
  categoryLabel,
  onOpenTask,
}: {
  rows: BlockedTaskRow[];
  categoryLabel: (t: DashTask) => string;
  onOpenTask: (t: DashTask) => void;
}) {
  const e = useExpand(rows, 6);
  if (rows.length === 0) return <Vazio>Nenhuma tarefa bloqueada agora.</Vazio>;
  return (
    <div className="space-y-3">
      <ul className="-mx-2 divide-y divide-border/40">
        {e.visible.map(({ task, blockers }) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onOpenTask(task)}
              className="flex w-full min-w-0 items-start gap-3 rounded-md px-2 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="mt-0.5 shrink-0">
                <TaskStatusIcon
                  status={isTaskStatus(task.status) ? task.status : "Bloqueada"}
                  className="h-4 w-4"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {task.title}
                </span>
                {blockers.length > 0 ? (
                  blockers.map((b) => (
                    <span key={b.id} className="block truncate text-xs text-text-secondary">
                      Bloqueada por <span className="text-foreground">{b.title}</span>
                      {b.assignees.length > 0 ? ` · ${b.assignees.join(", ")}` : ""}
                      {b.dueDate
                        ? ` · ${b.dueDate.split("-").reverse().slice(0, 2).join("/")}`
                        : ""}
                    </span>
                  ))
                ) : (
                  <span className="block truncate text-xs text-text-secondary">
                    {categoryLabel(task)} · {task.projectName}
                  </span>
                )}
              </span>
              <TaskDeadlineBadge view={deadlineViewFromDashTask(task)} size="xs" />
            </button>
          </li>
        ))}
      </ul>
      {e.toggle}
    </div>
  );
}

/* ---------------- Histórico ---------------- */

export function HistoryView({
  events,
  projects,
}: {
  events: HistoricoEvento[];
  projects: string[];
}) {
  const [project, setProject] = useState("");
  const [all, setAll] = useState(false);
  const filtered = project ? events.filter((e) => e.entrega === project) : events;
  return (
    <div className="space-y-4">
      {projects.length > 1 && (
        <select
          aria-label="Filtrar por projeto"
          value={project}
          onChange={(e) => {
            setProject(e.target.value);
            setAll(false);
          }}
          className="h-8 max-w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
        >
          <option value="">Todos os projetos</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      )}
      {filtered.length === 0 ? (
        <Vazio>Sem atividade registrada neste período.</Vazio>
      ) : (
        <EntregaHistorico
          eventos={filtered}
          showAll={all}
          onToggleAll={() => setAll((v) => !v)}
          feedbackAberto={null}
          onToggleFeedback={() => {}}
          limit={8}
          titulo="Histórico"
        />
      )}
    </div>
  );
}
