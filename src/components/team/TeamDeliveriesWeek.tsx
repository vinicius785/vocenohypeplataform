import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WeekdayBucket } from "@/lib/score";
import type { Insight } from "@/lib/insights-engine";
import type { DashTask, DashTaskFlat } from "@/lib/task-aggregation";
import type { Member } from "@/components/TimeSection";
import { avatarAccent, initialsOf } from "./member-ui";

const DRILLDOWN_PREVIEW_LIMIT = 8;

/** Linha da tabela de produtividade por membro — tudo já calculado por
 * quem chama (`TimeSection.tsx`), este componente só exibe/ordena. */
export type DeliveryMemberRow = {
  member: Member;
  thisWeek: number;
  monthlyAvg: number | null;
  quarterlyAvg: number | null;
  yearlyAvg: number | null;
  /** `thisWeek` vs. `monthlyAvg`, em % — `null` sem amostra suficiente. */
  trendPct: number | null;
  byWeekday: { label: string; count: number }[]; // Segunda..Sexta, só deste membro
  thisWeekTasks: DashTaskFlat[];
};

type SortKey = "thisWeek" | "monthlyAvg" | "quarterlyAvg" | "yearlyAvg" | "trendPct";

function formatCompletedAt(iso: string): string {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} às ${time}`;
}

function trendTone(pct: number | null): string {
  if (pct == null) return "text-text-secondary";
  if (pct > 5) return "text-emerald-600 dark:text-emerald-400";
  if (pct < -5) return "text-destructive";
  return "text-text-secondary";
}

function trendLabel(pct: number | null): string {
  if (pct == null) return "—";
  if (pct > 5) return `↑ ${Math.round(pct)}%`;
  if (pct < -5) return `↓ ${Math.abs(Math.round(pct))}%`;
  return "Estável";
}

function fmtAvg(v: number | null): string {
  return v == null ? "—" : v.toFixed(1).replace(".", ",");
}

/** Popup compartilhado "tarefas reais que compõem este número" — usado
 * tanto ao clicar numa barra do gráfico quanto no número "Esta semana" de
 * um membro (item 18 do pedido: auditoria das entregas). Nunca abre uma
 * cópia da tarefa — clique na linha chama `onOpenTask`, o mesmo usado no
 * resto da aba Time. */
function DeliveryTasksDialog({
  title,
  subtitle,
  tasks,
  onOpenChange,
  onOpenTask,
}: {
  title: string | null;
  subtitle: string;
  tasks: DashTaskFlat[];
  onOpenChange: (open: boolean) => void;
  onOpenTask: (t: DashTask) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? tasks : tasks.slice(0, DRILLDOWN_PREVIEW_LIMIT);

  return (
    <Dialog
      open={title !== null}
      onOpenChange={(open) => {
        if (!open) setShowAll(false);
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        {tasks.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-secondary">
            Não foi possível carregar os detalhes.
          </p>
        ) : (
          <>
            <div className="max-h-96 space-y-0.5 overflow-y-auto">
              {visible.map((t) => (
                <button
                  key={`${t.projectId}_${t.id}`}
                  type="button"
                  onClick={() => onOpenTask(t)}
                  className="flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-muted/60"
                >
                  <span className="truncate text-sm text-foreground">{t.title}</span>
                  <span className="truncate text-xs text-text-secondary">
                    {t.assignees.join(", ") || "Sem responsável"} · {t.projectName}
                  </span>
                  <span className="text-[11px] text-text-secondary">
                    Concluída {t.completedAt ? formatCompletedAt(t.completedAt) : "—"}
                  </span>
                </button>
              ))}
            </div>
            {!showAll && tasks.length > DRILLDOWN_PREVIEW_LIMIT && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full cursor-pointer rounded-md px-2 py-1.5 text-center text-xs font-medium text-foreground hover:bg-muted/60"
              >
                Ver todas
              </button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({
  row,
  insights,
  onOpenTasks,
  onOpenMember,
}: {
  row: DeliveryMemberRow;
  /** Insights de ATENÇÃO deste membro (os mesmos de "Insights do Time"). */
  insights: Insight[];
  onOpenTasks: () => void;
  onOpenMember: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { member } = row;
  const bestDay = row.byWeekday.reduce<{ label: string; count: number } | null>(
    (best, d) => (d.count > 0 && (!best || d.count > best.count) ? d : best),
    null,
  );
  const maxCount = Math.max(1, ...row.byWeekday.map((d) => d.count));
  const dailyAvg = row.byWeekday.length > 0 ? row.thisWeek / row.byWeekday.length : null;

  return (
    <div className="border-t border-border first:border-t-0">
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? `Recolher ${member.name}` : `Expandir ${member.name}`}
          aria-expanded={expanded}
          className="-ml-1.5 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
          />
        </button>

        <button
          type="button"
          onClick={onOpenMember}
          className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md text-left"
        >
          <Avatar className="h-7 w-7 shrink-0">
            {member.photo && <AvatarImage src={member.photo} alt={member.name} />}
            <AvatarFallback className={`text-xs font-semibold ${avatarAccent(member.id)}`}>
              {initialsOf(member.name, member.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground group-hover:underline">
              {member.name || "(sem nome)"}
            </p>
            {member.role && <p className="truncate text-xs text-text-secondary">{member.role}</p>}
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenTasks}
          disabled={row.thisWeek === 0}
          className="w-16 shrink-0 cursor-pointer text-right text-sm font-semibold tabular-nums text-foreground hover:underline disabled:cursor-default disabled:text-text-secondary disabled:no-underline"
        >
          {row.thisWeek}
        </button>
        <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-text-secondary md:inline">
          {fmtAvg(row.monthlyAvg)}
        </span>
        <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-text-secondary lg:inline">
          {fmtAvg(row.quarterlyAvg)}
        </span>
        <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-text-secondary lg:inline">
          {fmtAvg(row.yearlyAvg)}
        </span>
        <span className={`w-16 shrink-0 text-right text-xs font-medium ${trendTone(row.trendPct)}`}>
          {trendLabel(row.trendPct)}
        </span>
      </div>

      {/* Expansão inline, compacta: SÓ o que a linha não mostra — distribuição da semana, ritmo
       * (média diária e melhor dia) e, se existir, atenção. As médias ficam na linha. */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div className="overflow-hidden">
          <div
            className={`grid gap-x-10 gap-y-4 border-t border-border/60 bg-muted/20 px-4 py-3 ${
              insights.length > 0 ? "md:grid-cols-[1.6fr_1fr_1.3fr]" : "md:grid-cols-[1.6fr_1fr]"
            }`}
          >
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                Distribuição da semana
              </p>
              <ul className="mt-2 grid grid-cols-5 gap-2">
                {row.byWeekday.map((d) => (
                  <li key={d.label}>
                    <span className="block text-[11px] uppercase text-text-secondary">
                      {d.label.slice(0, 3)}
                    </span>
                    <span
                      className={`block text-base font-semibold tabular-nums leading-tight ${d.count === 0 ? "text-text-secondary/60" : "text-foreground"}`}
                    >
                      {d.count}
                    </span>
                    <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-foreground/45"
                        style={{
                          width: `${d.count > 0 ? Math.max(10, (d.count / maxCount) * 100) : 0}%`,
                        }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                Resumo da semana
              </p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-text-secondary">Média diária</dt>
                  <dd className="font-semibold tabular-nums text-foreground">{fmtAvg(dailyAvg)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-text-secondary">Melhor dia</dt>
                  <dd className="font-semibold text-foreground">
                    {bestDay ? `${bestDay.label.toLowerCase()} · ${bestDay.count}` : "—"}
                  </dd>
                </div>
              </dl>
            </div>

            {insights.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-warning-soft-foreground">
                  Atenção
                </p>
                <ul className="mt-2 space-y-1.5">
                  {insights.slice(0, 2).map((i) => (
                    <li key={`${i.ruleId}:${i.memberId}`} className="text-xs text-foreground">
                      {i.text}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={onOpenMember}
                  className="mt-1.5 cursor-pointer text-[11px] font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Ver {member.name.split(" ")[0]} →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`shrink-0 cursor-pointer text-right text-[11px] font-medium uppercase tracking-wide hover:text-foreground ${currentKey === sortKey ? "text-foreground" : "text-text-secondary"} ${className ?? ""}`}
    >
      {label}
    </button>
  );
}

/** Dia de hoje (1=segunda…5=sexta) no fuso de Brasília — só para um destaque sutil. */
function todayWeekdayBR(): number | null {
  const wd = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "America/Sao_Paulo",
  });
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 };
  return map[wd] ?? null;
}

/**
 * "Entregas da Semana" — item 1-21 do pedido: só volume de entregas da
 * semana ATUAL (sem seletor de período, sempre segunda a domingo em
 * Brasília). Substitui integralmente "Entregas por dia da semana"
 * (`TeamWeekdayProductivity.tsx`, removido). NUNCA representa performance
 * completa nem realimenta o Score Operacional — mede volume + padrão de
 * entrega, nada além disso.
 */
export function TeamDeliveriesWeek({
  weekRangeLabel,
  weekdayData,
  tasksByDay,
  memberRows,
  /** % vs. semana anterior, já comparando só os dias equivalentes (nunca
   * semana parcial contra semana anterior completa — item 6 do pedido).
   * `null` quando a semana anterior não teve nenhuma entrega nos mesmos
   * dias (sem base pra calcular %). */
  weeklyTrendPct,
  insights = [],
  onOpenTask,
  onOpenMember,
}: {
  weekRangeLabel: string;
  weekdayData: WeekdayBucket[];
  tasksByDay: Map<number, DashTaskFlat[]>;
  memberRows: DeliveryMemberRow[];
  weeklyTrendPct: number | null;
  /** Insights do time (`generateInsights`); a expansão de cada membro mostra os de ATENÇÃO dele. */
  insights?: Insight[];
  onOpenTask: (t: DashTask) => void;
  onOpenMember: (m: Member, opts?: { showComposition?: boolean }) => void;
}) {
  const [openWeekday, setOpenWeekday] = useState<WeekdayBucket | null>(null);
  const [openMemberTasks, setOpenMemberTasks] = useState<DeliveryMemberRow | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("thisWeek");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const thisWeekTotal = useMemo(
    () => weekdayData.reduce((s, d) => s + d.totalCompletions, 0),
    [weekdayData],
  );
  const bestDay = useMemo(
    () =>
      weekdayData.reduce<WeekdayBucket | null>(
        (best, d) =>
          d.totalCompletions > 0 && (!best || d.totalCompletions > best.totalCompletions)
            ? d
            : best,
        null,
      ),
    [weekdayData],
  );
  const avgDaily = weekdayData.length > 0 ? thisWeekTotal / weekdayData.length : 0;

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...memberRows].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return (av - bv) * dir;
    });
  }, [memberRows, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const maxDay = Math.max(1, ...weekdayData.map((d) => d.totalCompletions));
  const today = todayWeekdayBR();

  return (
    <div className="surface-card p-5">
      {/* Título + período; ao lado, o total e a comparação com a semana anterior (mesmo cálculo de sempre). */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h3 className="text-[15px] font-semibold text-foreground">Entregas da Semana</h3>
          <p className="mt-0.5 text-xs text-text-secondary">{weekRangeLabel}</p>
        </div>
        {thisWeekTotal > 0 && (
          <p className="flex flex-wrap items-baseline gap-x-2 text-right">
            <span className="text-lg font-semibold tabular-nums text-foreground">
              {thisWeekTotal} entrega{thisWeekTotal === 1 ? "" : "s"}
            </span>
            {weeklyTrendPct != null && (
              <span
                className={`text-xs font-medium ${
                  weeklyTrendPct > 0
                    ? "text-success-soft-foreground"
                    : weeklyTrendPct < 0
                      ? "text-danger-soft-foreground"
                      : "text-text-secondary"
                }`}
              >
                {weeklyTrendPct > 0 ? "+" : ""}
                {Math.round(weeklyTrendPct)}% vs. semana anterior
              </span>
            )}
          </p>
        )}
      </div>

      {thisWeekTotal === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">
          Não há entregas registradas nesta semana.
        </p>
      ) : (
        <>
          {/* A semana numa linha: dia, número (o protagonista) e uma barra curta proporcional.
           * Clicar num dia abre as tarefas que compõem o número. */}
          <ul className="mt-4 grid grid-cols-5 gap-1.5" aria-label="Entregas por dia">
            {weekdayData.map((d) => {
              const short = d.label.slice(0, 3).toUpperCase();
              const isToday = today === d.weekday;
              const pct =
                d.totalCompletions > 0 ? Math.max(8, (d.totalCompletions / maxDay) * 100) : 0;
              return (
                <li key={d.weekday}>
                  <button
                    type="button"
                    disabled={d.totalCompletions === 0}
                    onClick={() => setOpenWeekday(d)}
                    aria-label={`${d.label}-feira: ${d.totalCompletions} entrega${d.totalCompletions === 1 ? "" : "s"}`}
                    aria-current={isToday ? "date" : undefined}
                    className={`block w-full rounded-lg px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand enabled:cursor-pointer enabled:hover:bg-muted/60 ${
                      isToday ? "bg-muted/50 ring-1 ring-inset ring-border" : ""
                    }`}
                  >
                    <span
                      className={`block text-[11px] uppercase tracking-wide ${isToday ? "font-semibold text-foreground" : "text-text-secondary"}`}
                    >
                      {short}
                    </span>
                    <span
                      className={`mt-0.5 block text-xl font-semibold tabular-nums leading-tight ${d.totalCompletions === 0 ? "text-text-secondary/60" : "text-foreground"}`}
                    >
                      {d.totalCompletions}
                    </span>
                    <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-foreground/45"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-text-secondary">
            {bestDay && (
              <span>
                Maior volume: {bestDay.label.toLowerCase()}-feira · {bestDay.totalCompletions}
              </span>
            )}
            <span>Média diária: {fmtAvg(avgDaily)}</span>
          </p>
        </>
      )}

      {memberRows.length > 0 && (
        <div className="mt-5 border-t border-border/60 pt-4">
          <h4 className="px-3 pb-2 text-xs font-semibold uppercase tracking-widest text-text-secondary">
            Desempenho do time
          </h4>
          <div className="flex items-center gap-3 px-3 pb-1.5">
            <span className="w-3.5 shrink-0" />
            <span className="flex-1 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
              Membro
            </span>
            <SortableHeader
              label="Esta semana"
              sortKey="thisWeek"
              currentKey={sortKey}
              onSort={onSort}
              className="w-16"
            />
            <SortableHeader
              label="Média mensal"
              sortKey="monthlyAvg"
              currentKey={sortKey}
              onSort={onSort}
              className="hidden w-20 md:inline"
            />
            <UiTooltip>
              <TooltipTrigger asChild>
                <span className="hidden w-20 shrink-0 lg:inline">
                  <SortableHeader
                    label="Média trim."
                    sortKey="quarterlyAvg"
                    currentKey={sortKey}
                    onSort={onSort}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>Média semanal nos últimos 3 meses</TooltipContent>
            </UiTooltip>
            <UiTooltip>
              <TooltipTrigger asChild>
                <span className="hidden w-20 shrink-0 lg:inline">
                  <SortableHeader
                    label="Média anual"
                    sortKey="yearlyAvg"
                    currentKey={sortKey}
                    onSort={onSort}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>Média semanal nos últimos 12 meses</TooltipContent>
            </UiTooltip>
            <SortableHeader
              label="Tendência"
              sortKey="trendPct"
              currentKey={sortKey}
              onSort={onSort}
              className="w-16"
            />
          </div>
          <div className="overflow-hidden rounded-xl border border-border/60">
            {sortedRows.map((row) => (
              <MemberRow
                key={row.member.id}
                row={row}
                insights={insights.filter(
                  (i) => i.memberId === row.member.id && i.nature === "atencao",
                )}
                onOpenTasks={() => setOpenMemberTasks(row)}
                onOpenMember={() => onOpenMember(row.member)}
              />
            ))}
          </div>
        </div>
      )}

      <DeliveryTasksDialog
        title={openWeekday ? `Entregas — ${openWeekday.label.toUpperCase()}-feira` : null}
        subtitle={`${openWeekday?.totalCompletions ?? 0} tarefa${openWeekday?.totalCompletions === 1 ? "" : "s"} concluída${openWeekday?.totalCompletions === 1 ? "" : "s"}`}
        tasks={openWeekday ? (tasksByDay.get(openWeekday.weekday) ?? []) : []}
        onOpenChange={(open) => !open && setOpenWeekday(null)}
        onOpenTask={onOpenTask}
      />
      <DeliveryTasksDialog
        title={openMemberTasks ? `Entregas — ${openMemberTasks.member.name}` : null}
        subtitle={`${openMemberTasks?.thisWeek ?? 0} tarefa${openMemberTasks?.thisWeek === 1 ? "" : "s"} concluída${openMemberTasks?.thisWeek === 1 ? "" : "s"} nesta semana`}
        tasks={openMemberTasks?.thisWeekTasks ?? []}
        onOpenChange={(open) => !open && setOpenMemberTasks(null)}
        onOpenTask={onOpenTask}
      />
    </div>
  );
}
