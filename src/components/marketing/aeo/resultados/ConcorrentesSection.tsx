import { useState } from "react";
import type { AeoPrompt, AeoResposta } from "@/lib/aeo-store";
import { concorrentesMaisCitados, promptsPorConcorrente } from "@/lib/aeo-engine";
import { ConcorrentePromptsDrawer } from "./ConcorrentePromptsDrawer";

export function ConcorrentesSection({
  respostas,
  prompts,
  rodadaId,
}: {
  respostas: AeoResposta[];
  prompts: AeoPrompt[];
  rodadaId: string;
}) {
  const lista = concorrentesMaisCitados(respostas, rodadaId).slice(0, 5);
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
        Concorrentes mais citados
      </h3>
      <ul className="mt-3 space-y-2">
        {lista.length === 0 && (
          <li className="text-sm text-text-secondary">Nenhum concorrente registrado.</li>
        )}
        {lista.map((c) => (
          <li key={c.nome}>
            <button
              type="button"
              onClick={() => setAberto(c.nome)}
              className="flex w-full items-center justify-between gap-3 text-sm hover:underline"
            >
              <span className="text-foreground">{c.nome}</span>
              <span className="text-muted-foreground">
                {c.vezes}x · {c.pct}%
              </span>
            </button>
          </li>
        ))}
      </ul>
      <ConcorrentePromptsDrawer
        concorrente={aberto}
        prompts={aberto ? promptsPorConcorrente(respostas, prompts, rodadaId, aberto) : []}
        onClose={() => setAberto(null)}
      />
    </div>
  );
}
