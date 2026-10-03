import { useMemo, useState } from "react";
import {
  matchesFilters,
  previousPeriodRange,
  type AdvancedFilters,
  type useFinanceiroFilteredEntries,
} from "./useFinanceiroFilteredEntries";
import {
  computeSaldoAtual,
  computeSaldoProjetado,
  projectionHorizonTo,
  type ProjectionHorizon,
} from "@/lib/financeiro-entries";
import { useSaldoInicial } from "@/lib/financeiro-saldo-inicial-store";
import { PosicaoResumo } from "./PosicaoFinanceira";
import { RequerAtencaoList } from "./RequerAtencaoList";
import { SaldoInicialDialog } from "./SaldoInicialDialog";
import { FluxoCaixaChart } from "./FluxoCaixaChart";
import { AReceberAPagarPreview } from "./AReceberAPagarPreview";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

/** Resumo — "como estamos?" numa leitura só, de cima pra baixo:
 * posição (saldo, entradas, saídas, resultado, projetado) → o que pede
 * atenção (só aparece se houver) → fluxo de caixa → a receber / a pagar.
 * O período é o contexto global da página (vive em `FinanceiroSection`),
 * não um controle próprio deste bloco. */
export function VisaoGeralTab({
  filtered,
  onApplyFilter,
  onNavigateToAReceber,
  onNavigateToAPagar,
}: {
  filtered: Filtered;
  onApplyFilter: (patch: Partial<AdvancedFilters>) => void;
  onNavigateToAReceber: () => void;
  onNavigateToAPagar: () => void;
}) {
  const { all, visible, range, filters } = filtered;
  const saldoInicial = useSaldoInicial();
  const [horizon, setHorizon] = useState<ProjectionHorizon>("fim_do_mes");
  const [configuringSaldo, setConfiguringSaldo] = useState(false);

  const previousVisible = useMemo(() => {
    const prevRange = previousPeriodRange(range);
    return all.filter(
      (e) =>
        e.vencimento >= prevRange.from &&
        e.vencimento <= prevRange.to &&
        matchesFilters(e, filters),
    );
  }, [all, range, filters]);

  const saldoAtual = computeSaldoAtual(saldoInicial, all);
  const saldoProjetado = computeSaldoProjetado(saldoAtual, all, projectionHorizonTo(horizon));

  const applyAndGo = (patch: Partial<AdvancedFilters>) => {
    onApplyFilter(patch);
  };

  /** "Requer atenção" olha o histórico inteiro (`filtered.all`), não só o
   * período ativo — sem isso, um item vencido de um mês anterior some da
   * lista ao navegar pra Movimentações se o período atual for "Este mês". */
  const applyAlertAndGo = (patch: Partial<AdvancedFilters>) => {
    const futureBound = new Date();
    futureBound.setDate(futureBound.getDate() + 30);
    filtered.setPeriodMode("personalizado");
    filtered.setCustomFrom("2000-01-01");
    filtered.setCustomTo(futureBound.toISOString().slice(0, 10));
    applyAndGo(patch);
  };

  return (
    <div className="space-y-6">
      <PosicaoResumo
        all={all}
        visible={visible}
        previousVisible={previousVisible}
        range={range}
        saldoInicial={saldoInicial}
        horizon={horizon}
        onHorizonChange={setHorizon}
        onConfigureSaldo={() => setConfiguringSaldo(true)}
      />

      <RequerAtencaoList
        filtered={filtered}
        saldoProjetado={saldoProjetado}
        onApplyFilter={applyAlertAndGo}
      />

      <FluxoCaixaChart filtered={filtered} />

      <AReceberAPagarPreview
        all={all}
        onVerAReceber={onNavigateToAReceber}
        onVerAPagar={onNavigateToAPagar}
      />

      {configuringSaldo && (
        <SaldoInicialDialog
          current={saldoInicial}
          onClose={() => setConfiguringSaldo(false)}
          onSaved={() => setConfiguringSaldo(false)}
        />
      )}
    </div>
  );
}
