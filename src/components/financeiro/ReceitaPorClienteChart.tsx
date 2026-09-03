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
import { groupByCliente, revenueConcentration, fmtBRL } from "@/lib/financeiro-entries";
import { ChartCard, ChartEmptyState, abbreviateBRL } from "./financeiro-charts-shared";
import type { AdvancedFilters, useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;
type Row = { clienteId: string; clienteNome: string; total: number; pct: number };

function ClienteTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{row.clienteNome}</p>
      <p className="text-muted-foreground">
        {fmtBRL(row.total)} · {row.pct.toFixed(0)}% da receita
      </p>
    </div>
  );
}

export function ReceitaPorClienteChart({
  filtered,
  onApplyFilter,
}: {
  filtered: Filtered;
  onApplyFilter: (patch: Partial<AdvancedFilters>) => void;
}) {
  const byCliente = useMemo(() => groupByCliente(filtered.visible), [filtered.visible]);
  const rows: Row[] = useMemo(() => {
    const total = byCliente.reduce((s, c) => s + c.total, 0);
    return byCliente.map((c) => ({ ...c, pct: total > 0 ? (c.total / total) * 100 : 0 }));
  }, [byCliente]);
  const concentration = useMemo(() => revenueConcentration(byCliente), [byCliente]);

  return (
    <ChartCard title="Receita por cliente">
      {rows.length === 0 ? (
        <ChartEmptyState message="Nenhuma receita vinculada a clientes neste período." />
      ) : (
        <>
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
                  dataKey="clienteNome"
                  width={110}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ClienteTooltip />} cursor={{ fill: "var(--muted)" }} />
                <Bar
                  dataKey="total"
                  fill="var(--chart-2)"
                  radius={[0, 3, 3, 0]}
                  barSize={14}
                  isAnimationActive={false}
                  onClick={(data) =>
                    onApplyFilter({ clienteId: (data as unknown as Row).clienteId })
                  }
                  style={{ cursor: "pointer" }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Top 1 cliente {concentration.top1Pct.toFixed(0)}% da receita · Top 3 clientes{" "}
            {concentration.top3Pct.toFixed(0)}% da receita
          </p>
        </>
      )}
    </ChartCard>
  );
}
