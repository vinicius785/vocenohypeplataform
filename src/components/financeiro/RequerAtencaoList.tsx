import { useState } from "react";
import { AlertTriangle, ChevronDown, Circle } from "lucide-react";
import { alertItems, fmtBRL, type AlertItem, type AlertKind } from "@/lib/financeiro-entries";
import type { AdvancedFilters, useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";
import { ListRow } from "@/components/shared/ListRow";
import { SECONDARY_SURFACE } from "./PosicaoFinanceira";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

const ALERT_LABEL: Record<AlertKind, (n: number) => string> = {
  vencido_receita: (n) => `${n} recebimento${n > 1 ? "s" : ""} vencido${n > 1 ? "s" : ""}`,
  vencido_despesa: (n) => `${n} pagamento${n > 1 ? "s" : ""} vencido${n > 1 ? "s" : ""}`,
  vence_hoje_receita: (n) => `${n} recebimento${n > 1 ? "s" : ""} vence${n > 1 ? "m" : ""} hoje`,
  vence_hoje_despesa: (n) => `${n} pagamento${n > 1 ? "s" : ""} vence${n > 1 ? "m" : ""} hoje`,
  vence_em_breve_receita: (n) =>
    `${n} recebimento${n > 1 ? "s" : ""} vence${n > 1 ? "m" : ""} nos próximos 7 dias`,
  vence_em_breve_despesa: (n) =>
    `${n} pagamento${n > 1 ? "s" : ""} vence${n > 1 ? "m" : ""} nos próximos 7 dias`,
  sem_cliente: (n) => `${n} lançamento${n > 1 ? "s" : ""} em aberto sem cliente/favorecido`,
  sem_categoria: (n) => `${n} lançamento${n > 1 ? "s" : ""} em aberto sem categoria`,
  sem_campanha: (n) => `${n} lançamento${n > 1 ? "s" : ""} com cliente mas sem campanha vinculada`,
  risco_saldo_negativo: () => "Risco de saldo negativo dentro do horizonte de projeção",
};

const ACAO_RECOMENDADA: Record<AlertKind, string> = {
  vencido_receita: "Cobrar agora",
  vencido_despesa: "Regularizar agora",
  vence_hoje_receita: "Confirmar recebimento",
  vence_hoje_despesa: "Confirmar pagamento",
  vence_em_breve_receita: "Acompanhar",
  vence_em_breve_despesa: "Planejar caixa",
  sem_cliente: "Vincular cliente",
  sem_categoria: "Categorizar",
  sem_campanha: "Vincular campanha",
  risco_saldo_negativo: "Revisar fluxo de caixa",
};

function patchFor(kind: AlertKind): Partial<AdvancedFilters> {
  if (kind === "risco_saldo_negativo") return {};
  if (kind === "sem_cliente") return { tipo: "todos" };
  if (kind === "sem_categoria") return { tipo: "todos" };
  if (kind === "sem_campanha") return { tipo: "todos" };
  const tipo = kind.endsWith("receita") ? "receita" : "despesa";
  const status = kind.startsWith("vencido")
    ? (["vencido"] as const)
    : tipo === "receita"
      ? (["a_receber"] as const)
      : (["a_pagar"] as const);
  return { tipo, status: [...status] };
}

const SEVERITY_TONE: Record<AlertItem["severity"], "danger" | "warning" | "neutral"> = {
  alta: "danger",
  media: "warning",
  baixa: "neutral",
};

/** "Requer atenção" — lista de ações priorizadas, não um mural de avisos
 * genéricos. Gravidade alta some primeiro e ganha destaque visual
 * proporcional (nunca um valor vencido de 6 dígitos com o mesmo peso de um
 * lançamento sem categoria). Olha o histórico inteiro (`all`), não só o
 * período ativo. */
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

  const COMPACT_COUNT = 2;
  const visibleItems = expanded ? items : items.slice(0, COMPACT_COUNT);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <div className={`rounded-[24px] ${SECONDARY_SURFACE} p-5`}>
      <p className="text-[15px] font-semibold text-foreground">Requer atenção</p>
      <div className="-mx-2 mt-2 divide-y divide-border">
        {visibleItems.map((item) => {
          const isAlta = item.severity === "alta";
          return (
            <ListRow
              key={item.kind}
              icon={
                isAlta ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <Circle className="h-2.5 w-2.5 fill-current" />
                )
              }
              iconTone={SEVERITY_TONE[item.severity]}
              title={ALERT_LABEL[item.kind](item.count)}
              description={ACAO_RECOMENDADA[item.kind]}
              value={item.total !== 0 ? fmtBRL(item.total) : undefined}
              onClick={() => onApplyFilter(patchFor(item.kind))}
            />
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 flex w-full cursor-pointer items-center gap-1 px-2 py-1.5 text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ChevronDown className="h-3.5 w-3.5" />+{hiddenCount} outro{hiddenCount > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
