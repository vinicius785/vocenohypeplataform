import { ChevronRight, AlertTriangle } from "lucide-react";
import { alertItems, fmtBRL, type AlertItem, type AlertKind } from "@/lib/financeiro-entries";
import type { AdvancedFilters, useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

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

const SEVERITY_DOT: Record<AlertItem["severity"], string> = {
  alta: "bg-rose-500",
  media: "bg-amber-500",
  baixa: "bg-muted-foreground/50",
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
  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Requer atenção
      </p>
      <div className="divide-y divide-border/60">
        {items.map((item) => {
          const isAlta = item.severity === "alta";
          return (
            <button
              key={item.kind}
              type="button"
              onClick={() => onApplyFilter(patchFor(item.kind))}
              className={`flex w-full cursor-pointer items-center gap-2.5 py-2.5 text-left hover:bg-muted/30 ${
                isAlta ? "rounded-md bg-rose-500/5 px-2" : ""
              }`}
            >
              {isAlta ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              ) : (
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[item.severity]}`}
                />
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={`block ${isAlta ? "text-sm font-semibold text-foreground" : "text-sm text-foreground"}`}
                >
                  {ALERT_LABEL[item.kind](item.count)}
                  {item.total !== 0 && (
                    <span
                      className={`ml-1.5 tabular-nums ${isAlta ? "font-bold text-rose-600" : "text-muted-foreground"}`}
                    >
                      {fmtBRL(item.total)}
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {ACAO_RECOMENDADA[item.kind]}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
