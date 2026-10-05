import { useMemo } from "react";
import {
  AGING_BUCKET_LABEL,
  cashFlowSeries,
  fmtBRL,
  fmtMonth,
  groupByAging,
  groupByCategoria,
  groupByCliente,
  groupByDueBucket,
  prazoMedioLiquidacao,
} from "@/lib/financeiro-entries";
import { ChartCard } from "./financeiro-charts-shared";
import { ReceitaPorClienteChart } from "./ReceitaPorClienteChart";
import { DespesasPorCategoriaChart } from "./DespesasPorCategoriaChart";
import type { AdvancedFilters, useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

/** Análises (Geral) — só aparece o que tem dado. Cada análise com informação vira um bloco do
 * tamanho do que mostra; as sem dado não ocupam card: ficam numa lista curta ao final ("Sem dados
 * no momento"), uma linha cada. Olha o histórico inteiro (`all`), nunca o período da página — por
 * isso as classificações (cliente, categoria) usam `all`, não `visible`. Nenhuma métrica nova:
 * mesmas funções puras do domínio de sempre. */
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

  const receitas = useMemo(
    () => all.filter((e) => e.kind === "receita" && e.status !== "cancelado"),
    [all],
  );
  const bucketsReceber = useMemo(() => groupByDueBucket(receitas), [receitas]);
  const totalAberto = Object.values(bucketsReceber).reduce((s, b) => s + b.total, 0);
  const vencido = bucketsReceber.vencido;
  const agingReceber = useMemo(() => groupByAging(receitas), [receitas]);
  const agingRows = (Object.keys(agingReceber) as (keyof typeof agingReceber)[]).filter(
    (k) => agingReceber[k].count > 0,
  );

  const prazoRecebimento = useMemo(() => prazoMedioLiquidacao(all, "receita"), [all]);
  const prazoPagamento = useMemo(() => prazoMedioLiquidacao(all, "despesa"), [all]);

  const temReceitaPorCliente = useMemo(() => groupByCliente(all).length > 0, [all]);
  const temDespesaPorCategoria = useMemo(() => groupByCategoria(all, "despesa").length > 0, [all]);

  const temEvolucao = evolucaoMensal.length > 0;
  const temInadimplencia = vencido.count > 0;
  const temPrazo = prazoRecebimento != null || prazoPagamento != null;

  const semDados: { titulo: string; motivo: string }[] = [];
  if (!temEvolucao)
    semDados.push({
      titulo: "Evolução mensal",
      motivo: "aparece quando houver lançamentos liquidados.",
    });
  if (!temReceitaPorCliente)
    semDados.push({
      titulo: "Receita por cliente",
      motivo: "nenhuma receita vinculada a cliente ainda.",
    });
  if (!temDespesaPorCategoria)
    semDados.push({ titulo: "Despesas por categoria", motivo: "nenhuma despesa ainda." });
  if (!temInadimplencia)
    semDados.push({
      titulo: "Inadimplência e aging",
      motivo: totalAberto > 0 ? "nenhum recebível vencido." : "nenhum valor em aberto a receber.",
    });
  if (!temPrazo)
    semDados.push({
      titulo: "Prazo médio de liquidação",
      motivo: "aparece depois do primeiro lançamento liquidado.",
    });

  return (
    <div className="space-y-6">
      {temEvolucao && (
        <ChartCard title="Evolução mensal" description="Receitas, despesas e resultado realizados.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
                  <th className="py-2 pr-3 font-medium">Mês</th>
                  <th className="py-2 pr-3 text-right font-medium">Receitas</th>
                  <th className="py-2 pr-3 text-right font-medium">Despesas</th>
                  <th className="py-2 text-right font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {evolucaoMensal.map((p) => {
                  const resultado = p.receitaRealizada - p.despesaRealizada;
                  return (
                    <tr key={p.bucket}>
                      <td className="py-2 pr-3 font-medium text-foreground">
                        {fmtMonth(p.bucket)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-success">
                        {fmtBRL(p.receitaRealizada)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-danger">
                        {fmtBRL(p.despesaRealizada)}
                      </td>
                      <td
                        className={`py-2 text-right font-medium tabular-nums ${resultado >= 0 ? "text-success" : "text-danger"}`}
                      >
                        {fmtBRL(resultado)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      {(temReceitaPorCliente || temDespesaPorCategoria) && (
        <div
          className={`grid grid-cols-1 gap-6 ${
            temReceitaPorCliente && temDespesaPorCategoria ? "lg:grid-cols-2" : ""
          }`}
        >
          <ReceitaPorClienteChart entries={all} onApplyFilter={onApplyFilter} />
          <DespesasPorCategoriaChart entries={all} onApplyFilter={onApplyFilter} />
        </div>
      )}

      {temInadimplencia && (
        <ChartCard title="Inadimplência">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p className="text-2xl font-semibold tabular-nums text-danger">
              {fmtBRL(vencido.total)}
            </p>
            <p className="text-sm text-text-secondary">
              {vencido.count} recebível{vencido.count > 1 ? "is" : ""} vencido
              {vencido.count > 1 ? "s" : ""}
              {totalAberto > 0 &&
                ` · ${((vencido.total / totalAberto) * 100).toFixed(0)}% do que há em aberto`}
            </p>
          </div>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="py-2 pr-3 font-medium">Atraso</th>
                <th className="py-2 pr-3 text-right font-medium">Valor</th>
                <th className="py-2 text-right font-medium">Lançamentos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {agingRows.map((k) => (
                <tr key={k}>
                  <td className="py-2 pr-3 text-foreground">{AGING_BUCKET_LABEL[k]}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                    {fmtBRL(agingReceber[k].total)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-secondary">
                    {agingReceber[k].count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      )}

      {temPrazo && (
        <ChartCard
          title="Prazo médio de liquidação"
          description="Dias entre o vencimento e a liquidação, só sobre lançamentos já liquidados."
        >
          <dl className="grid grid-cols-2 gap-6">
            {prazoRecebimento != null && (
              <div>
                <dt className="text-xs text-text-secondary">Recebimento</dt>
                <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                  {prazoRecebimento}d
                </dd>
              </div>
            )}
            {prazoPagamento != null && (
              <div>
                <dt className="text-xs text-text-secondary">Pagamento</dt>
                <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                  {prazoPagamento}d
                </dd>
              </div>
            )}
          </dl>
        </ChartCard>
      )}

      {semDados.length > 0 && (
        <section aria-labelledby="fin-sem-dados">
          <h2
            id="fin-sem-dados"
            className="text-xs font-semibold uppercase tracking-wide text-text-secondary"
          >
            Sem dados no momento
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-text-secondary">
            {semDados.map((d) => (
              <li key={d.titulo}>
                <span className="font-medium text-foreground">{d.titulo}</span> — {d.motivo}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
