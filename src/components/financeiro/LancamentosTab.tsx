import { useEffect } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { LANCAMENTOS_SEGMENTS, type LancamentosSegment } from "@/lib/section-nav";
import { MovimentacoesTab } from "./MovimentacoesTab";
import { PendingKindTab } from "./PendingKindTab";
import { PeriodPicker } from "./PeriodPicker";
import type { useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

/** Lançamentos — a central operacional do Financeiro. Substitui as antigas
 * áreas Movimentações / A receber / A pagar: agora são só SEGMENTAÇÕES da
 * mesma lista.
 *  - Todos / Entradas / Saídas: lançamentos do período (por vencimento),
 *    com os filtros avançados — Entradas = receitas, Saídas = despesas
 *    (mesmo `filters.tipo` que a barra de filtros já usava).
 *  - A receber / A pagar: TODA a carteira em aberto daquele tipo (não só o
 *    período — uma conta que vence em 40 dias continua aparecendo), então o
 *    seletor de período não se aplica e some. */
export function LancamentosTab({
  filtered,
  segment,
  onSegmentChange,
  importOpen,
  onImportOpenChange,
  syncError,
  onSyncError,
}: {
  filtered: Filtered;
  segment: LancamentosSegment;
  onSegmentChange: (s: LancamentosSegment) => void;
  importOpen: boolean;
  onImportOpenChange: (open: boolean) => void;
  syncError: string | null;
  onSyncError: (msg: string | null) => void;
}) {
  const { setFilters } = filtered;

  // Entradas/Saídas ↔ `filters.tipo` (único eixo de tipo da lista). Nas
  // segmentações da carteira em aberto o tipo vem do próprio segmento.
  useEffect(() => {
    const tipo = segment === "entradas" ? "receita" : segment === "saidas" ? "despesa" : "todos";
    if (segment === "a-receber" || segment === "a-pagar") return;
    setFilters((f) => (f.tipo === tipo ? f : { ...f, tipo }));
  }, [segment, setFilters]);

  const periodScoped = segment !== "a-receber" && segment !== "a-pagar";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-4 max-w-full overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          <SegmentedControl
            aria-label="Segmentação dos lançamentos"
            size="sm"
            value={segment}
            onChange={onSegmentChange}
            options={LANCAMENTOS_SEGMENTS.map((s) => ({ value: s.key, label: s.label }))}
          />
        </div>
        {periodScoped && <PeriodPicker filtered={filtered} />}
      </div>

      {periodScoped ? (
        <MovimentacoesTab
          filtered={filtered}
          importOpen={importOpen}
          onImportOpenChange={onImportOpenChange}
          syncError={syncError}
          onSyncError={onSyncError}
        />
      ) : (
        <PendingKindTab
          filtered={filtered}
          kind={segment === "a-receber" ? "receita" : "despesa"}
        />
      )}
    </div>
  );
}
