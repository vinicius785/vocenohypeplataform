import { Settings2 } from "lucide-react";
import {
  computeSaldoAtual,
  computeSaldoProjetado,
  projectionHorizonTo,
  resultadoRealizado,
  fmtBRL,
  PROJECTION_HORIZON_OPTIONS,
  type Entry,
  type ProjectionHorizon,
} from "@/lib/financeiro-entries";
import type { DateRange } from "@/components/financeiro/useFinanceiroFilteredEntries";
import type { SaldoInicialConfig } from "@/lib/financeiro-saldo-inicial-store";
import { Button } from "@/components/ui/button";

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Superfície dos blocos secundários do Resumo (lista de pendências,
 * gráfico): um único nível de card, sem card dentro de card. */
export const SECONDARY_SURFACE =
  "bg-card border border-border/60 dark:border-0 dark:bg-[oklch(0.17_0_0)]";

/** Um número do Resumo: rótulo discreto, valor, e (quando há base) a variação
 * contra o período anterior — verde/vermelho só nessa variação, que é onde a
 * cor carrega significado. */
function Figure({
  label,
  value,
  delta,
  deltaGoodWhenUp = true,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaGoodWhenUp?: boolean;
}) {
  const good = delta == null ? null : deltaGoodWhenUp ? delta >= 0 : delta <= 0;
  return (
    <div className="min-w-0">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-0.5 whitespace-nowrap text-xl font-semibold tabular-nums text-foreground md:text-2xl">
        {value}
      </p>
      {delta != null && (
        <p className={`mt-0.5 text-xs font-medium ${good ? "text-success" : "text-danger"}`}>
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(0)}% vs. período anterior
        </p>
      )}
    </div>
  );
}

/** Posição financeira — a primeira resposta do Resumo ("como estamos?"):
 * saldo atual em destaque e, ao lado, entradas, saídas, resultado e o saldo
 * projetado. Sem cards, sem bloco colorido: tipografia e espaço fazem a
 * hierarquia. Sem saldo inicial configurado, em vez de um bloco vazio, uma
 * linha dizendo o que fazer. Mesmas funções puras de sempre
 * (`computeSaldoAtual`/`computeSaldoProjetado`/`resultadoRealizado`). */
export function PosicaoResumo({
  all,
  visible,
  previousVisible,
  range,
  saldoInicial,
  horizon,
  onHorizonChange,
  onConfigureSaldo,
}: {
  all: Entry[];
  visible: Entry[];
  previousVisible: Entry[];
  range: DateRange;
  saldoInicial: SaldoInicialConfig;
  horizon: ProjectionHorizon;
  onHorizonChange: (h: ProjectionHorizon) => void;
  onConfigureSaldo: () => void;
}) {
  const saldoAtual = computeSaldoAtual(saldoInicial, all);
  const saldoProjetado = computeSaldoProjetado(saldoAtual, all, projectionHorizonTo(horizon));
  const atual = resultadoRealizado(visible, range);
  const anterior = resultadoRealizado(previousVisible, range);

  return (
    <section className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium text-text-secondary">Saldo atual</p>
          {saldoAtual != null && (
            <button
              type="button"
              onClick={onConfigureSaldo}
              className="rounded text-xs text-text-secondary hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Editar saldo inicial
            </button>
          )}
        </div>
        {saldoAtual != null ? (
          <>
            <p className="mt-1 whitespace-nowrap text-4xl font-bold tabular-nums tracking-tight text-foreground md:text-5xl">
              {fmtBRL(saldoAtual)}
            </p>
            <p className="mt-1.5 text-sm text-text-secondary">
              Hoje, considerando tudo recebido e pago.
            </p>
          </>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm text-text-secondary">
              Configure seu saldo inicial para calcular sua posição financeira.
            </p>
            <Button variant="outline" size="sm" onClick={onConfigureSaldo}>
              <Settings2 className="h-3.5 w-3.5" /> Configurar saldo
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border/60 pt-5 lg:grid-cols-4">
        <Figure
          label="Entradas realizadas"
          value={fmtBRL(atual.receita)}
          delta={pctDelta(atual.receita, anterior.receita)}
        />
        <Figure
          label="Saídas realizadas"
          value={fmtBRL(atual.despesa)}
          delta={pctDelta(atual.despesa, anterior.despesa)}
          deltaGoodWhenUp={false}
        />
        <Figure
          label="Resultado"
          value={`${atual.resultado >= 0 ? "+" : ""}${fmtBRL(atual.resultado)}`}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs text-text-secondary">Projetado</p>
            <select
              value={horizon}
              onChange={(e) => onHorizonChange(e.target.value as ProjectionHorizon)}
              aria-label="Horizonte da projeção"
              className="h-6 cursor-pointer rounded-md border border-input bg-background px-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {PROJECTION_HORIZON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-0.5 whitespace-nowrap text-xl font-semibold tabular-nums text-foreground md:text-2xl">
            {saldoProjetado == null ? "—" : fmtBRL(saldoProjetado)}
          </p>
          {saldoProjetado == null && (
            <p className="mt-0.5 text-xs text-text-secondary">Depende do saldo atual</p>
          )}
        </div>
      </div>
    </section>
  );
}
