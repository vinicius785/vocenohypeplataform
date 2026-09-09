import { ResultadoPorCampanhaTable } from "./ResultadoPorCampanhaTable";
import type { AdvancedFilters, useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

/** Resultado por campanha promovido a aba própria — antes vivia dentro da
 * Visão Geral, competindo por espaço com o essencial de "como estamos
 * agora". Usa os mesmos dados já filtrados pelo período selecionado no
 * topo, sem query própria. */
export function CampanhasTab({
  filtered,
  onApplyFilter,
}: {
  filtered: Filtered;
  onApplyFilter: (patch: Partial<AdvancedFilters>) => void;
}) {
  return (
    <div className="space-y-6">
      <ResultadoPorCampanhaTable filtered={filtered} onApplyFilter={onApplyFilter} />
    </div>
  );
}
