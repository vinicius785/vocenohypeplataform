import { useState } from "react";
import { AlertTriangle, ChevronDown, Circle } from "lucide-react";
import { alertItems, fmtBRL, type AlertItem, type AlertKind } from "@/lib/financeiro-entries";
import { Button } from "@/components/ui/button";
import type { AdvancedFilters, useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";
import { SECONDARY_SURFACE } from "./PosicaoFinanceira";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const ALERT_LABEL: Record<AlertKind, (n: number) => string> = {
  vencido_receita: (n) => `${n} ${plural(n, "recebimento vencido", "recebimentos vencidos")}`,
  vencido_despesa: (n) => `${n} ${plural(n, "pagamento vencido", "pagamentos vencidos")}`,
  vence_hoje_receita: (n) =>
    `${n} ${plural(n, "recebimento vence hoje", "recebimentos vencem hoje")}`,
  vence_hoje_despesa: (n) => `${n} ${plural(n, "pagamento vence hoje", "pagamentos vencem hoje")}`,
  vence_em_breve_receita: (n) =>
    `${n} ${plural(n, "recebimento vence", "recebimentos vencem")} nos próximos 7 dias`,
  vence_em_breve_despesa: (n) =>
    `${n} ${plural(n, "pagamento vence", "pagamentos vencem")} nos próximos 7 dias`,
  sem_cliente: (n) => `${n} ${plural(n, "lançamento", "lançamentos")} em aberto sem cliente`,
  sem_categoria: (n) => `${n} ${plural(n, "lançamento", "lançamentos")} em aberto sem categoria`,
  sem_campanha: (n) =>
    `${n} ${plural(n, "lançamento", "lançamentos")} com cliente, mas sem campanha`,
  risco_saldo_negativo: () => "Risco de saldo negativo dentro do horizonte de projeção",
};

/** Texto do botão: o caminho para resolver, não só o aviso. */
const ACTION_LABEL: Record<AlertKind, string> = {
  vencido_receita: "Ver recebimentos",
  vencido_despesa: "Ver pagamentos",
  vence_hoje_receita: "Ver recebimentos",
  vence_hoje_despesa: "Ver pagamentos",
  vence_em_breve_receita: "Ver recebimentos",
  vence_em_breve_despesa: "Ver pagamentos",
  sem_cliente: "Vincular cliente",
  sem_categoria: "Categorizar",
  sem_campanha: "Vincular campanha",
  risco_saldo_negativo: "Ver projeção",
};

function patchFor(kind: AlertKind): Partial<AdvancedFilters> {
  if (kind === "risco_saldo_negativo") return {};
  if (kind === "sem_cliente") return { tipo: "todos", vinculo: "sem_cliente" };
  if (kind === "sem_categoria") return { tipo: "todos", vinculo: "sem_categoria" };
  if (kind === "sem_campanha") return { tipo: "todos", vinculo: "sem_campanha" };
  const tipo = kind.endsWith("receita") ? "receita" : "despesa";
  const status = kind.startsWith("vencido")
    ? (["vencido"] as const)
    : tipo === "receita"
      ? (["a_receber"] as const)
      : (["a_pagar"] as const);
  return { tipo, status: [...status] };
}

const ICON_TONE: Record<AlertItem["severity"], string> = {
  alta: "text-danger",
  media: "text-warning",
  baixa: "text-text-secondary",
};

/** "Precisa de atenção" — lista de ações priorizadas: cada linha diz o que há, quanto vale e
 * traz o botão que leva ao caminho de resolução (a lista de Lançamentos já filtrada). Gravidade
 * alta vem primeiro. Olha o histórico inteiro (`all`), não só o período ativo. Some inteira
 * quando não há nada. */
export function RequerAtencaoList({
  filtered,
  saldoProjetado,
  onApplyFilter,
}: {
  filtered: Filtered;
  saldoProjetado: number | null;
  onApplyFilter: (patch: Partial<AdvancedFilters>) => void;
}) {
  const items = alertItems(filtered.all, 7, saldoProjetado);
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const COMPACT_COUNT = 3;
  const visibleItems = expanded ? items : items.slice(0, COMPACT_COUNT);
  const hiddenCount = items.length - visibleItems.length;

  const act = (kind: AlertKind) => {
    if (kind === "risco_saldo_negativo") {
      document.getElementById("projecao-caixa")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    onApplyFilter(patchFor(kind));
  };

  return (
    <section aria-labelledby="fin-atencao" className={`rounded-2xl ${SECONDARY_SURFACE} p-5`}>
      <h2 id="fin-atencao" className="text-[15px] font-semibold text-foreground">
        Precisa de atenção
      </h2>
      <ul className="mt-2 divide-y divide-border">
        {visibleItems.map((item) => (
          <li key={item.kind} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
            <span className={`shrink-0 ${ICON_TONE[item.severity]}`} aria-hidden="true">
              {item.severity === "alta" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Circle className="h-2.5 w-2.5 fill-current" />
              )}
            </span>
            <p className="min-w-0 flex-1 basis-48 text-sm text-foreground">
              {ALERT_LABEL[item.kind](item.count)}
            </p>
            {item.total !== 0 && (
              <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                {fmtBRL(item.total)}
              </span>
            )}
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => act(item.kind)}>
              {ACTION_LABEL[item.kind]}
            </Button>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 flex w-full cursor-pointer items-center gap-1 py-1.5 text-xs font-medium text-text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ChevronDown className="h-3.5 w-3.5" />+{hiddenCount} outro{hiddenCount > 1 ? "s" : ""}
        </button>
      )}
    </section>
  );
}
