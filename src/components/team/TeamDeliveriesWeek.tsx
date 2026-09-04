import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
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
  if (pct == null) return "text-muted-foreground";
  if (pct > 5) return "text-emerald-600 dark:text-emerald-400";
  if (pct < -5) return "text-destructive";
  return "text-muted-foreground";
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
          <p className="py-4 text-center text-sm text-muted-foreground">
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
                  <span className="truncate text-xs text-muted-foreground">
                    {t.assignees.join(", ") || "Sem responsável"} · {t.projectName}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
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
  onOpenTasks,
  onOpenMember,
}: {
  row: DeliveryMemberRow;
  onOpenTasks: () => void;
  onOpenMember: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { member } = row;
  const bestDay = row.byWeekday.reduce<{ label: string; count: number } | null>(
    (best, d) => (d.count > 0 && (!best || d.count > best.count) ? d : best),
    null,
  );

  return (
    <div className="border-t border-border first:border-t-0">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? "Recolher" : "Expandir"}
          className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenMember}
          className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md text-left"
        >
          <Avatar className="h-8 w-8 shrink-0">
            {member.photo && <AvatarImage src={member.photo} alt={member.name} />}
            <AvatarFallback className={`text-xs font-semibold ${avatarAccent(member.id)}`}>
              {initialsOf(member.name, member.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground group-hover:underline">
              {member.name || "(sem nome)"}
            </p>
            {member.role && <p className="truncate text-xs text-muted-foreground">{member.role}</p>}
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenTasks}
          disabled={row.thisWeek === 0}
          className="w-16 shrink-0 cursor-pointer text-right text-sm font-semibold tabular-nums text-foreground hover:underline disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
        >
          {row.thisWeek}
        </button>
        <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground md:inline">
          {fmtAvg(row.monthlyAvg)}
        </span>
        <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground lg:inline">
          {fmtAvg(row.quarterlyAvg)}
        </span>
        <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground lg:inline">
          {fmtAvg(row.yearlyAvg)}
        </span>
        <span className={`w-16 shrink-0 text-right text-xs font-medium ${trendTone(row.trendPct)}`}>
          {trendLabel(row.trendPct)}
        </span>
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-border/60 bg-muted/20 px-4 py-3 text-xs">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground">Esta semana</p>
              <p className="font-semibold tabular-nums text-foreground">{row.thisWeek}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Média mensal</p>
              <p className="font-semibold tabular-nums text-foreground">
                {fmtAvg(row.monthlyAvg)} / semana
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Média trimestral</p>
              <p className="font-semibold tabular-nums text-foreground">
                {fmtAvg(row.quarterlyAvg)} / semana
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Média anual</p>
              <p className="font-semibold tabular-nums text-foreground">
                {fmtAvg(row.yearlyAvg)} / semana
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Melhor dia</p>
              <p className="font-semibold text-foreground">{bestDay ? bestDay.label : "—"}</p>
            </div>
          </div>
          <div>
            <p className="mb-1 text-muted-foreground">Distribuição da semana</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {row.byWeekday.map((d) => (
                <span key={d.label} className="tabular-nums text-foreground">
                  {d.label.slice(0, 3).toUpperCase()} {d.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
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
      className={`shrink-0 cursor-pointer text-right text-[10px] font-medium uppercase tracking-wide hover:text-foreground ${currentKey === sortKey ? "text-foreground" : "text-muted-foreground"} ${className ?? ""}`}
    >
      {label}
    </button>
  );
}

type ChartDatum = WeekdayBucket & { shortLabel: string };

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as ChartDatum;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{row.label}-feira</p>
      <p className="text-foreground">
        {row.totalCompletions} tarefa{row.totalCompletions === 1 ? "" : "s"} concluída
        {row.totalCompletions === 1 ? "" : "s"}
      </p>
    </div>
  );
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
  onOpenTask,
  onOpenMember,
}: {
  weekRangeLabel: string;
  weekdayData: WeekdayBucket[];
  tasksByDay: Map<number, DashTaskFlat[]>;
  memberRows: DeliveryMemberRow[];
  weeklyTrendPct: number | null;
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

  const chartData: ChartDatum[] = weekdayData.map((d) => ({
    ...d,
    shortLabel: d.label.slice(0, 3).toUpperCase(),
  }));

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

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Entregas da Semana
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{weekRangeLabel}</p>
        </div>
        {thisWeekTotal > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">
              {thisWeekTotal} entrega{thisWeekTotal === 1 ? "" : "s"}
            </span>
            {weeklyTrendPct != null && (
              <span
                className={
                  weeklyTrendPct > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : weeklyTrendPct < 0
                      ? "text-destructive"
                      : ""
                }
              >
                {weeklyTrendPct > 0 ? "+" : ""}
                {Math.round(weeklyTrendPct)}% vs. semana anterior
              </span>
            )}
            {bestDay && (
              <span>
                Melhor dia{" "}
                <span className="font-medium text-foreground">
                  {bestDay.label.slice(0, 3).toUpperCase()} · {bestDay.totalCompletions}
                </span>
              </span>
            )}
            <span>
              Média diária <span className="font-medium text-foreground">{fmtAvg(avgDaily)}</span>
            </span>
          </div>
        )}
      </div>

      {thisWeekTotal === 0 ? (
        <p className="flex h-36 items-center justify-center text-center text-sm text-muted-foreground">
          Não há entregas registradas nesta semana.
        </p>
      ) : (
        <div className="mt-3 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 0, right: 8, top: 16 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.15} stroke="var(--border)" />
              <XAxis
                dataKey="shortLabel"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
              <Bar
                dataKey="totalCompletions"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
                barSize={40}
                isAnimationActive={false}
                cursor="pointer"
                onClick={(entry: { payload?: WeekdayBucket }) =>
                  entry.payload && setOpenWeekday(entry.payload)
                }
              >
                <LabelList
                  dataKey="totalCompletions"
                  position="top"
                  style={{ fill: "var(--foreground)", fontSize: 11, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {memberRows.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-center gap-3 px-3 pb-1.5">
            <span className="w-3.5 shrink-0" />
            <span className="flex-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
          <div className="rounded-lg border border-border">
            {sortedRows.map((row) => (
              <MemberRow
                key={row.member.id}
                row={row}
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
