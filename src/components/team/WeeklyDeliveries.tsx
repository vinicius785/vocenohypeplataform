import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import type { WeekBucket } from "@/lib/score";

function DeliveriesTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as WeekBucket;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-foreground">Semana {row.weekLabel}</p>
      <p className="text-muted-foreground">
        {row.count} {row.count === 1 ? "tarefa concluída" : "tarefas concluídas"}
      </p>
    </div>
  );
}

/** "Entregas por semana" — tendência de conclusões do time inteiro nas
 * últimas semanas (não é uma métrica de performance isolada, só o
 * volume concluído por período, pra visualizar se está subindo/descendo/
 * estável). Dado real via `weeklyCompletions` (score.ts), que já
 * reaproveita a mesma fonte de "quando foi concluída" do score. */
export function WeeklyDeliveries({ data }: { data: WeekBucket[] }) {
  const hasAny = data.some((d) => d.count > 0);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Entregas por semana
      </h3>
      {!hasAny ? (
        <p className="flex flex-1 items-center justify-center py-8 text-center text-sm text-muted-foreground">
          Nenhuma entrega registrada nesse período.
        </p>
      ) : (
        <div className="mt-3 h-64 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="weeklyDeliveriesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="weekLabel"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<DeliveriesTooltip />} />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#weeklyDeliveriesFill)"
                isAnimationActive={false}
                dot={{ r: 3, fill: "var(--chart-1)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
