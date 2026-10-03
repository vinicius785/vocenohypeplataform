import { SegmentedControl } from "@/components/ui/segmented-control";
import { ANALISES_VIEWS, type AnalisesView } from "@/lib/section-nav";
import { RelatoriosTab } from "./RelatoriosTab";
import { ResultadoPorCampanhaTable } from "./ResultadoPorCampanhaTable";
import { PeriodPicker } from "./PeriodPicker";
import type { AdvancedFilters, useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

/** Análises — entender os resultados. Concentra o que antes eram as áreas
 * Relatórios e Campanhas: "Geral" são os indicadores da carteira inteira
 * (evolução mensal, inadimplência, prazo médio, aging…); "Por campanha" é o
 * resultado financeiro de cada campanha NO PERÍODO — uma visão dentro da
 * mesma página, não uma área estrutural. Só "Por campanha" depende do
 * período, então só ela mostra o seletor. */
export function AnalisesTab({
  filtered,
  view,
  onViewChange,
  onApplyFilter,
}: {
  filtered: Filtered;
  view: AnalisesView;
  onViewChange: (v: AnalisesView) => void;
  onApplyFilter: (patch: Partial<AdvancedFilters>) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label="Visão das análises"
          size="sm"
          value={view}
          onChange={onViewChange}
          options={ANALISES_VIEWS.map((v) => ({ value: v.key, label: v.label }))}
        />
        {view === "campanhas" && <PeriodPicker filtered={filtered} />}
      </div>

      {view === "geral" ? (
        <RelatoriosTab filtered={filtered} onApplyFilter={onApplyFilter} />
      ) : (
        <ResultadoPorCampanhaTable filtered={filtered} onApplyFilter={onApplyFilter} />
      )}
    </div>
  );
}
