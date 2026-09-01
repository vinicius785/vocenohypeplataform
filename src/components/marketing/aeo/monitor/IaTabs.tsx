import { AEO_IAS, type AeoIa, type AeoPrompt, type AeoResposta } from "@/lib/aeo-store";
import { computeIaProgresso } from "@/lib/aeo-engine";

/** Trocar de IA aqui NUNCA reseta o prompt selecionado no board — só troca
 * qual conjunto de respostas é lido (pedido explícito da seção 4). */
export function IaTabs({
  rodadaId,
  ia,
  onChange,
  prompts,
  respostas,
}: {
  rodadaId: string;
  ia: AeoIa;
  onChange: (ia: AeoIa) => void;
  prompts: AeoPrompt[];
  respostas: AeoResposta[];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {AEO_IAS.map((i) => {
        const { preenchidos, total } = computeIaProgresso(rodadaId, i, prompts, respostas);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              ia === i
                ? "bg-foreground text-background"
                : "bg-muted/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {i}
            <span className={ia === i ? "opacity-80" : "text-muted-foreground"}>
              {preenchidos}/{total}
            </span>
          </button>
        );
      })}
    </div>
  );
}
