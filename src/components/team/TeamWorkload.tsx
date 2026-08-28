import { useMemo } from "react";
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
import { OPEN_STATUSES } from "@/lib/score";
import type { DashTask } from "@/lib/task-aggregation";
import type { Member } from "@/components/TimeSection";

type WorkloadRow = {
  memberId: string;
  name: string;
  prazo: number;
  hoje: number;
  atrasada: number;
  total: number;
  vencemSemana: number;
};

function WorkloadTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as WorkloadRow;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{row.name}</p>
      <p className="text-muted-foreground">{row.total} tarefas abertas</p>
      <p className="text-destructive">{row.atrasada} atrasadas</p>
      <p className="text-muted-foreground">{row.vencemSemana} vencem esta semana</p>
    </div>
  );
}

/** "Carga por membro" — barra horizontal empilhada com as tarefas ABERTAS
 * de cada pessoa (não concluídas/arquivadas), separadas em dentro do
 * prazo / vence hoje / atrasada. Dado 100% real: mesmo `tasksByMember` já
 * usado pela lista de tarefas de cada pessoa, só reagrupado por bucket. */
export function TeamWorkload({
  members,
  tasksByMember,
  onOpenMember,
}: {
  members: Member[];
  tasksByMember: Map<string, DashTask[]>;
  onOpenMember?: (member: Member) => void;
}) {
  const data = useMemo<WorkloadRow[]>(() => {
    return members
      .map((m) => {
        const tasks = (tasksByMember.get(m.name) ?? []).filter((t) => OPEN_STATUSES.has(t.status));
        const atrasada = tasks.filter((t) => t.bucket === "atrasada").length;
        const hoje = tasks.filter((t) => t.bucket === "hoje").length;
        const prazo = tasks.length - atrasada - hoje;
        const vencemSemana = tasks.filter((t) =>
          ["hoje", "amanha", "semana"].includes(t.bucket),
        ).length;
        return {
          memberId: m.id,
          name: m.name || "(sem nome)",
          prazo,
          hoje,
          atrasada,
          total: tasks.length,
          vencemSemana,
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [members, tasksByMember]);

  const handleClick = (row: unknown) => {
    if (!onOpenMember) return;
    const r = row as { payload?: WorkloadRow } | undefined;
    const memberId = r?.payload?.memberId;
    const member = members.find((m) => m.id === memberId);
    if (member) onOpenMember(member);
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Carga por membro
      </h3>
      {data.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-8 text-center text-sm text-muted-foreground">
          Ninguém com tarefa aberta no momento.
        </p>
      ) : (
        <div className="mt-3 flex-1" style={{ minHeight: Math.max(data.length * 34, 120) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }}>
              <CartesianGrid horizontal={false} strokeOpacity={0.15} stroke="var(--border)" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={90}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<WorkloadTooltip />} cursor={{ fill: "var(--muted)" }} />
              <Bar
                dataKey="prazo"
                name="Dentro do prazo"
                stackId="a"
                fill="var(--chart-2)"
                radius={[3, 0, 0, 3]}
                barSize={14}
                isAnimationActive={false}
                onClick={handleClick}
                style={{ cursor: onOpenMember ? "pointer" : undefined }}
              />
              <Bar
                dataKey="hoje"
                name="Vence hoje"
                stackId="a"
                fill="var(--chart-4)"
                barSize={14}
                isAnimationActive={false}
                onClick={handleClick}
                style={{ cursor: onOpenMember ? "pointer" : undefined }}
              />
              <Bar
                dataKey="atrasada"
                name="Atrasada"
                stackId="a"
                fill="var(--destructive)"
                radius={[0, 3, 3, 0]}
                barSize={14}
                isAnimationActive={false}
                onClick={handleClick}
                style={{ cursor: onOpenMember ? "pointer" : undefined }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-2)" }} />
          Dentro do prazo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-4)" }} />
          Vence hoje
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-destructive" />
          Atrasada
        </span>
      </div>
    </div>
  );
}
