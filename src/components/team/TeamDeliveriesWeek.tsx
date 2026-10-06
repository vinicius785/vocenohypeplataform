import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { WeekdayBucket } from "@/lib/score";
import type { DashTask, DashTaskFlat } from "@/lib/task-aggregation";
import type { Member } from "@/components/TimeSection";

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

function formatCompletedAt(iso: string): string {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} às ${time}`;
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
  /** % vs. semana anterior, já comparando só os dias equivalentes (nunca
   * semana parcial contra semana anterior completa — item 6 do pedido).
   * `null` quando a semana anterior não teve nenhuma entrega nos mesmos
   * dias (sem base pra calcular %). */
  weeklyTrendPct,
  onOpenTask,
}: {
  weekRangeLabel: string;
  weekdayData: WeekdayBucket[];
  tasksByDay: Map<number, DashTaskFlat[]>;
  weeklyTrendPct: number | null;
  onOpenTask: (t: DashTask) => void;
}) {
  const [openWeekday, setOpenWeekday] = useState<WeekdayBucket | null>(null);

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

  const maxDay = Math.max(1, ...weekdayData.map((d) => d.totalCompletions));
  const today = todayWeekdayBR();

  return (
    <section aria-label="Entregas da semana" className="space-y-1">
      {/* Título + período; ao lado, o total e a comparação com a semana anterior (mesmo cálculo de sempre). */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h3 className="text-[15px] font-semibold text-foreground">Entregas da semana</h3>
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

      <DeliveryTasksDialog
        title={openWeekday ? `Entregas — ${openWeekday.label.toUpperCase()}-feira` : null}
        subtitle={`${openWeekday?.totalCompletions ?? 0} tarefa${openWeekday?.totalCompletions === 1 ? "" : "s"} concluída${openWeekday?.totalCompletions === 1 ? "" : "s"}`}
        tasks={openWeekday ? (tasksByDay.get(openWeekday.weekday) ?? []) : []}
        onOpenChange={(open) => !open && setOpenWeekday(null)}
        onOpenTask={onOpenTask}
      />
    </section>
  );
}
