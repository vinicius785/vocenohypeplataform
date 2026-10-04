import { AlertTriangle, ArrowRight, Check, RotateCcw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { formatBRL } from "@/lib/comercial";

/**
 * Bloco C — a decisão: o preço final ao cliente (editável por cima do
 * calculado), a margem desse preço e a ação inequívoca de aplicá-lo ao
 * negócio, dizendo antes o que vai mudar. Único bloco com destaque de cor.
 */
export function PrecoFinal({
  precoCalculado,
  precoManual,
  precoExibido,
  onPrecoChange,
  onResetManual,
  margem,
  margemMinima,
  currentValue,
  impactMessage,
  applyLabel,
  applying,
  applied,
  applyError,
  blockedReason,
  onApply,
}: {
  precoCalculado: number;
  precoManual: number | null;
  precoExibido: number;
  onPrecoChange: (v: number | null) => void;
  onResetManual: () => void;
  /** Margem bruta do preço exibido (preço − custo) — a mesma conta de sempre. */
  margem: { reais: number; pct: number | null };
  /** Percentual de margem configurado (alerta quando a margem fica abaixo). */
  margemMinima: number;
  currentValue: number | undefined;
  /** "O valor do negócio passa de X para Y." (null = igual) */
  impactMessage: string | null;
  applyLabel: string;
  applying: boolean;
  applied: boolean;
  applyError: string | null;
  /** Motivo de não poder aplicar (ex.: preço zerado) — desabilita o botão. */
  blockedReason: string | null;
  onApply: () => void;
}) {
  const editadoManualmente = precoManual !== null;
  const margemBaixa = margem.pct != null && margem.pct < margemMinima - 0.001;

  return (
    <section
      className="space-y-4 rounded-2xl border border-brand/30 bg-brand-subtle p-4 md:p-5"
      aria-label="Preço final"
    >
      <div className="space-y-2">
        <label
          htmlFor="simulador-preco-final"
          className="text-[11px] font-medium uppercase tracking-wide text-text-secondary"
        >
          Preço final ao cliente
        </label>
        <div className="relative">
          <span
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-text-secondary"
            aria-hidden="true"
          >
            R$
          </span>
          <FormattedNumberInput
            id="simulador-preco-final"
            mode="currency"
            value={precoManual ?? Math.round(precoCalculado)}
            onValueChange={(v) => onPrecoChange(v ?? null)}
            disabled={applying}
            className="h-14 bg-background pl-12 pr-4 text-3xl font-bold tabular-nums text-foreground md:text-3xl"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-text-secondary">
          <span>
            {editadoManualmente
              ? "Ajustado manualmente — a composição recalcula com base neste valor."
              : "Calculado com base nos custos e percentuais configurados. Você pode editar."}
          </span>
          {editadoManualmente && (
            <button
              type="button"
              onClick={onResetManual}
              disabled={applying}
              className="inline-flex items-center gap-1 rounded font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RotateCcw className="h-3 w-3" /> usar valor calculado ({formatBRL(precoCalculado)})
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className="text-text-secondary" title="Preço final − custo dos influenciadores">
          Margem bruta
        </span>
        <span
          className={`font-medium tabular-nums ${
            margemBaixa ? "text-warning-soft-foreground" : "text-foreground"
          }`}
        >
          {formatBRL(margem.reais)}
          {margem.pct != null && (
            <span className="ml-1.5 text-xs font-normal">· {Math.round(margem.pct * 100)}%</span>
          )}
        </span>
      </div>
      {margemBaixa && (
        <Alert variant="warning" className="py-2 text-xs">
          <span className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Margem abaixo do percentual configurado ({Math.round(margemMinima * 100)}%) — revise o
            preço final antes de enviar.
          </span>
        </Alert>
      )}

      <div className="space-y-2.5 border-t border-brand/20 pt-4">
        {currentValue !== undefined && (
          <p
            className="flex flex-wrap items-center gap-x-2 text-sm text-foreground"
            aria-live="polite"
          >
            {impactMessage ? (
              <>
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0 text-text-secondary"
                  aria-hidden="true"
                />
                {impactMessage}
              </>
            ) : (
              <span className="text-text-secondary">Igual ao valor atual do negócio.</span>
            )}
          </p>
        )}
        {applyError && (
          <Alert variant="destructive" className="py-2 text-xs">
            {applyError}
          </Alert>
        )}
        <Button
          type="button"
          variant="primary"
          size="comfortable"
          className="w-full"
          isLoading={applying}
          disabled={applied || !!blockedReason}
          onClick={onApply}
        >
          {applied ? (
            <>
              <Check /> Aplicado ao negócio
            </>
          ) : (
            applyLabel
          )}
        </Button>
        {blockedReason && !applied && (
          <p className="text-center text-xs text-text-secondary">{blockedReason}</p>
        )}
      </div>
    </section>
  );
}
