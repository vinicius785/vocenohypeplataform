import { Separator } from "@/components/ui/separator";
import type { AdvancedFilters, useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";
import { useState } from "react";
import { PosicaoFinanceira } from "./PosicaoFinanceira";
import { RequerAtencaoStrip } from "./RequerAtencaoStrip";
import { FluxoFinanceiroChart } from "./FluxoFinanceiroChart";
import { AReceberAPagarPreview } from "./AReceberAPagarPreview";
import { ResultadoPorCampanhaTable } from "./ResultadoPorCampanhaTable";
import { DespesasPorCategoriaChart } from "./DespesasPorCategoriaChart";
import { ReceitaPorClienteChart } from "./ReceitaPorClienteChart";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

/** Hierarquia exata: posição financeira → requer atenção → fluxo de
 * caixa → a receber/a pagar → resultado por campanha → análises
 * secundárias. Nada mais entra aqui — informação analítica adicional
 * vive em Lançamentos/A receber/A pagar, não nesta tela. */
export function VisaoGeralTab({
  filtered,
  onApplyFilter,
  onNavigateToLancamentos,
  onNavigateToAReceber,
  onNavigateToAPagar,
}: {
  filtered: Filtered;
  onApplyFilter: (patch: Partial<AdvancedFilters>) => void;
  onNavigateToLancamentos: () => void;
  onNavigateToAReceber: () => void;
  onNavigateToAPagar: () => void;
}) {
  const { all, visible } = filtered;
  const [flowMode, setFlowMode] = useState<"realizado" | "projetado">("realizado");

  const applyAndGo = (patch: Partial<AdvancedFilters>) => {
    onApplyFilter(patch);
    onNavigateToLancamentos();
  };

  /** "Requer atenção" olha o histórico inteiro (`filtered.all`), não só o
   * período ativo — sem isso, um item vencido de um mês anterior some da
   * lista ao navegar pra Lançamentos se o período atual for "Este mês". */
  const applyAlertAndGo = (patch: Partial<AdvancedFilters>) => {
    const futureBound = new Date();
    futureBound.setDate(futureBound.getDate() + 30);
    filtered.setPeriodMode("personalizado");
    filtered.setCustomFrom("2000-01-01");
    filtered.setCustomTo(futureBound.toISOString().slice(0, 10));
    applyAndGo(patch);
  };

  if (visible.length === 0) {
    return (
      <div className="space-y-4">
        <PosicaoFinanceira
          visible={visible}
          onNavigateToAReceber={onNavigateToAReceber}
          onNavigateToAPagar={onNavigateToAPagar}
        />
        <p className="text-sm text-muted-foreground">Nenhum lançamento encontrado neste período.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PosicaoFinanceira
        visible={visible}
        onNavigateToAReceber={onNavigateToAReceber}
        onNavigateToAPagar={onNavigateToAPagar}
      />

      <RequerAtencaoStrip filtered={filtered} onApplyFilter={applyAlertAndGo} />

      <Separator />

      <FluxoFinanceiroChart filtered={filtered} mode={flowMode} onModeChange={setFlowMode} />

      <Separator />

      <AReceberAPagarPreview
        all={all}
        onVerAReceber={onNavigateToAReceber}
        onVerAPagar={onNavigateToAPagar}
      />

      <Separator />

      <ResultadoPorCampanhaTable filtered={filtered} onApplyFilter={applyAndGo} />

      <Separator />

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Análises
        </p>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ReceitaPorClienteChart filtered={filtered} onApplyFilter={applyAndGo} />
          <DespesasPorCategoriaChart filtered={filtered} onApplyFilter={applyAndGo} />
        </div>
      </div>
    </div>
  );
}
