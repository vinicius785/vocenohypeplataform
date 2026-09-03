import { AlertCircle, Clock } from "lucide-react";
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

/** Só aparece quando há algo relevante — nunca uma faixa vazia. Cada item
 * é um texto compacto e clicável, sem card vermelho gigante. */
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
      <span className="flex shrink-0 items-center gap-1.5 font-medium text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5" />
        Requer atenção
      </span>
      {items.map((item) => (
        <button
          key={item.kind}
          type="button"
          onClick={() => onApplyFilter(patchFor(item.kind))}
          className={`inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 hover:underline ${
            item.kind.startsWith("vencido") ? "text-rose-600" : "text-amber-600"
          }`}
        >
          {item.kind.startsWith("vencido") ? (
            <AlertCircle className="h-3 w-3" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
          {item.count} {ALERT_LABEL[item.kind]} · {fmtBRL(item.total)}
        </button>
      ))}
    </div>
  );
}
