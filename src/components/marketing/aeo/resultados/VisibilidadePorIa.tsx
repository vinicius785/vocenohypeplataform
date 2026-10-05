import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { AeoResposta } from "@/lib/aeo-store";
import { visibilidadePorIa } from "@/lib/aeo-engine";

/** Barras horizontais simples: a IA, a barra e o valor — comparável de relance. Sem card. */
export function VisibilidadePorIa({
  respostas,
  rodadaId,
  rodadaComparacaoId,
}: {
  respostas: AeoResposta[];
  rodadaId: string;
  rodadaComparacaoId?: string;
}) {
  const linhas = visibilidadePorIa(respostas, rodadaId, rodadaComparacaoId);
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
        Por IA
      </h3>
      <ul className="mt-4 space-y-3">
        {linhas.map(({ ia, pct, deltaPP }) => {
          const Icon =
            deltaPP === null || deltaPP === 0 ? Minus : deltaPP > 0 ? TrendingUp : TrendingDown;
          const tone =
            deltaPP === null || deltaPP === 0
              ? "text-text-secondary"
              : deltaPP > 0
                ? "text-success-soft-foreground"
                : "text-danger-soft-foreground";
          return (
            <li key={ia}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-foreground">{ia}</span>
                <span className="inline-flex items-center gap-2">
                  {deltaPP !== null && (
                    <span className={`inline-flex items-center gap-0.5 text-xs ${tone}`}>
                      <Icon className="h-3 w-3" aria-hidden="true" />
                      {deltaPP > 0 ? "+" : ""}
                      {deltaPP}pp
                    </span>
                  )}
                  <span className="w-10 text-right font-semibold tabular-nums text-foreground">
                    {pct}%
                  </span>
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`${ia}: ${pct}% de visibilidade`}
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-foreground transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
