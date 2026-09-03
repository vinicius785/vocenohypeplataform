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
import { groupByCategoria, fmtBRL } from "@/lib/financeiro-entries";
import { ChartCard, ChartEmptyState, abbreviateBRL } from "./financeiro-charts-shared";
import type { AdvancedFilters, useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;
type Row = { categoria: string; total: number; pct: number };

function CategoriaTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{row.categoria}</p>
      <p className="text-muted-foreground">
        {fmtBRL(row.total)} · {row.pct.toFixed(0)}%
      </p>
    </div>
  );
}

export function DespesasPorCategoriaChart({
  filtered,
  onApplyFilter,
}: {
  filtered: Filtered;
  onApplyFilter: (patch: Partial<AdvancedFilters>) => void;
}) {
  const rows: Row[] = useMemo(() => {
    const grouped = groupByCategoria(filtered.visible, "despesa");
    const total = grouped.reduce((s, g) => s + g.total, 0);
    return grouped.map((g) => ({ ...g, pct: total > 0 ? (g.total / total) * 100 : 0 }));
  }, [filtered.visible]);

  return (
    <ChartCard title="Despesas por categoria">
      {rows.length === 0 ? (
        <ChartEmptyState message="Nenhuma despesa neste período." />
      ) : (
        <div style={{ height: Math.max(rows.length * 32, 120) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 24 }}>
              <CartesianGrid horizontal={false} strokeOpacity={0.15} stroke="var(--border)" />
              <XAxis
                type="number"
                tickFormatter={(v: number) => abbreviateBRL(v)}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="categoria"
                width={130}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CategoriaTooltip />} cursor={{ fill: "var(--muted)" }} />
              <Bar
                dataKey="total"
                fill="var(--chart-5)"
                radius={[0, 3, 3, 0]}
                barSize={14}
                isAnimationActive={false}
                onClick={(data) =>
                  onApplyFilter({ tipo: "despesa", categoria: (data as unknown as Row).categoria })
                }
                style={{ cursor: "pointer" }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
