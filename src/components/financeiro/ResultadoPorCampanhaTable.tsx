import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { groupByCampanha, fmtBRL, type CampanhaResultado } from "@/lib/financeiro-entries";
import { ChartCard, ChartEmptyState } from "./financeiro-charts-shared";
import type { AdvancedFilters, useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;
type SortKey = "receita" | "custos" | "resultado" | "margem";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "receita", label: "Maior receita" },
  { value: "custos", label: "Maior custo" },
  { value: "resultado", label: "Maior resultado" },
  { value: "margem", label: "Maior margem" },
];

export function ResultadoPorCampanhaTable({
  filtered,
  onApplyFilter,
}: {
  filtered: Filtered;
  onApplyFilter: (patch: Partial<AdvancedFilters>) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("receita");
  const [ascending, setAscending] = useState(false);

  const rows: CampanhaResultado[] = useMemo(() => {
    const grouped = groupByCampanha(filtered.visible);
    const sorted = [...grouped].sort((a, b) => a[sortKey] - b[sortKey]);
    return ascending ? sorted : sorted.reverse();
  }, [filtered.visible, sortKey, ascending]);

  return (
    <ChartCard
      title="Resultado por campanha"
      action={
        <div className="flex items-center gap-1.5">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-7 cursor-pointer rounded-md border border-border bg-background px-1.5 text-[11px] outline-none focus:ring-2 focus:ring-ring"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAscending((v) => !v)}
            className="cursor-pointer rounded-md border border-border p-1 hover:bg-muted"
            aria-label="Inverter ordem"
          >
            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <ChartEmptyState message="Nenhuma campanha possui movimentação financeira neste período." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Campanha</th>
                <th className="py-1.5 pr-3 font-medium">Cliente</th>
                <th className="py-1.5 pr-3 text-right font-medium">Receita</th>
                <th className="py-1.5 pr-3 text-right font-medium">Custos</th>
                <th className="py-1.5 pr-3 text-right font-medium">Resultado</th>
                <th className="py-1.5 text-right font-medium">Margem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((r) => (
                <tr
                  key={r.campanhaId}
                  onClick={() => onApplyFilter({ campanhaId: r.campanhaId })}
                  className="cursor-pointer hover:bg-muted/40"
                >
                  <td className="py-1.5 pr-3 font-medium text-foreground">{r.campanhaNome}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{r.clienteNome}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtBRL(r.receita)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtBRL(r.custos)}</td>
                  <td
                    className={`py-1.5 pr-3 text-right font-medium tabular-nums ${r.resultado >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                  >
                    {fmtBRL(r.resultado)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {r.margem.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
