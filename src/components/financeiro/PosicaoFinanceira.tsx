import {
  ArrowDownRight,
  ArrowUpRight,
  Pencil,
  Settings2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  computeSaldoAtual,
  computeSaldoProjetado,
  groupByDueBucket,
  projectionHorizonTo,
  resultadoRealizado,
  fmtBRL,
  PROJECTION_HORIZON_OPTIONS,
  type Entry,
  type ProjectionHorizon,
} from "@/lib/financeiro-entries";
import type { DateRange } from "@/components/financeiro/useFinanceiroFilteredEntries";
import type { SaldoInicialConfig } from "@/lib/financeiro-saldo-inicial-store";

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Superfície secundária dos widgets compactos do bento (Etapa 6 —
 * refinamento visual) — mais recessada que o card do gráfico
 * (`bg-card`), pra criar hierarquia real de 3 níveis (hero azul > card
 * do gráfico > widget compacto) sem depender de borda. No claro reusa
 * `bg-card` (branco) + borda discreta, já que não há um tom "mais
 * recessado que branco" coerente com o restante do design system; no
 * escuro usa um cinza levemente mais escuro que `--card` (experimental,
 * escopado só a estes widgets do Resumo). */
export const SECONDARY_SURFACE =
  "bg-card border border-border/60 dark:border-0 dark:bg-[oklch(0.17_0_0)]";

/** Elemento decorativo abstrato (Etapa 6) — só formas/linhas, sem
 * ilustração: usado no hero quando o saldo ainda não foi configurado,
 * pra essa área não virar um grande vazio. `aria-hidden` porque é
 * puramente decorativo. */
function AbstractWaveGlyph() {
  return (
    <svg
      viewBox="0 0 160 90"
      aria-hidden="true"
      className="pointer-events-none absolute -right-2 bottom-0 h-[90px] w-[160px] text-brand-foreground/15 sm:h-[110px] sm:w-[200px]"
    >
      <path
        d="M0 70 Q 20 20, 40 50 T 80 40 T 120 55 T 160 25"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="2 8"
        strokeLinecap="round"
      />
      <circle cx="40" cy="50" r="3.5" fill="currentColor" />
      <circle cx="80" cy="40" r="3.5" fill="currentColor" />
      <circle cx="120" cy="55" r="3.5" fill="currentColor" />
    </svg>
  );
}

/** Bloco protagonista do Resumo — superfície azul da marca (Etapa 6),
 * único elemento da página com essa cor de fundo. Dois estados reais:
 * saldo configurado (valor gigante + resultado/projeção subordinados) e
 * não configurado (composição intencional, nunca um vazio com um
 * traço). Nenhum cálculo mudou (`computeSaldoAtual`/
 * `computeSaldoProjetado`/`resultadoRealizado`, mesmas funções puras da
 * rodada anterior).
 *
 * Cor semântica (verde/vermelho) não é usada dentro do hero: medido
 * contra `--brand` (#6F95FF), `--success`/`--danger` ficam com contraste
 * ~1-1.5:1 (bem abaixo do mínimo AA de 3:1 pra texto grande) — nessa
 * superfície a polaridade vem de ícone + `brand-foreground`, e a cor
 * semântica volta a valer nos widgets vizinhos (fundo neutro). */
