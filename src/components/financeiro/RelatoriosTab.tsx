import { useMemo } from "react";
import {
  AGING_BUCKET_LABEL,
  cashFlowSeries,
  fmtBRL,
  fmtMonth,
  groupByAging,
  groupByDueBucket,
  prazoMedioLiquidacao,
  valoresSemVinculo,
} from "@/lib/financeiro-entries";
import { ChartCard, ChartEmptyState } from "./financeiro-charts-shared";
import { ReceitaPorClienteChart } from "./ReceitaPorClienteChart";
import { DespesasPorCategoriaChart } from "./DespesasPorCategoriaChart";
import type { AdvancedFilters, useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

/** Relatórios — cada bloco responde diretamente uma pergunta financeira,
 * usando só os dados/funções que já existem no domínio (nenhuma métrica
 * fictícia). Olha o histórico inteiro (`all`), não o período selecionado
 * no topo — um relatório de evolução mensal não faz sentido recortado
 * pelo período de "hoje" ou "esta semana". */
export function RelatoriosTab({
  filtered,
  onApplyFilter,
}: {
  filtered: Filtered;
  onApplyFilter: (patch: Partial<AdvancedFilters>) => void;
}) {
  const { all } = filtered;

  const evolucaoMensal = useMemo(() => {
    const liquidados = all.filter((e) => e.payment?.pagamento && e.status !== "cancelado");
    return cashFlowSeries(liquidados, "month").slice(-6);
  }, [all]);

  const aReceberAberto = useMemo(
    () => all.filter((e) => e.kind === "receita" && e.status !== "cancelado"),
    [all],
  );
  const aPagarAberto = useMemo(
    () => all.filter((e) => e.kind === "despesa" && e.status !== "cancelado"),
    [all],
  );
  const bucketsReceber = useMemo(() => groupByDueBucket(aReceberAberto), [aReceberAberto]);
  const totalAberto = Object.values(bucketsReceber).reduce((s, b) => s + b.total, 0);
  const inadimplenciaPct =
    totalAberto > 0 ? (bucketsReceber.vencido.total / totalAberto) * 100 : null;

  const agingReceber = useMemo(() => groupByAging(aReceberAberto), [aReceberAberto]);
  const semVinculo = useMemo(() => valoresSemVinculo(all), [all]);

  const prazoRecebimento = useMemo(() => prazoMedioLiquidacao(all, "receita"), [all]);
  const prazoPagamento = useMemo(() => prazoMedioLiquidacao(all, "despesa"), [all]);

  return (
    <div className="space-y-6">
      <ChartCard title="Evolução mensal — receitas, despesas e resultado (realizado)">
        {evolucaoMensal.length === 0 ? (
          <ChartEmptyState message="Nenhum lançamento liquidado ainda para compor a evolução mensal." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Mês</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Receitas</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Despesas</th>
                  <th className="py-1.5 text-right font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {evolucaoMensal.map((p) => {
                  const resultado = p.receitaRealizada - p.despesaRealizada;
                  return (
                    <tr key={p.bucket}>
                      <td className="py-1.5 pr-3 font-medium text-foreground">
                        {fmtMonth(p.bucket)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-success">
                        {fmtBRL(p.receitaRealizada)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-danger">
                        {fmtBRL(p.despesaRealizada)}
                      </td>
                      <td
                        className={`py-1.5 text-right font-medium tabular-nums ${resultado >= 0 ? "text-success" : "text-danger"}`}
                      >
                        {fmtBRL(resultado)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Inadimplência">
          {inadimplenciaPct == null ? (
            <ChartEmptyState message="Nenhum valor em aberto — nada a receber para calcular inadimplência." />
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums text-foreground">
                {inadimplenciaPct.toFixed(1)}%
              </p>
              <p className="text-[11px] text-muted-foreground">
                {fmtBRL(bucketsReceber.vencido.total)} vencidos de {fmtBRL(totalAberto)} em aberto
                (toda a carteira de receitas)
              </p>
            </>
          )}
        </ChartCard>

        <ChartCard title="Prazo médio de liquidação">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-semibold tabular-nums text-foreground">
                {prazoRecebimento == null ? "—" : `${prazoRecebimento}d`}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Recebimento (vencimento → liquidação)
              </p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-foreground">
                {prazoPagamento == null ? "—" : `${prazoPagamento}d`}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Pagamento (vencimento → liquidação)
              </p>
            </div>
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Aging de recebíveis vencidos">
        {Object.values(agingReceber).every((b) => b.count === 0) ? (
          <ChartEmptyState message="Nenhum recebível vencido." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(Object.keys(agingReceber) as (keyof typeof agingReceber)[]).map((k) => (
              <div key={k} className="rounded-lg border border-border p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {AGING_BUCKET_LABEL[k]}
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {fmtBRL(agingReceber[k].total)}
                </p>
                <p className="text-[10px] text-muted-foreground">{agingReceber[k].count} lanç.</p>
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ReceitaPorClienteChart filtered={filtered} onApplyFilter={onApplyFilter} />
        <DespesasPorCategoriaChart filtered={filtered} onApplyFilter={onApplyFilter} />
      </div>

      <ChartCard title="Valores sem vínculo">
        {semVinculo.count === 0 ? (
          <ChartEmptyState message="Todo lançamento em aberto está vinculado a cliente e campanha." />
        ) : (
          <button
            type="button"
            onClick={() => onApplyFilter({ tipo: "todos" })}
            className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-left text-xs hover:bg-warning-soft/70"
          >
            <span className="text-foreground">
              {semVinculo.count} lançamento{semVinculo.count > 1 ? "s" : ""} em aberto sem cliente
              ou sem campanha vinculada
            </span>
            <span className="font-medium tabular-nums text-foreground">
              {fmtBRL(semVinculo.total)}
            </span>
          </button>
        )}
      </ChartCard>

      <p className="text-[11px] text-muted-foreground">
        Rentabilidade por campanha e o toggle contratado/realizado vivem na aba{" "}
        <span className="font-medium text-foreground">Campanhas</span>, pra não duplicar a mesma
        tabela em dois lugares.
      </p>
    </div>
  );
}
