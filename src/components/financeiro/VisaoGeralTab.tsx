import { useMemo, useState } from "react";
import { kpiTotals, fmtBRL } from "@/lib/financeiro-entries";
import {
  matchesFilters,
  previousPeriodRange,
  type AdvancedFilters,
  type useFinanceiroFilteredEntries,
} from "./useFinanceiroFilteredEntries";
import { Kpi } from "./shared";
import { RequerAtencaoStrip } from "./RequerAtencaoStrip";
import { FluxoFinanceiroChart } from "./FluxoFinanceiroChart";
import { ResultadoAcumuladoChart } from "./ResultadoAcumuladoChart";
import { DespesasPorCategoriaChart } from "./DespesasPorCategoriaChart";
import { ReceitaPorClienteChart } from "./ReceitaPorClienteChart";
import { ResultadoPorCampanhaTable } from "./ResultadoPorCampanhaTable";
import { ProximosVencimentos } from "./ProximosVencimentos";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Seta+% pequenos, sem cor exagerada — subir despesa não é "ruim" por si
 * só, então não colore por sinal de crescimento (regra explícita do
 * pedido). Só o texto discreto, sem verde/vermelho aqui. */
function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const arrow = pct >= 0 ? "↑" : "↓";
  return (
    <span className="text-[10px] text-muted-foreground">
      {arrow} {Math.abs(pct).toFixed(1)}% vs. período anterior
    </span>
  );
}

export function VisaoGeralTab({
  filtered,
  onApplyFilter,
  onNavigateToLancamentos,
}: {
  filtered: Filtered;
  onApplyFilter: (patch: Partial<AdvancedFilters>) => void;
  onNavigateToLancamentos: () => void;
}) {
  const { all, visible, range, filters } = filtered;
  const [flowMode, setFlowMode] = useState<"realizado" | "projetado">("realizado");

  const totals = useMemo(() => kpiTotals(visible), [visible]);

  const previousTotals = useMemo(() => {
    const prevRange = previousPeriodRange(range);
    const prevEntries = all.filter(
      (e) =>
        e.vencimento >= prevRange.from &&
        e.vencimento <= prevRange.to &&
        matchesFilters(e, filters),
    );
    return kpiTotals(prevEntries);
  }, [all, range, filters]);

  const applyAndGo = (patch: Partial<AdvancedFilters>) => {
    onApplyFilter(patch);
    onNavigateToLancamentos();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-x-6 gap-y-3 overflow-x-auto pb-1">
        <Kpi
          label="Receita realizada"
          value={fmtBRL(totals.receitaRealizada)}
          sub={<Delta pct={pctChange(totals.receitaRealizada, previousTotals.receitaRealizada)} />}
        />
        <Kpi label="A receber" value={fmtBRL(totals.aReceber)} />
        <Kpi
          label="Despesas realizadas"
          value={fmtBRL(totals.despesaRealizada)}
          sub={<Delta pct={pctChange(totals.despesaRealizada, previousTotals.despesaRealizada)} />}
        />
        <Kpi label="A pagar" value={fmtBRL(totals.aPagar)} />
        <Kpi label="Saldo realizado" value={fmtBRL(totals.saldoRealizado)} />
        <Kpi label="Saldo projetado" value={fmtBRL(totals.saldoProjetado)} />
      </div>

      <RequerAtencaoStrip filtered={filtered} onApplyFilter={applyAndGo} />

      {visible.length === 0 ? (
        <p className="rounded-lg border border-border bg-background px-4 py-12 text-center text-xs text-muted-foreground">
          Nenhum lançamento encontrado neste período.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FluxoFinanceiroChart filtered={filtered} mode={flowMode} onModeChange={setFlowMode} />
            <ResultadoAcumuladoChart filtered={filtered} mode={flowMode} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DespesasPorCategoriaChart filtered={filtered} onApplyFilter={applyAndGo} />
            <ReceitaPorClienteChart filtered={filtered} onApplyFilter={applyAndGo} />
          </div>

          <ResultadoPorCampanhaTable filtered={filtered} onApplyFilter={applyAndGo} />

          <ProximosVencimentos filtered={filtered} onVerTodos={onNavigateToLancamentos} />
        </>
      )}
    </div>
  );
}
