import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { cashFlowSeries, fmtBRL, type CashFlowPoint } from "@/lib/financeiro-entries";
import { ChartCard, ChartEmptyState, abbreviateBRL } from "./financeiro-charts-shared";
import type { useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;
type FlowMode = "realizado" | "projetado";

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

type Point = { bucket: string; label: string; receitas: number; despesas: number };

function toPoints(
  series: CashFlowPoint[],
  mode: FlowMode,
  granularity: "day" | "week" | "month",
): Point[] {
  return series.map((p) => ({
    bucket: p.bucket,
    label: formatBucketLabel(p.bucket, granularity),
    receitas: mode === "realizado" ? p.receitaRealizada : p.receitaRealizada + p.receitaProjetada,
    despesas: mode === "realizado" ? p.despesaRealizada : p.despesaRealizada + p.despesaProjetada,
  }));
}

function FlowTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Point;
  const resultado = row.receitas - row.despesas;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{row.label}</p>
      <p className="text-muted-foreground">
        Receitas <span className="font-medium text-foreground">{fmtBRL(row.receitas)}</span>
      </p>
      <p className="text-muted-foreground">
        Despesas <span className="font-medium text-foreground">{fmtBRL(row.despesas)}</span>
      </p>
      <p className={resultado >= 0 ? "text-emerald-600" : "text-rose-600"}>
        Resultado {resultado >= 0 ? "+" : ""}
        {fmtBRL(resultado)}
      </p>
    </div>
  );
}

export function FluxoFinanceiroChart({
  filtered,
  mode,
  onModeChange,
}: {
  filtered: Filtered;
  mode: FlowMode;
  onModeChange: (m: FlowMode) => void;
}) {
  const granularity = useMemo(
    () => granularityFor(filtered.range.from, filtered.range.to),
    [filtered.range],
  );
  const points = useMemo(
    () => toPoints(cashFlowSeries(filtered.visible, granularity), mode, granularity),
    [filtered.visible, mode, granularity],
  );

  return (
    <ChartCard
      title="Fluxo financeiro"
      action={
        <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-[11px]">
          {(["realizado", "projetado"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`cursor-pointer rounded px-2 py-0.5 font-medium capitalize ${
                mode === m
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      }
    >
      {points.length === 0 ? (
        <ChartEmptyState message="Nenhum lançamento neste período." />
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ left: 0, right: 8, top: 4 }}>
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
              <Tooltip content={<FlowTooltip />} cursor={{ stroke: "var(--border)" }} />
              <Line
                type="monotone"
                dataKey="receitas"
                name="Receitas"
                stroke="var(--chart-2)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="despesas"
                name="Despesas"
                stroke="var(--chart-5)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-2)" }} />
              Receitas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-5)" }} />
              Despesas
            </span>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