export function SaldoHero({
  all,
  visible,
  range,
  saldoInicial,
  horizon,
  onHorizonChange,
  onConfigureSaldo,
}: {
  all: Entry[];
  visible: Entry[];
  range: DateRange;
  saldoInicial: SaldoInicialConfig;
  horizon: ProjectionHorizon;
  onHorizonChange: (h: ProjectionHorizon) => void;
  onConfigureSaldo: () => void;
}) {
  const saldoAtual = computeSaldoAtual(saldoInicial, all);
  const horizonTo = projectionHorizonTo(horizon);
  const saldoProjetado = computeSaldoProjetado(saldoAtual, all, horizonTo);
  const realizadoAtual = resultadoRealizado(visible, range);
  const horizonLabel = PROJECTION_HORIZON_OPTIONS.find((o) => o.value === horizon)?.label ?? "";
  const resultadoPositivo = realizadoAtual.resultado >= 0;

  return (
    <div className="relative h-full overflow-hidden rounded-[28px] bg-brand p-7 dark:shadow-none md:p-9">
      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-foreground">
          Saldo atual
        </span>
        <button
          type="button"
          onClick={onConfigureSaldo}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full bg-brand-foreground px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-brand"
        >
          {saldoAtual != null ? (
            <Pencil className="h-3.5 w-3.5" />
          ) : (
            <Settings2 className="h-3.5 w-3.5" />
          )}
          {saldoAtual != null ? "Editar saldo" : "Configurar saldo"}
        </button>
      </div>

      {saldoAtual != null ? (
        <>
          <p className="relative z-10 mt-6 whitespace-nowrap text-[38px] font-bold leading-none tracking-tight text-brand-foreground sm:text-[52px] md:text-[64px]">
            {fmtBRL(saldoAtual)}
          </p>
          <p className="relative z-10 mt-3 text-sm text-brand-foreground-secondary">
            Hoje, considerando tudo recebido e pago
          </p>
        </>
      ) : (
        <>
          <p className="relative z-10 mt-6 max-w-[280px] text-[26px] font-bold leading-[1.15] tracking-tight text-brand-foreground sm:text-[30px] sm:max-w-none">
            Configure seu saldo inicial
          </p>
          <p className="relative z-10 mt-3 max-w-sm text-sm text-brand-foreground-secondary">
            Informe quanto havia em caixa numa data — o Financeiro calcula o resto automaticamente a
            partir daí.
          </p>
          <AbstractWaveGlyph />
        </>
      )}

      <div className="relative z-10 mt-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-foreground-secondary">
            Resultado realizado
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 whitespace-nowrap text-[26px] font-bold tabular-nums leading-none text-brand-foreground">
            {resultadoPositivo ? (
              <ArrowUpRight className="h-5 w-5 shrink-0" />
            ) : (
              <ArrowDownRight className="h-5 w-5 shrink-0" />
            )}
            {resultadoPositivo ? "+" : ""}
            {fmtBRL(realizadoAtual.resultado)}
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-foreground-secondary">
              Projetado
            </p>
            <select
              value={horizon}
              onChange={(e) => onHorizonChange(e.target.value as ProjectionHorizon)}
              className="h-6 cursor-pointer rounded-md border border-brand-border bg-black/10 px-1 text-[11px] text-brand-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-brand"
            >
              {PROJECTION_HORIZON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="text-foreground">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1 whitespace-nowrap text-[26px] font-bold tabular-nums leading-none text-brand-foreground">
            {saldoProjetado == null ? "Indisponível" : fmtBRL(saldoProjetado)}
          </p>
          <p className="mt-0.5 text-[11px] text-brand-foreground-secondary">
            {saldoProjetado == null ? "Depende do saldo atual" : horizonLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Entradas/saídas realizadas — widgets compactos na superfície
 * secundária (Etapa 6), com microviz de barra proporcional derivada dos
 * próprios valores (nunca dado inventado). Mesmos cálculos de antes
 * (`resultadoRealizado` + delta vs. período anterior); semântica da
 * variação de saídas já estava correta (queda de despesa = `success`,
 * alta = `danger`, independente do sinal aritmético do delta).
 */
export function EntradasSaidasResumo({
  visible,
  previousVisible,
  range,
}: {
  visible: Entry[];
  previousVisible: Entry[];
  range: DateRange;
}) {
  const realizadoAtual = resultadoRealizado(visible, range);
  const realizadoAnterior = resultadoRealizado(previousVisible, range);
  const deltaReceita = pctDelta(realizadoAtual.receita, realizadoAnterior.receita);
  const deltaDespesa = pctDelta(realizadoAtual.despesa, realizadoAnterior.despesa);
  const maior = Math.max(realizadoAtual.receita, realizadoAtual.despesa, 1);
  const barraReceita = Math.max(6, Math.round((realizadoAtual.receita / maior) * 100));
  const barraDespesa = Math.max(6, Math.round((realizadoAtual.despesa / maior) * 100));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className={`rounded-[22px] ${SECONDARY_SURFACE} p-5`}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success-soft text-success">
            <TrendingUp className="h-4.5 w-4.5" />
          </span>
          <span className="h-1.5 flex-1 max-w-16 rounded-full bg-success-soft">
            <span
              className="block h-full rounded-full bg-success"
              style={{ width: `${barraReceita}%` }}
            />
          </span>
        </div>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Entradas realizadas
        </p>
        <p className="mt-1 whitespace-nowrap text-[26px] font-bold tabular-nums leading-none text-foreground sm:text-[28px] md:text-[30px]">
          {fmtBRL(realizadoAtual.receita)}
        </p>
        {deltaReceita != null && (
          <span
            className={`mt-2 inline-flex items-center gap-1 text-sm font-semibold ${deltaReceita >= 0 ? "text-success" : "text-danger"}`}
          >
            {deltaReceita >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {deltaReceita >= 0 ? "+" : ""}
            {deltaReceita.toFixed(0)}% vs. período anterior
          </span>
        )}
      </div>
      <div className={`rounded-[22px] ${SECONDARY_SURFACE} p-5`}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-danger-soft text-danger">
            <TrendingDown className="h-4.5 w-4.5" />
          </span>
          <span className="h-1.5 flex-1 max-w-16 rounded-full bg-danger-soft">
            <span
              className="block h-full rounded-full bg-danger"
              style={{ width: `${barraDespesa}%` }}
            />
          </span>
        </div>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Saídas realizadas
        </p>
        <p className="mt-1 whitespace-nowrap text-[26px] font-bold tabular-nums leading-none text-foreground sm:text-[28px] md:text-[30px]">
          {fmtBRL(realizadoAtual.despesa)}
        </p>
        {deltaDespesa != null && (
          <span
            className={`mt-2 inline-flex items-center gap-1 text-sm font-semibold ${deltaDespesa <= 0 ? "text-success" : "text-danger"}`}
          >
            {deltaDespesa <= 0 ? (
              <TrendingDown className="h-3.5 w-3.5" />
            ) : (
              <TrendingUp className="h-3.5 w-3.5" />
            )}
            {deltaDespesa >= 0 ? "+" : ""}
            {deltaDespesa.toFixed(0)}% vs. período anterior
          </span>
        )}
      </div>
    </div>
  );
}

/** "Total vencido" a receber/pagar — carteira inteira, não o período
 * selecionado (mesmo escopo de sempre). Superfície secundária, mesmo
 * peso visual dos demais widgets compactos do bento. */
export function VencidosResumo({
  all,
  onNavigateToAReceber,
  onNavigateToAPagar,
}: {
  all: Entry[];
  onNavigateToAReceber: () => void;
  onNavigateToAPagar: () => void;
}) {
  const bucketsReceita = groupByDueBucket(all.filter((e) => e.kind === "receita"));
  const bucketsDespesa = groupByDueBucket(all.filter((e) => e.kind === "despesa"));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <button
        type="button"
        onClick={onNavigateToAReceber}
        className={`cursor-pointer rounded-[22px] ${SECONDARY_SURFACE} p-5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Vencido a receber
        </p>
        <p
          className={`mt-1.5 whitespace-nowrap text-[22px] font-bold tabular-nums leading-none ${
            bucketsReceita.vencido.total > 0 ? "text-danger" : "text-foreground"
          }`}
        >
          {fmtBRL(bucketsReceita.vencido.total)}
        </p>
        <p className="mt-1 text-[11px] text-text-secondary">
          {bucketsReceita.vencido.count} lançamento{bucketsReceita.vencido.count === 1 ? "" : "s"} ·
          toda a carteira
        </p>
      </button>
      <button
        type="button"
        onClick={onNavigateToAPagar}
        className={`cursor-pointer rounded-[22px] ${SECONDARY_SURFACE} p-5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Vencido a pagar
        </p>
        <p
          className={`mt-1.5 whitespace-nowrap text-[22px] font-bold tabular-nums leading-none ${
            bucketsDespesa.vencido.total > 0 ? "text-danger" : "text-foreground"
          }`}
        >
          {fmtBRL(bucketsDespesa.vencido.total)}
        </p>
        <p className="mt-1 text-[11px] text-text-secondary">
          {bucketsDespesa.vencido.count} lançamento{bucketsDespesa.vencido.count === 1 ? "" : "s"} ·
          toda a carteira
        </p>
      </button>
    </div>
  );
}
