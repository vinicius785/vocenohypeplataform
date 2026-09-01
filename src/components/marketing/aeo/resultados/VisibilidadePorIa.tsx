import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { AeoResposta } from "@/lib/aeo-store";
import { visibilidadePorIa } from "@/lib/aeo-engine";

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
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Visibilidade por IA
      </h3>
      <div className="mt-3 space-y-2">
        {linhas.map(({ ia, pct, deltaPP }) => {
          const Icon =
            deltaPP === null || deltaPP === 0 ? Minus : deltaPP > 0 ? TrendingUp : TrendingDown;
          const tone =
            deltaPP === null || deltaPP === 0
              ? "text-muted-foreground"
              : deltaPP > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400";
          return (
            <div key={ia} className="flex items-center justify-between text-xs">
              <span className="text-foreground">{ia}</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="font-medium text-foreground">{pct}%</span>
                {deltaPP !== null && (
                  <span className={`inline-flex items-center gap-0.5 ${tone}`}>
                    <Icon className="h-3 w-3" />
                    {deltaPP > 0 ? "+" : ""}
                    {deltaPP}pp
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
