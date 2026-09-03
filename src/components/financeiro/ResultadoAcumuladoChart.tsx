import { useMemo } from "react";
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
import { cashFlowSeries, runningBalance, fmtBRL } from "@/lib/financeiro-entries";
import { ChartCard, ChartEmptyState, abbreviateBRL } from "./financeiro-charts-shared";
import type { useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

function granularityFor(fromIso: string, toIso: string): "day" | "week" | "month" {
  const days = Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}

function formatBucketLabel(bucket: string, granularity: "day" | "week" | "month"): string {
  if (granularity === "month") {
    const [y, m] = bucket.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
      month: "short",
      year: "2-digit",
    });
  }
  const d = new Date(`${bucket}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

type Point = { bucket: string; label: string; saldoAcumulado: number };

function Tip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Point;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{row.label}</p>
      <p className={row.saldoAcumulado >= 0 ? "text-emerald-600" : "text-rose-600"}>
        Saldo acumulado {fmtBRL(row.saldoAcumulado)}
      </p>
    </div>
  );
}

/** Evolução do saldo ao longo do período — mostra tendência, não só
 * entradas/saídas isoladas por bucket (o gráfico de Fluxo já faz isso). */
export function ResultadoAcumuladoChart({
  filtered,
  mode,
}: {
  filtered: Filtered;
  mode: "realizado" | "projetado";
}) {
  const granularity = useMemo(
    () => granularityFor(filtered.range.from, filtered.range.to),
    [filtered.range],
  );
  const points: Point[] = useMemo(() => {
    const series = cashFlowSeries(filtered.visible, granularity);
    return runningBalance(series, mode).map((p) => ({
      bucket: p.bucket,
      label: formatBucketLabel(p.bucket, granularity),
      saldoAcumulado: p.saldoAcumulado,
    }));
  }, [filtered.visible, mode, granularity]);

  return (
    <ChartCard title="Resultado acumulado">
      {points.length === 0 ? (
        <ChartEmptyState message="Nenhum lançamento neste período." />
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ left: 0, right: 8, top: 4 }}>
              <defs>
                <linearGradient id="saldoFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeOpacity={0.15} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => abbreviateBRL(v)}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip content={<Tip />} cursor={{ stroke: "var(--border)" }} />
              <Area
                type="monotone"
                dataKey="saldoAcumulado"
                stroke="var(--chart-2)"
                strokeWidth={2}
                fill="url(#saldoFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
