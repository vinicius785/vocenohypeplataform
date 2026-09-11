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
import { ChartCard, ChartEmptyState } from "./financeiro-charts-shared";
import type { useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";
import { SegmentedControl } from "@/components/ui/segmented-control";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

/** Correção cirúrgica do eixo Y — formato mais compacto que
 * `abbreviateBRL` (sem "R$" e sem espaço antes do sufixo), só pra caber
 * numa linha só dentro da largura reservada do `YAxis`. Local a este
 * gráfico só (não mexe em `abbreviateBRL`, usado só aqui mesmo, pra não
 * arriscar nenhum outro consumidor). O tooltip continua usando `fmtBRL`
 * (valor completo), esta função é só pros rótulos do eixo. */
function axisTickBRL(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}mi`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}mil`;
  }
  return `${sign}${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}
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
    <div className="rounded-xl border border-border bg-popover px-4 py-3 text-xs shadow-lg">
      <p className="mb-1.5 text-[13px] font-semibold text-foreground">{row.label}</p>
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
      <p className={saldoDia >= 0 ? "text-success" : "text-danger"}>
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
    <div className="rounded-xl border border-border bg-popover px-4 py-3 text-xs shadow-lg">
      <p className="mb-1.5 text-[13px] font-semibold text-foreground">{row.label}</p>
      <p className={saldo >= 0 ? "text-success" : "text-danger"}>Saldo acumulado {fmtBRL(saldo)}</p>
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
      description="Realizado (linha sólida) e projetado (linha tracejada), sempre pra frente — não segue o período selecionado no topo."
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          <SegmentedControl
            aria-label="Modo de visualização do fluxo de caixa"
            size="sm"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "diario", label: "Fluxo diário" },
              { value: "acumulado", label: "Saldo acumulado" },
            ]}
          />
          <select
            value={horizon}
            onChange={(e) => setHorizon(e.target.value as FlowHorizon)}
            className="h-7 cursor-pointer rounded-md border border-border bg-background px-1.5 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
        // Correção cirúrgica: `lg:h-auto lg:flex-1 lg:min-h-0` deixa a área
        // de plotagem crescer pra preencher a altura que o `ChartCard` (com
        // `h-full`) recebeu da célula do grid esticada — sem isso, sobrava
        // vazio abaixo do gráfico quando a coluna direita (Vencidos + A
        // receber/pagar) era mais alta que o card do gráfico. Abaixo de
        // `lg` (bento vira 1 coluna) mantém a altura fixa de sempre
        // (280-320px, legível em mobile/tablet).
        <div className="flex h-72 flex-col md:h-80 lg:h-auto lg:flex-1 lg:min-h-0">
          <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              {viewMode === "diario" ? (
                <LineChart data={diarioPoints} margin={{ left: 4, right: 8, top: 12 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.15} stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => axisTickBRL(v)}
                    tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    tickMargin={8}
                  />
                  <Tooltip content={<DiarioTooltip />} cursor={{ stroke: "var(--border)" }} />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <Line
                    type="linear"
                    dataKey="receitaRealizada"
                    name="Entradas realizadas"
                    stroke="var(--success)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="receitaProjetada"
                    name="Entradas projetadas"
                    stroke="var(--success)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="despesaRealizada"
                    name="Saídas realizadas"
                    stroke="var(--danger)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="despesaProjetada"
                    name="Saídas projetadas"
                    stroke="var(--danger)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              ) : (
                <LineChart data={acumuladoPoints} margin={{ left: 4, right: 8, top: 12 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.15} stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => axisTickBRL(v)}
                    tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    tickMargin={8}
                  />
                  <Tooltip content={<AcumuladoTooltip />} cursor={{ stroke: "var(--border)" }} />
                  <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="3 3" />
                  <Line
                    type="linear"
                    dataKey="saldoRealizado"
                    name="Saldo realizado"
                    stroke="var(--brand)"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="saldoProjetado"
                    name="Saldo projetado"
                    stroke="var(--brand)"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
          <div className="mt-3 shrink-0 flex flex-wrap items-center gap-4 text-[11px] text-text-secondary">
            {viewMode === "diario" ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4" style={{ background: "var(--success)" }} />
                  Realizado
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-0.5 w-4 border-t border-dashed"
                    style={{ borderColor: "var(--success)" }}
                  />
                  Projetado
                </span>
                <span className="ml-2 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--success)" }} />
                  Entradas
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--danger)" }} />
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
