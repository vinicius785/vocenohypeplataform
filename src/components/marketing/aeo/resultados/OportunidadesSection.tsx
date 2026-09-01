import { AlertTriangle, Sparkles, Swords } from "lucide-react";
import type { AeoPrompt, AeoResposta } from "@/lib/aeo-store";
import { oportunidades } from "@/lib/aeo-engine";

const ICON = { critico: AlertTriangle, oportunidade: Sparkles, concorrencia: Swords } as const;
const TONE = {
  critico: "border-rose-500/30 bg-rose-500/5 text-rose-600 dark:text-rose-400",
  oportunidade: "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400",
  concorrencia: "border-sky-500/30 bg-sky-500/5 text-sky-600 dark:text-sky-400",
} as const;

export function OportunidadesSection({
  rodadaId,
  prompts,
  respostas,
}: {
  rodadaId: string;
  prompts: AeoPrompt[];
  respostas: AeoResposta[];
}) {
  const itens = oportunidades(rodadaId, prompts, respostas);

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Oportunidades
      </h3>
      {itens.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-4 text-xs text-muted-foreground">
          Sem oportunidades identificadas nesta rodada.
        </p>
      ) : (
        itens.map((op, i) => {
          const Icon = ICON[op.tipo];
          return (
            <div
              key={i}
              className={`flex items-start gap-2.5 rounded-2xl border p-4 ${TONE[op.tipo]}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">{op.titulo}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{op.descricao}</p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
