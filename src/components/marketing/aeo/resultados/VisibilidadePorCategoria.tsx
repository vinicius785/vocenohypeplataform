import { useState } from "react";
import {
  AEO_CATEGORIAS,
  AEO_CATEGORIA_LABEL,
  type AeoCategoria,
  type AeoPrompt,
  type AeoResposta,
} from "@/lib/aeo-store";
import { promptsPorCategoria, visibilidadePorCategoria } from "@/lib/aeo-engine";
import { CategoriaPromptsDrawer } from "./CategoriaPromptsDrawer";

export function VisibilidadePorCategoria({
  respostas,
  prompts,
  rodadaId,
}: {
  respostas: AeoResposta[];
  prompts: AeoPrompt[];
  rodadaId: string;
}) {
  const cats = visibilidadePorCategoria(respostas, prompts, rodadaId);
  const [aberta, setAberta] = useState<AeoCategoria | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Visibilidade por categoria
      </h3>
      <div className="mt-3 space-y-3">
        {AEO_CATEGORIAS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setAberta(c)}
            className="block w-full text-left"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground hover:underline">
                {c} — {AEO_CATEGORIA_LABEL[c]}
              </span>
              <span className="text-muted-foreground">{cats[c]}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground transition-all"
                style={{ width: `${cats[c]}%` }}
              />
            </div>
          </button>
        ))}
      </div>
      <CategoriaPromptsDrawer
        categoria={aberta}
        prompts={aberta ? promptsPorCategoria(prompts, respostas, rodadaId, aberta) : []}
        onClose={() => setAberta(null)}
      />
    </div>
  );
}
