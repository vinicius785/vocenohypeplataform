import { useEffect, useMemo } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { LANCAMENTOS_SEGMENTS, type LancamentosSegment } from "@/lib/section-nav";
import { DUE_BUCKET_LABEL, fmtBRL, groupByDueBucket } from "@/lib/financeiro-entries";
import { MovimentacoesTab } from "./MovimentacoesTab";
import type { useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

const OPEN_STATUSES = new Set(["a_receber", "a_pagar", "vencido"]);

/** Lançamentos — a central operacional do Financeiro: UMA lista, sob o
 * contexto global de período (definido em `FinanceiroSection`), com o tipo
 * (Todos/Entradas/Saídas) no primeiro nível e todo o resto — status
 * ("A receber", "A pagar", "Vencido"…), cliente, campanha, categoria — dentro
 * de um único "Filtros". Quando o recorte é só "em aberto", uma linha de
 * faixas de vencimento resume o que vence quando (o que as antigas telas
 * A receber/A pagar mostravam em cartões). */
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
  const { setFilters, filters, visible } = filtered;

  // Entradas/Saídas ↔ `filters.tipo` (único eixo de tipo da lista).
  useEffect(() => {
    const tipo = segment === "entradas" ? "receita" : segment === "saidas" ? "despesa" : "todos";
    setFilters((f) => (f.tipo === tipo ? f : { ...f, tipo }));
  }, [segment, setFilters]);

  const onlyOpen = filters.status.length > 0 && filters.status.every((s) => OPEN_STATUSES.has(s));
  const buckets = useMemo(() => (onlyOpen ? groupByDueBucket(visible) : null), [onlyOpen, visible]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-4 max-w-full overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          <SegmentedControl
            aria-label="Tipo de lançamento"
            size="sm"
            value={segment}
            onChange={onSegmentChange}
            options={LANCAMENTOS_SEGMENTS.map((s) => ({ value: s.key, label: s.label }))}
          />
        </div>
      </div>

      {buckets && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
          <span>
            Em aberto{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {fmtBRL(Object.values(buckets).reduce((sum, b) => sum + b.total, 0))}
            </span>
          </span>
          {(["vencido", "vence_hoje", "proximos_7", "de_8_a_30", "acima_30"] as const).map((k) =>
            buckets[k].total > 0 ? (
              <span key={k} className={k === "vencido" ? "font-medium text-danger" : undefined}>
                {DUE_BUCKET_LABEL[k]}{" "}
                <span className="tabular-nums">{fmtBRL(buckets[k].total)}</span>
              </span>
            ) : null,
          )}
        </p>
      )}

      <MovimentacoesTab
        filtered={filtered}
        importOpen={importOpen}
        onImportOpenChange={onImportOpenChange}
        syncError={syncError}
        onSyncError={onSyncError}
      />
    </div>
  );
}
