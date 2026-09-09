import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import {
  cashFlowSeries,
  computeSaldoAtual,
  fmtBRL,
  todayISO,
  type CashFlowPoint,
} from "@/lib/financeiro-entries";
import { useSaldoInicial } from "@/lib/financeiro-saldo-inicial-store";
import { ChartCard, ChartEmptyState, abbreviateBRL } from "./financeiro-charts-shared";
import type { useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;
type ViewMode = "diario" | "acumulado";
type FlowHorizon = "7dias" | "30dias" | "90dias" | "mes_atual";

const HORIZON_OPTIONS: { value: FlowHorizon; label: string }[] = [
  { value: "7dias", label: "7 dias" },
  { value: "30dias", label: "30 dias" },
  { value: "90dias", label: "90 dias" },
  { value: "mes_atual", label: "Mês atual" },
];

function horizonRange(h: FlowHorizon, today = todayISO()): { from: string; to: string } {
  const d = new Date(`${today}T00:00:00`);
  if (h === "mes_atual") {
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }
  const days = h === "7dias" ? 7 : h === "30dias" ? 30 : 90;
  const from = new Date(d);
  from.setDate(from.getDate() - Math.min(days, 14)); // um pouco de contexto realizado pra trás
  const to = new Date(d);
  to.setDate(to.getDate() + days);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function granularityFor(days: number): "day" | "week" {
  return days <= 45 ? "day" : "week";
}

function formatBucketLabel(bucket: string, granularity: "day" | "week"): string {
  const d = new Date(`${bucket}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

type DiarioPoint = {
  bucket: string;
  label: string;
  receitaRealizada: number;
  despesaRealizada: number;
  receitaProjetada: number;
  despesaProjetada: number;
};

function DiarioTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as DiarioPoint;
  const saldoDia =
    row.receitaRealizada + row.receitaProjetada - (row.despesaRealizada + row.despesaProjetada);
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{row.label}</p>
      {row.receitaRealizada > 0 && (
        <p className="text-muted-foreground">
          Entradas realizadas{" "}
          <span className="font-medium text-foreground">{fmtBRL(row.receitaRealizada)}</span>
        </p>
      )}
      {row.receitaProjetada > 0 && (
        <p className="text-muted-foreground">
          Entradas projetadas{" "}
          <span className="font-medium text-foreground">{fmtBRL(row.receitaProjetada)}</span>
        </p>
      )}
      {row.despesaRealizada > 0 && (
        <p className="text-muted-foreground">
          Saídas realizadas{" "}
          <span className="font-medium text-foreground">{fmtBRL(row.despesaRealizada)}</span>
        </p>
      )}
      {row.despesaProjetada > 0 && (
        <p className="text-muted-foreground">
          Saídas projetadas{" "}
          <span className="font-medium text-foreground">{fmtBRL(row.despesaProjetada)}</span>
        </p>
      )}
      <p className={saldoDia >= 0 ? "text-emerald-600" : "text-rose-600"}>
        Saldo do dia {saldoDia >= 0 ? "+" : ""}
        {fmtBRL(saldoDia)}
      </p>
    </div>
  );
}

type AcumuladoPoint = {
  bucket: string;
  label: string;
  natureza: "realizado" | "projetado";
  saldoRealizado: number | null;
  saldoProjetado: number | null;
};

function AcumuladoTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as AcumuladoPoint;
  const saldo = row.saldoRealizado ?? row.saldoProjetado ?? 0;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{row.label}</p>
      <p className={saldo >= 0 ? "text-emerald-600" : "text-rose-600"}>
        Saldo acumulado {fmtBRL(saldo)}
      </p>
      <p className="text-muted-foreground">
        {row.natureza === "realizado" ? "Realizado" : "Projetado"}
      </p>
    </div>
  );
}

/**
 * Projeção de fluxo de caixa — substitui o antigo "Fluxo financeiro".
 * Linhas sempre lineares (nunca curvas suavizadas), realizado ≠ projetado
 * por estilo de traço (não só cor), com toggle diário/acumulado e
 * horizonte explícito (nunca herda o período da página, que é outra
 * seleção — projeção de caixa é sempre pra frente).
 */
export function FluxoCaixaChart({ filtered }: { filtered: Filtered }) {
  const [viewMode, setViewMode] = useState<ViewMode>("diario");
  const [horizon, setHorizon] = useState<FlowHorizon>("30dias");
  const saldoInicial = useSaldoInicial();

  const range = useMemo(() => horizonRange(horizon), [horizon]);
  const days = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000);
  const granularity = granularityFor(days);
  const today = todayISO();

  const entriesInRange = useMemo(
    () =>
      filtered.all.filter((e) => {
        if (e.status === "cancelado") return false;
        const realized = e.status === "recebido" || e.status === "pago";
        const bucketDate = realized ? (e.payment?.pagamento ?? e.vencimento) : e.vencimento;
        return bucketDate >= range.from && bucketDate <= range.to;
      }),
    [filtered.all, range],
  );

  const series = useMemo(
    () => cashFlowSeries(entriesInRange, granularity),
    [entriesInRange, granularity],
  );

  const diarioPoints: DiarioPoint[] = useMemo(
    () =>
      series.map((p: CashFlowPoint) => ({
        bucket: p.bucket,
        label: formatBucketLabel(p.bucket, granularity),
        receitaRealizada: p.receitaRealizada,
        despesaRealizada: p.despesaRealizada,
        receitaProjetada: p.receitaProjetada,
        despesaProjetada: p.despesaProjetada,
      })),
    [series, granularity],
  );

  const saldoAtual = computeSaldoAtual(saldoInicial, filtered.all);

  const acumuladoPoints: AcumuladoPoint[] = useMemo(() => {
    if (saldoAtual == null) return [];
    let acc = saldoAtual;
    return series.map((p) => {
      acc += p.receitaRealizada + p.receitaProjetada - (p.despesaRealizada + p.despesaProjetada);
      const isFuture = p.bucket > today;
      return {
        bucket: p.bucket,
        label: formatBucketLabel(p.bucket, granularity),
        natureza: isFuture ? "projetado" : "realizado",
        saldoRealizado: isFuture ? null : acc,
        saldoProjetado: isFuture ? acc : null,
      };
    });
  }, [series, saldoAtual, today, granularity]);

  const hasData =
    viewMode === "diario"
      ? diarioPoints.some(
          (p) =>
            p.receitaRealizada || p.despesaRealizada || p.receitaProjetada || p.despesaProjetada,
        )
      : acumuladoPoints.length > 0;

  return (
    <ChartCard
      title="Projeção de fluxo de caixa"
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-[11px]">
            {(["diario", "acumulado"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={`cursor-pointer rounded px-2 py-0.5 font-medium ${
                  viewMode === m
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "diario" ? "Fluxo diário" : "Saldo acumulado"}
              </button>
            ))}
          </div>
          <select
            value={horizon}
            onChange={(e) => setHorizon(e.target.value as FlowHorizon)}
            className="h-7 cursor-pointer rounded-md border border-border bg-background px-1.5 text-[11px] outline-none focus:ring-2 focus:ring-ring"
          >
            {HORIZON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {viewMode === "acumulado" && saldoAtual == null ? (
        <ChartEmptyState message="Configure o saldo inicial (Visão Geral) para ver o saldo acumulado projetado." />
      ) : !hasData ? (
        <ChartEmptyState message="Sem movimentações neste horizonte." />
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            {viewMode === "diario" ? (
              <LineChart data={diarioPoints} margin={{ left: 0, right: 8, top: 4 }}>
                <CartesianGrid vertical={false} strokeOpacity={0.1} stroke="var(--border)" />
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
                <Tooltip content={<DiarioTooltip />} cursor={{ stroke: "var(--border)" }} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Line
                  type="linear"
                  dataKey="receitaRealizada"
                  name="Entradas realizadas"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="receitaProjetada"
                  name="Entradas projetadas"
                  stroke="var(--chart-2)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="despesaRealizada"
                  name="Saídas realizadas"
                  stroke="var(--chart-5)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="despesaProjetada"
                  name="Saídas projetadas"
                  stroke="var(--chart-5)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            ) : (
              <LineChart data={acumuladoPoints} margin={{ left: 0, right: 8, top: 4 }}>
                <CartesianGrid vertical={false} strokeOpacity={0.1} stroke="var(--border)" />
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
                <Tooltip content={<AcumuladoTooltip />} cursor={{ stroke: "var(--border)" }} />
                <ReferenceLine y={0} stroke="var(--rose-500, #f43f5e)" strokeDasharray="3 3" />
                <Line
                  type="linear"
                  dataKey="saldoRealizado"
                  name="Saldo realizado"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="saldoProjetado"
                  name="Saldo projetado"
                  stroke="var(--foreground)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
          <div className="mt-1.5 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            {viewMode === "diario" ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4" style={{ background: "var(--chart-2)" }} />
                  Realizado
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-0.5 w-4 border-t border-dashed"
                    style={{ borderColor: "var(--chart-2)" }}
                  />
                  Projetado
                </span>
                <span className="ml-2 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-2)" }} />
                  Entradas
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-5)" }} />
                  Saídas
                </span>
              </>
            ) : (
              <span>
                Linha sólida = já ocorreu · linha tracejada = projeção · vermelho = risco de caixa
                negativo
              </span>
            )}
          </div>
        </div>
      )}
    </ChartCard>
  );
}
