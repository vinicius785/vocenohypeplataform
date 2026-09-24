import { ChevronLeft, ChevronRight } from "lucide-react";
import { adjacentCycle, cycleOptions, formatCompetenceLabel } from "../../lib/competencia";
import type { PublicCampaignCycle } from "@/lib/portal-types";

/**
 * Seletor de competência — só aparece em campanhas recorrentes, alinhado à
 * direita do cabeçalho. Nunca uma aba: navegação por seta + rótulo do mês
 * ativo, restrita aos ciclos que realmente existem nesta campanha (nunca
 * um mês "adivinhado"). Teclado: as setas já são `<button>` nativos,
 * então Tab/Enter/Espaço funcionam sem handler extra.
 */
export function CampaignCycleSelector({
  cycles,
  active,
  onChange,
}: {
  cycles: PublicCampaignCycle[] | undefined;
  active: PublicCampaignCycle | null;
  onChange: (cycle: PublicCampaignCycle) => void;
}) {
  const options = cycleOptions(cycles);
  if (options.length === 0) return null;

  const prev = adjacentCycle(cycles, active, -1);
  const next = adjacentCycle(cycles, active, 1);

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-1.5 py-1">
      <button
        type="button"
        onClick={() => prev && onChange(prev)}
        disabled={!prev}
        aria-label="Mês anterior"
        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[9rem] text-center text-xs font-medium text-foreground">
        {active ? formatCompetenceLabel(active) : "Selecione o mês"}
      </span>
      <button
        type="button"
        onClick={() => next && onChange(next)}
        disabled={!next}
        aria-label="Próximo mês"
        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
