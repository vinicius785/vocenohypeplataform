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
import { SaldoHero, EntradasSaidasResumo, VencidosResumo } from "./PosicaoFinanceira";
import { RequerAtencaoList } from "./RequerAtencaoList";
import { SaldoInicialDialog } from "./SaldoInicialDialog";
import { FluxoCaixaChart } from "./FluxoCaixaChart";
import { AReceberAPagarPreview } from "./AReceberAPagarPreview";
import { PeriodPicker } from "./PeriodPicker";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

/** Bento assimétrico (Etapa 5 — aplicação real do conceito visual
 * validado em `/design-system-finance-concept`): saldo protagonista +
 * requer atenção/entradas-saídas na linha 1; fluxo de caixa protagonista
 * + vencidos/a receber-pagar na linha 2. Nenhum cálculo mudou — só a
 * composição visual de `PosicaoFinanceira` (agora `SaldoHero` +
 * `EntradasSaidasResumo` + `VencidosResumo`, mesmas funções puras). */
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
    <div className="space-y-5">
      {/* Toolbar compacta (Etapa 6) — só o Resumo tem o período integrado
       * aqui (largura do conteúdo, não a barra cheia); Movimentações e
       * Campanhas continuam com a barra de período de largura total em
       * `FinanceiroSection.tsx`, intocada. */}
      <div className="inline-flex w-fit max-w-full flex-wrap items-center gap-2 rounded-2xl bg-card px-3 py-2 dark:shadow-none">
        <PeriodPicker filtered={filtered} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <SaldoHero
            all={all}
            visible={visible}
            range={range}
            saldoInicial={saldoInicial}
            horizon={horizon}
            onHorizonChange={setHorizon}
            onConfigureSaldo={() => setConfiguringSaldo(true)}
          />
        </div>
        <div className="flex flex-col gap-5 lg:col-span-5">
          <RequerAtencaoList
            filtered={filtered}
            saldoProjetado={saldoProjetado}
            onApplyFilter={applyAlertAndGo}
          />
          <EntradasSaidasResumo visible={visible} previousVisible={previousVisible} range={range} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <FluxoCaixaChart filtered={filtered} />
        </div>
        <div className="flex flex-col gap-5 lg:col-span-4">
          <VencidosResumo
            all={all}
            onNavigateToAReceber={onNavigateToAReceber}
            onNavigateToAPagar={onNavigateToAPagar}
          />
          <AReceberAPagarPreview
            all={all}
            onVerAReceber={onNavigateToAReceber}
            onVerAPagar={onNavigateToAPagar}
          />
        </div>
      </div>

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
