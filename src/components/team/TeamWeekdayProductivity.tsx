import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { WEEKDAY_PERIOD_OPTIONS, type WeekdayBucket, type WeekdayPeriodMode } from "@/lib/score";
import type { DashTask, DashTaskFlat } from "@/lib/task-aggregation";

const DRILLDOWN_PREVIEW_LIMIT = 8;

function ProductivityTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as WeekdayBucket;
  // `occurrences === 1` = recorte de uma única semana (cada dia útil só
  // ocorre 1x) — nesse caso "média" é redundante com o total, então o
  // tooltip mostra quantas pessoas entregaram naquele dia em vez de uma
  // média sem sentido (item 3 do pedido, formato "Esta semana").
  if (row.occurrences === 1) {
    return (
      <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
        <p className="mb-1 font-semibold text-foreground">{row.label}-feira</p>
        <p className="text-foreground">
          {row.totalCompletions} tarefa{row.totalCompletions === 1 ? "" : "s"} concluída
          {row.totalCompletions === 1 ? "" : "s"}
        </p>
        <p className="text-muted-foreground">
          {row.byMember.length} membro{row.byMember.length === 1 ? "" : "s"} realizara
          {row.byMember.length === 1 ? "" : "m"} entregas
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{row.label}-feira</p>
      <p className="text-foreground">
        {row.totalCompletions} tarefa{row.totalCompletions === 1 ? "" : "s"} concluída
        {row.totalCompletions === 1 ? "" : "s"}
      </p>
      <p className="text-muted-foreground">
        Média de {row.average == null ? "—" : row.average.toFixed(1).replace(".", ",")} por{" "}
        {row.label.toLowerCase()}-feira
      </p>
      <p className="text-muted-foreground">
        {row.occurrences} dia{row.occurrences === 1 ? "" : "s"} considerado
        {row.occurrences === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/** Tabela "quantidade exata por membro" — só faz sentido no recorte
 * "Esta semana" (pedido explícito): nos demais recortes (30/90 dias,
 * ano) uma tabela pessoa×dia teria dezenas de ocorrências do mesmo dia
 * da semana misturadas numa única contagem, e ficaria grande/confusa —
 * o gráfico de média já serve pra esses recortes mais longos. */
function ByMemberTable({ data }: { data: WeekdayBucket[] }) {
  const names = Array.from(new Set(data.flatMap((d) => d.byMember.map((m) => m.name)))).sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
  if (names.length === 0) return null;
  const countFor = (name: string, bucket: WeekdayBucket) =>
    bucket.byMember.find((m) => m.name === name)?.count ?? 0;

  return (
    <div className="mt-4 overflow-x-auto border-t border-border pt-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pb-1.5 pr-2 font-medium">Membro</th>
            {data.map((d) => (
              <th key={d.weekday} className="px-1.5 pb-1.5 text-center font-medium">
                {d.label.slice(0, 3).toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {names.map((name) => (
            <tr key={name} className="border-t border-border/60">
              <td className="max-w-[9rem] truncate py-1.5 pr-2 text-foreground">{name}</td>
              {data.map((d) => {
                const count = countFor(name, d);
                return (
                  <td
                    key={d.weekday}
                    className={`px-1.5 py-1.5 text-center tabular-nums ${count > 0 ? "text-foreground" : "text-muted-foreground/40"}`}
                  >
                    {count > 0 ? count : "–"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "02/09 às 14:32" — hora local a partir do timestamp de conclusão. */
function formatCompletedAt(iso: string): string {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} às ${time}`;
}

function DrilldownTaskRow({
  task,
  onOpenTask,
}: {
  task: DashTaskFlat;
  onOpenTask: (t: DashTask) => void;
}) {
  const assignees = task.assignees.length ? task.assignees.join(", ") : "Sem responsável";
  return (
    <button
      type="button"
      onClick={() => onOpenTask(task)}
      className="flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-muted/60"
    >
      <span className="truncate text-sm text-foreground">{task.title}</span>
      <span className="truncate text-xs text-muted-foreground">
        {assignees} · {task.projectName}
      </span>
      <span className="text-[11px] text-muted-foreground">
        Concluída {task.completedAt ? formatCompletedAt(task.completedAt) : "—"}
      </span>
    </button>
  );
}

/** Dialog "ENTREGAS — QUARTA-FEIRA" (item 4 do pedido) — lista as tarefas
 * de verdade que compõem a barra clicada, capada em
 * `DRILLDOWN_PREVIEW_LIMIT` com "Ver todas" expandindo em vez de abrir
 * outra tela. Clicar numa tarefa abre ela de verdade (`onOpenTask`, o
 * mesmo usado no resto da aba Time — nunca uma cópia). */
function WeekdayDrilldownDialog({
  bucket,
  tasks,
  onOpenChange,
  onOpenTask,
}: {
  bucket: WeekdayBucket | null;
  tasks: DashTaskFlat[];
  onOpenChange: (open: boolean) => void;
  onOpenTask: (t: DashTask) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? tasks : tasks.slice(0, DRILLDOWN_PREVIEW_LIMIT);

  return (
    <Dialog
      open={!!bucket}
      onOpenChange={(open) => {
        if (!open) setShowAll(false);
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Entregas — {bucket?.label.toUpperCase()}-feira</DialogTitle>
          <DialogDescription>
            {bucket?.totalCompletions} tarefa{bucket?.totalCompletions === 1 ? "" : "s"} concluída
            {bucket?.totalCompletions === 1 ? "" : "s"}
          </DialogDescription>
        </DialogHeader>
        {tasks.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Não foi possível carregar os detalhes.
          </p>
        ) : (
          <>
            <div className="max-h-96 space-y-0.5 overflow-y-auto">
              {visible.map((t) => (
                <DrilldownTaskRow key={`${t.projectId}_${t.id}`} task={t} onOpenTask={onOpenTask} />
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

/** "Entregas por dia da semana" — tarefas CONCLUÍDAS (métrica concreta,
 * não um índice abstrato de produtividade). Mostra a MÉDIA de entregas
 * por ocorrência de cada dia (seg-sex) no período, não o total bruto
 * (evita distorção quando o período cobre números diferentes de cada
 * dia da semana). Sábado/domingo omitidos por completo (não cinza/
 * desabilitados) — não fazem parte do escopo desta métrica ainda. Na
 * "Esta semana", uma tabela "quantidade exata por membro" complementa o
 * gráfico; barras são clicáveis em qualquer recorte, abrindo a lista de
 * tarefas de verdade daquele dia. */
export function TeamWeekdayProductivity({
  data,
  tasksByDay,
  period,
  onPeriodChange,
  onOpenTask,
}: {
  data: WeekdayBucket[];
  tasksByDay: Map<number, DashTaskFlat[]>;
  period: WeekdayPeriodMode;
  onPeriodChange: (v: WeekdayPeriodMode) => void;
  onOpenTask: (t: DashTask) => void;
}) {
  const hasAnyData = data.some((d) => d.totalCompletions > 0);
  const [openWeekday, setOpenWeekday] = useState<WeekdayBucket | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Entregas por dia da semana
        </h3>
        <select
          value={period}
          onChange={(e) => onPeriodChange(e.target.value as WeekdayPeriodMode)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        >
          {WEEKDAY_PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {!hasAnyData ? (
        <p className="flex h-36 items-center justify-center text-center text-sm text-muted-foreground">
          Nenhuma entrega registrada nesse período.
        </p>
      ) : (
        <div className="mt-3 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 0, right: 8, top: 4 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.15} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickFormatter={(v: string) => v.slice(0, 3).toUpperCase()}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip content={<ProductivityTooltip />} cursor={{ fill: "var(--muted)" }} />
              <Bar
                dataKey="average"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
                barSize={40}
                isAnimationActive={false}
                cursor="pointer"
                onClick={(entry: { payload?: WeekdayBucket }) =>
                  entry.payload && setOpenWeekday(entry.payload)
                }
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {period === "semana" && <ByMemberTable data={data} />}

      <WeekdayDrilldownDialog
        bucket={openWeekday}
        tasks={openWeekday ? (tasksByDay.get(openWeekday.weekday) ?? []) : []}
        onOpenChange={(open) => {
          if (!open) setOpenWeekday(null);
        }}
        onOpenTask={onOpenTask}
      />
    </div>
  );
}
