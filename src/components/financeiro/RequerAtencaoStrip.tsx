import { ChevronRight } from "lucide-react";
import { alertItems, fmtBRL, type AlertKind } from "@/lib/financeiro-entries";
import type { AdvancedFilters, useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

const ALERT_LABEL: Record<AlertKind, string> = {
  vencido_receita: "recebimento(s) vencido(s)",
  vencido_despesa: "conta(s) vencida(s)",
  vence_em_breve_receita: "recebimento(s) vence(m) nos próximos 7 dias",
  vence_em_breve_despesa: "pagamento(s) vence(m) nos próximos 7 dias",
};

function patchFor(kind: AlertKind): Partial<AdvancedFilters> {
  const tipo = kind.endsWith("receita") ? "receita" : "despesa";
  const status = kind.startsWith("vencido")
    ? (["vencido"] as const)
    : tipo === "receita"
      ? (["a_receber"] as const)
      : (["a_pagar"] as const);
  return { tipo, status: [...status] };
}

/** Só aparece quando há algo relevante. Cada linha ocupa a largura
 * inteira e é clicável — cor só no indicador (bolinha), nunca no texto
 * inteiro. */
export function RequerAtencaoStrip({
  filtered,
  onApplyFilter,
}: {
  filtered: Filtered;
  onApplyFilter: (patch: Partial<AdvancedFilters>) => void;
}) {
  const items = alertItems(filtered.all);
  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Requer atenção
      </p>
      <div className="divide-y divide-border/60">
        {items.map((item) => (
          <button
            key={item.kind}
            type="button"
            onClick={() => onApplyFilter(patchFor(item.kind))}
            className="flex w-full cursor-pointer items-center gap-2.5 py-2 text-left text-sm hover:bg-muted/30"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                item.kind.startsWith("vencido") ? "bg-rose-500" : "bg-amber-500"
              }`}
            />
            <span className="min-w-0 flex-1 text-foreground">
              {item.count} {ALERT_LABEL[item.kind]}
              <span className="ml-1.5 tabular-nums text-muted-foreground">
                {fmtBRL(item.total)}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
