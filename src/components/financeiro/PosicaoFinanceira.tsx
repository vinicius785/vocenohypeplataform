import {
  computeSaldoAtual,
  computeSaldoProjetado,
  groupByDueBucket,
  projectionHorizonTo,
  resultadoRealizado,
  PROJECTION_HORIZON_OPTIONS,
  type Entry,
  type ProjectionHorizon,
} from "@/lib/financeiro-entries";
import type { DateRange } from "@/components/financeiro/useFinanceiroFilteredEntries";
import type { SaldoInicialConfig } from "@/lib/financeiro-saldo-inicial-store";
import { IndicatorCard } from "./IndicatorCard";

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Os 7 indicadores principais da Visão Geral — cada um com período
 * considerado, tooltip e estado de indisponibilidade explícito. Nunca
 * mostra R$ 0,00 no lugar de um dado que não existe (ver `IndicatorCard`).
 */
export function PosicaoFinanceira({
  all,
  visible,
  previousVisible,
  range,
  saldoInicial,
  horizon,
  onHorizonChange,
  onConfigureSaldo,
  onNavigateToAReceber,
  onNavigateToAPagar,
}: {
  all: Entry[];
  visible: Entry[];
  previousVisible: Entry[];
  range: DateRange;
  saldoInicial: SaldoInicialConfig;
  horizon: ProjectionHorizon;
  onHorizonChange: (h: ProjectionHorizon) => void;
  onConfigureSaldo: () => void;
  onNavigateToAReceber: () => void;
  onNavigateToAPagar: () => void;
}) {
  const realizadoAtual = resultadoRealizado(visible, range);
  const realizadoAnterior = resultadoRealizado(previousVisible, range);
  const saldoAtual = computeSaldoAtual(saldoInicial, all);
  const horizonTo = projectionHorizonTo(horizon);
  const saldoProjetado = computeSaldoProjetado(saldoAtual, all, horizonTo);
  const bucketsReceita = groupByDueBucket(all.filter((e) => e.kind === "receita"));
  const bucketsDespesa = groupByDueBucket(all.filter((e) => e.kind === "despesa"));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <IndicatorCard
          label="Saldo atual"
          value={saldoAtual}
          unavailableReason="Saldo não configurado"
          periodo="Hoje"
          tooltip="Saldo inicial informado + tudo que foi recebido/pago desde então. Sem um saldo inicial configurado, este número nunca é estimado."
          tone="primary"
          action={{ label: "Configurar saldo", onClick: onConfigureSaldo }}
        />
        <IndicatorCard
          label="Entradas realizadas"
          value={realizadoAtual.receita}
          periodo={`Período selecionado · liquidado`}
          comparison={
            pctDelta(realizadoAtual.receita, realizadoAnterior.receita) != null
              ? {
                  deltaPct: pctDelta(realizadoAtual.receita, realizadoAnterior.receita)!,
                  label: "vs. período anterior",
                }
              : null
          }
          tooltip="Soma dos recebimentos efetivamente liquidados (data de recebimento) dentro do período selecionado — nunca inclui contas a receber em aberto."
          tone="success"
        />
        <IndicatorCard
          label="Saídas realizadas"
          value={realizadoAtual.despesa}
          periodo={`Período selecionado · liquidado`}
          comparison={
            pctDelta(realizadoAtual.despesa, realizadoAnterior.despesa) != null
              ? {
                  deltaPct: pctDelta(realizadoAtual.despesa, realizadoAnterior.despesa)!,
                  label: "vs. período anterior",
                }
              : null
          }
          tooltip="Soma dos pagamentos efetivamente liquidados (data de pagamento) dentro do período selecionado — nunca inclui contas a pagar em aberto."
          tone="danger"
        />
        <IndicatorCard
          label="Resultado realizado"
          value={realizadoAtual.resultado}
          periodo={`Período selecionado · liquidado`}
          tooltip="Entradas realizadas − saídas realizadas, no período selecionado. Contas a receber/pagar em aberto nunca entram nesta conta."
          tone={realizadoAtual.resultado >= 0 ? "success" : "danger"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <IndicatorCard
            label="Saldo projetado"
            value={saldoProjetado}
            unavailableReason="Depende do saldo atual"
            periodo={PROJECTION_HORIZON_OPTIONS.find((o) => o.value === horizon)?.label ?? ""}
            tooltip="Saldo atual + recebimentos em aberto − pagamentos em aberto, considerando só o que vence dentro do horizonte escolhido — nunca a carteira inteira em aberto."
            tone={saldoProjetado != null && saldoProjetado < 0 ? "danger" : "primary"}
          />
          <div className="mt-1.5 flex justify-end">
            <select
              value={horizon}
              onChange={(e) => onHorizonChange(e.target.value as ProjectionHorizon)}
              className="h-7 cursor-pointer rounded-md border border-border bg-background px-1.5 text-[11px] outline-none focus:ring-2 focus:ring-ring"
            >
              {PROJECTION_HORIZON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <IndicatorCard
          label="Total vencido a receber"
          value={bucketsReceita.vencido.total}
          periodo={`${bucketsReceita.vencido.count} lançamento${bucketsReceita.vencido.count === 1 ? "" : "s"} · toda a carteira`}
          tooltip="Soma de tudo que já venceu e ainda não foi recebido, em toda a carteira (não só o período selecionado)."
          tone={bucketsReceita.vencido.total > 0 ? "danger" : "neutral"}
          onClick={onNavigateToAReceber}
        />
        <IndicatorCard
          label="Total vencido a pagar"
          value={bucketsDespesa.vencido.total}
          periodo={`${bucketsDespesa.vencido.count} lançamento${bucketsDespesa.vencido.count === 1 ? "" : "s"} · toda a carteira`}
          tooltip="Soma de tudo que já venceu e ainda não foi pago, em toda a carteira (não só o período selecionado)."
          tone={bucketsDespesa.vencido.total > 0 ? "danger" : "neutral"}
          onClick={onNavigateToAPagar}
        />
      </div>
    </div>
  );
}
