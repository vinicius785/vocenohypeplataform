import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AeoPrompt, AeoResposta } from "@/lib/aeo-store";
import { promptsSemPresencaLista } from "@/lib/aeo-engine";

/** Card compacto — nunca uma lista gigante ocupando metade da tela (pedido
 * explícito). O drill-down é o único lugar que mostra a lista completa. */
export function PromptsSemPresencaCard({
  respostas,
  prompts,
  rodadaId,
}: {
  respostas: AeoResposta[];
  prompts: AeoPrompt[];
  rodadaId: string;
}) {
  const [open, setOpen] = useState(false);
  const lista = promptsSemPresencaLista(respostas, prompts, rodadaId);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Prompts sem presença
      </h3>
      <p className="mt-2 text-2xl font-light tracking-tighter text-foreground">{lista.length}</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={() => setOpen(true)}>
        Ver prompts
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Prompts sem presença ({lista.length})</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 font-medium">Prompt</th>
                  <th className="py-1.5 font-medium">Categoria</th>
                  <th className="py-1.5 font-medium">Idioma</th>
                  <th className="py-1.5 font-medium">IA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista.map(({ prompt, ia }, i) => (
                  <tr key={`${prompt.id}-${ia}-${i}`}>
                    <td className="max-w-[200px] truncate py-1.5 text-foreground">
                      {prompt.idCodigo} · {prompt.texto}
                    </td>
                    <td className="py-1.5 text-muted-foreground">{prompt.categoria}</td>
                    <td className="py-1.5 text-muted-foreground">{prompt.idioma}</td>
                    <td className="py-1.5 text-muted-foreground">{ia}</td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted-foreground">
                      Nenhum — ótimo sinal.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
