import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { TASK_STATUS_DOT } from "@/components/tasks/TaskBoard";
import type { DashTask, DashTaskFlat } from "@/lib/task-aggregation";

/** Ordem/rótulos reais dos 7 status que uma tarefa pode ter (idênticos
 * entre projeto/campanha/avulsa do Marketing) — nada de agrupar em
 * categorias inventadas tipo "A fazer"/"Em revisão". */
const STATUS_ORDER: DashTask["status"][] = [
  "Aberto",
  "Em andamento",
  "Em aprovação",
  "Em ajustes",
  "Aprovado",
  "Concluído",
  "Arquivado",
];

// Mesma paleta `var(--chart-1..5)` já usada em outros gráficos do app
// (InfluencerBoard/InfluenciadoresSection) — 7 categorias reciclam as 5
// cores, não é preciso uma paleta nova só pra isso.
const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Donut "Tarefas por status" — categorias reais, contagem real de todas
 * as tarefas da plataforma. Clicar numa categoria expande, logo abaixo,
 * a lista das tarefas daquele status (mesma linha de tarefa usada em
 * outros painéis do dashboard). */
export function TasksByStatus({
  tasks,
  onOpenTask,
}: {
  tasks: DashTaskFlat[];
  onOpenTask: (t: DashTask) => void;
}) {
  const [expanded, setExpanded] = useState<DashTask["status"] | null>(null);

  const data = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        count: tasks.filter((t) => t.status === status).length,
      })).filter((d) => d.count > 0),
    [tasks],
  );
  const total = tasks.length;

  const expandedTasks = useMemo(
    () => (expanded ? tasks.filter((t) => t.status === expanded) : []),
    [tasks, expanded],
  );

  if (total === 0) {
    return (
      <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Tarefas por status
        </h3>
        <p className="flex flex-1 items-center justify-center py-8 text-center text-sm text-muted-foreground">
          Nenhuma tarefa cadastrada ainda.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Tarefas por status
      </h3>
      <div className="mt-2 flex flex-1 flex-col items-center gap-3 sm:flex-row">
        <div className="relative h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="status"
                innerRadius="62%"
                outerRadius="98%"
                paddingAngle={2}
                isAnimationActive={false}
                onClick={(entry) =>
                  setExpanded((prev) =>
                    prev === entry.status ? null : (entry.status as DashTask["status"]),
                  )
                }
                style={{ cursor: "pointer" }}
              >
                {data.map((entry, i) => (
                  <Cell
                    key={entry.status}
                    fill={SLICE_COLORS[i % SLICE_COLORS.length]}
                    opacity={expanded && expanded !== entry.status ? 0.35 : 1}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold text-foreground">{total}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              tarefas
            </span>
          </div>
        </div>

        <ul className="min-w-0 flex-1 space-y-1">
          {data.map((d, i) => (
            <li key={d.status}>
              <button
                type="button"
                onClick={() => setExpanded((prev) => (prev === d.status ? null : d.status))}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted/50 ${
                  expanded === d.status ? "bg-muted/60" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5 truncate text-foreground">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                  />
                  {d.status}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{d.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {expanded && (
        <div className="mt-3 border-t border-border pt-3">
          <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {expandedTasks.map((t) => (
              <li key={`${t.projectId}_${t.id}`}>
                <button
                  type="button"
                  onClick={() => onOpenTask(t)}
                  className="group flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${TASK_STATUS_DOT[t.status]}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground group-hover:underline">
                    {t.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {t.projectName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
