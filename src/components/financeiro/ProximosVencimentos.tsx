import { upcomingDue, fmtBRL, formatIsoDate } from "@/lib/financeiro-entries";
import { ChartCard, ChartEmptyState } from "./financeiro-charts-shared";
import type { useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

export function ProximosVencimentos({
  filtered,
  onVerTodos,
}: {
  filtered: Filtered;
  onVerTodos: () => void;
}) {
  const items = upcomingDue(filtered.all, 8);

  return (
    <ChartCard title="Próximos vencimentos">
      {items.length === 0 ? (
        <ChartEmptyState message="Nenhum vencimento pendente. 🎉" />
      ) : (
        <>
          <ul className="divide-y divide-border/60">
            {items.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-1.5 text-xs">
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    e.status === "vencido"
                      ? "bg-rose-500/10 text-rose-600"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {formatIsoDate(e.vencimento)}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">{e.description}</span>
                <span className="shrink-0 text-muted-foreground">
                  {e.kind === "receita" ? "Recebimento" : "Pagamento"}
                </span>
                <span
                  className={`shrink-0 font-medium tabular-nums ${e.kind === "receita" ? "text-emerald-600" : "text-rose-600"}`}
                >
                  {fmtBRL(e.amount)}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onVerTodos}
            className="mt-2 cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            Ver todos
          </button>
        </>
      )}
    </ChartCard>
  );
}
