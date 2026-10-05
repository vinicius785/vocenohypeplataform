import { AlertTriangle, Sparkles, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AeoPrompt, AeoResposta } from "@/lib/aeo-store";
import { kpiPromptsSemPresenca, oportunidades } from "@/lib/aeo-engine";

const ICON = { critico: AlertTriangle, oportunidade: Sparkles, concorrencia: Swords } as const;
const ICON_TONE = {
  critico: "text-danger",
  oportunidade: "text-warning",
  concorrencia: "text-info",
} as const;

/** Oportunidades da rodada: os insights que o motor calcula (nada inventado) e, no fim, a
 * ação "ver prompts sem presença". Lista simples — sem um card colorido por insight. */
export function OportunidadesSection({
  rodadaId,
  prompts,
  respostas,
  onVerPrompts,
}: {
  rodadaId: string;
  prompts: AeoPrompt[];
  respostas: AeoResposta[];
  onVerPrompts: () => void;
}) {
  const itens = oportunidades(rodadaId, prompts, respostas);
  const sem = kpiPromptsSemPresenca(respostas, rodadaId).valor;

  if (itens.length === 0 && sem === 0) {
    return (
      <p className="text-sm text-text-secondary">Sem oportunidades identificadas nesta rodada.</p>
    );
  }

  return (
    <ul className="divide-y divide-border/60">
      {itens.map((op, i) => {
        const Icon = ICON[op.tipo];
        return (
          <li key={i} className="flex items-start gap-3 py-3">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_TONE[op.tipo]}`} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{op.titulo}</p>
              <p className="mt-0.5 text-sm text-text-secondary">{op.descricao}</p>
            </div>
          </li>
        );
      })}
      {sem > 0 && (
        <li className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {sem} {sem === 1 ? "resposta sem presença" : "respostas sem presença"}
            </p>
            <p className="mt-0.5 text-sm text-text-secondary">
              Combinações de pergunta e IA em que a marca não foi citada.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onVerPrompts}>
            Ver prompts
          </Button>
        </li>
      )}
    </ul>
  );
}
