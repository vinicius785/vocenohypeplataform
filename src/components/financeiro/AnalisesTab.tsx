import { SegmentedControl } from "@/components/ui/segmented-control";
import { ANALISES_VIEWS, type AnalisesView } from "@/lib/section-nav";
import { RelatoriosTab } from "./RelatoriosTab";
import { ResultadoPorCampanhaTable } from "./ResultadoPorCampanhaTable";
import type { AdvancedFilters, useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

/** Análises — entender os resultados. "Geral" são os indicadores da carteira
 * inteira (evolução mensal, inadimplência, prazo médio, aging…); "Por
 * campanha" é o resultado de cada campanha NO PERÍODO global da página (só
 * essa visão depende dele, então só nela o seletor de período aparece —
 * ver `FinanceiroSection`). */
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
      </div>

      {view === "geral" ? (
        <RelatoriosTab filtered={filtered} onApplyFilter={onApplyFilter} />
      ) : (
        <ResultadoPorCampanhaTable filtered={filtered} onApplyFilter={onApplyFilter} />
      )}
    </div>
  );
}
