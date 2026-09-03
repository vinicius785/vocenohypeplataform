import { useMemo } from "react";
import { groupByCliente, revenueConcentration, fmtBRL } from "@/lib/financeiro-entries";
import { ChartCard, ChartEmptyState } from "./financeiro-charts-shared";
import type { AdvancedFilters, useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

/** Ranking compacto — texto + barra proporcional fina, nunca um gráfico
 * grande só pra mostrar um cliente com 100%. */
export function ReceitaPorClienteChart({
  filtered,
  onApplyFilter,
}: {
  filtered: Filtered;
  onApplyFilter: (patch: Partial<AdvancedFilters>) => void;
}) {
  const byCliente = useMemo(() => groupByCliente(filtered.visible), [filtered.visible]);
  const rows = useMemo(() => {
    const total = byCliente.reduce((s, c) => s + c.total, 0);
    return byCliente.map((c) => ({ ...c, pct: total > 0 ? (c.total / total) * 100 : 0 }));
  }, [byCliente]);
  const concentration = useMemo(() => revenueConcentration(byCliente), [byCliente]);

  return (
    <ChartCard title="Receita por cliente">
      {rows.length === 0 ? (
        <ChartEmptyState message="Nenhuma receita vinculada a clientes neste período." />
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.clienteId}>
                <button
                  type="button"
                  onClick={() => onApplyFilter({ clienteId: r.clienteId })}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 text-left text-xs hover:text-foreground"
                >
                  <span className="min-w-0 flex-1 truncate text-foreground">{r.clienteNome}</span>
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
          {rows.length > 1 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Top 1 cliente {concentration.top1Pct.toFixed(0)}% da receita · Top 3 clientes{" "}
              {concentration.top3Pct.toFixed(0)}% da receita
            </p>
          )}
        </>
      )}
    </ChartCard>
  );
}
