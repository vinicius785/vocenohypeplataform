import { useMemo } from "react";
import { groupByCategoria, fmtBRL, type Entry } from "@/lib/financeiro-entries";
import { ChartCard } from "./financeiro-charts-shared";
import type { AdvancedFilters } from "./useFinanceiroFilteredEntries";

/** Ranking compacto — texto + barra proporcional fina, nunca um gráfico
 * grande só pra mostrar uma categoria com 100%. */
export function DespesasPorCategoriaChart({
  entries,
  onApplyFilter,
}: {
  entries: Entry[];
  onApplyFilter: (patch: Partial<AdvancedFilters>) => void;
}) {
  const rows = useMemo(() => {
    const grouped = groupByCategoria(entries, "despesa");
    const total = grouped.reduce((s, g) => s + g.total, 0);
    return grouped.map((g) => ({ ...g, pct: total > 0 ? (g.total / total) * 100 : 0 }));
  }, [entries]);

  if (rows.length === 0) return null;
  return (
    <ChartCard title="Despesas por categoria">
      {
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.categoria}>
              <button
                type="button"
                onClick={() => onApplyFilter({ tipo: "despesa", categoria: r.categoria })}
                className="flex w-full cursor-pointer items-center justify-between gap-2 text-left text-xs hover:text-foreground"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">{r.categoria}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {fmtBRL(r.total)} · {r.pct.toFixed(0)}%
                </span>
              </button>
              <div className="mt-1 h-1 w-full rounded-full bg-muted">
                <div
                  className="h-1 rounded-full bg-foreground/60"
                  style={{ width: `${Math.max(r.pct, 2)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      }
    </ChartCard>
  );
}
