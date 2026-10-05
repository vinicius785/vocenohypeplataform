import {
  computeSaldoAtual,
  resultadoRealizado,
  fmtBRL,
  type Entry,
} from "@/lib/financeiro-entries";
import type { DateRange } from "@/components/financeiro/useFinanceiroFilteredEntries";
import type { SaldoInicialConfig } from "@/lib/financeiro-saldo-inicial-store";
import { KpiCell, KpiStrip } from "@/components/shared/Kpi";

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Superfície dos blocos secundários do Resumo (lista de pendências,
 * gráfico): um único nível de card, sem card dentro de card. */
export const SECONDARY_SURFACE =
  "bg-card border border-border/60 dark:border-0 dark:bg-[oklch(0.17_0_0)]";

/** Variação contra o período anterior — verde/vermelho só aqui, que é onde a
 * cor carrega significado. */
function Delta({ delta, goodWhenUp = true }: { delta: number | null; goodWhenUp?: boolean }) {
  if (delta == null) return null;
  const good = goodWhenUp ? delta >= 0 : delta <= 0;
  return (
    <span className={good ? "text-success-soft-foreground" : "text-danger-soft-foreground"}>
      {delta >= 0 ? "+" : ""}
      {delta.toFixed(0)}% vs. período anterior
    </span>
  );
}

/** Posição financeira — "como estamos?" numa faixa de KPIs só (componente
 * `KpiStrip`): saldo atual, entradas, saídas e resultado, todos com
 * o mesmo tratamento. O saldo é um número do Resumo, não um cabeçalho. Mesmas
 * funções puras de sempre (`computeSaldoAtual`/`computeSaldoProjetado`/
 * `resultadoRealizado`). */
export function PosicaoResumo({
  all,
  visible,
  previousVisible,
  range,
  saldoInicial,
  onConfigureSaldo,
}: {
  all: Entry[];
  visible: Entry[];
  previousVisible: Entry[];
  range: DateRange;
  saldoInicial: SaldoInicialConfig;
  onConfigureSaldo: () => void;
}) {
  const saldoAtual = computeSaldoAtual(saldoInicial, all);
  const atual = resultadoRealizado(visible, range);
  const anterior = resultadoRealizado(previousVisible, range);

  const linkCls =
    "rounded text-[11px] text-text-secondary hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <KpiStrip aria-label="Posição financeira">
      <KpiCell
        label="Saldo atual"
        value={saldoAtual != null ? fmtBRL(saldoAtual) : "—"}
        complement={
          <button type="button" onClick={onConfigureSaldo} className={linkCls}>
            {saldoAtual != null ? "Editar saldo inicial" : "Configurar saldo inicial"}
          </button>
        }
      />
      <KpiCell
        label="Entradas realizadas"
        value={fmtBRL(atual.receita)}
        complement={<Delta delta={pctDelta(atual.receita, anterior.receita)} />}
      />
      <KpiCell
        label="Saídas realizadas"
        value={fmtBRL(atual.despesa)}
        complement={<Delta delta={pctDelta(atual.despesa, anterior.despesa)} goodWhenUp={false} />}
      />
      <KpiCell
        label="Resultado"
        value={`${atual.resultado >= 0 ? "+" : ""}${fmtBRL(atual.resultado)}`}
      />
    </KpiStrip>
  );
}
