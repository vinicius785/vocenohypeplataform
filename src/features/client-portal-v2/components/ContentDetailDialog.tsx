import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X, Film, ExternalLink } from "lucide-react";
import { respondCampanhaEntregaSession } from "@/lib/portal-auth.functions";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import type { ContentItem } from "../types/content";

/**
 * Viewer de conteúdo — usado dentro da campanha e dentro do drawer do
 * influenciador (nunca duplicado; era antes só de `pages/ConteudosV2.tsx`,
 * que deixou de existir como página quando Conteúdos parou de ser um
 * destino independente do menu — o conteúdo em si nunca deixou de existir,
 * só passou a ser acessado sempre em contexto).
 */
export function ContentDetailDialog({ item, onClose }: { item: ContentItem; onClose: () => void }) {
  const { entrega } = item;
  const { reload, readOnly } = usePortalSessionData();
  const queryClient = useQueryClient();
  const respondEntregaFn = useServerFn(respondCampanhaEntregaSession);
  const [adjusting, setAdjusting] = useState(false);
  const [comentario, setComentario] = useState("");

  const canDecide = entrega.stage === "ROTEIRO_APROVACAO" || entrega.stage === "CONTEUDO_APROVACAO";

  const mutation = useMutation({
    mutationFn: (vars: { status: "aprovado" | "reprovado"; motivo?: string }) =>
      respondEntregaFn({
        data: {
          campanhaId: item.campanhaId,
          influencerId: item.influencerId,
          entregaId: entrega.id,
          ...vars,
        },
      }),
    onSuccess: () => {
      reload();
      queryClient.invalidateQueries();
      toast.success("Decisão registrada.");
      onClose();
    },
    onError: () => toast.error("Não foi possível registrar a decisão. Tente novamente."),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-border bg-card p-5 sm:rounded-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {entrega.titulo || entrega.tipo}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.influencerNome} · {item.campanhaNome}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex h-40 items-center justify-center rounded-lg bg-muted/50">
          <Film className="h-8 w-8 text-muted-foreground" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="mt-0.5 font-medium text-foreground">{entrega.statusCliente}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Última atualização</p>
            <p className="mt-0.5 font-medium text-foreground">
              {entrega.ultimaAtualizacao
                ? new Date(entrega.ultimaAtualizacao).toLocaleDateString("pt-BR")
                : "—"}
            </p>
          </div>
        </div>

        {entrega.url && (
          <a
            href={entrega.url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" /> Abrir publicação
          </a>
        )}

        {canDecide && !readOnly && (
          <div className="mt-5 border-t border-border pt-4">
            {!adjusting ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ status: "aprovado" })}
                  className="flex items-center gap-1.5 rounded-md bg-success px-3 py-2 text-sm font-medium text-brand-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> Aprovar
                </button>
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => setAdjusting(true)}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-warning hover:bg-warning-soft disabled:opacity-50"
                >
                  <X className="h-4 w-4" /> Solicitar ajustes
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Descreva o ajuste necessário (obrigatório)..."
                  className="min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjusting(false)}
                    className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!comentario.trim() || mutation.isPending}
                    onClick={() =>
                      mutation.mutate({ status: "reprovado", motivo: comentario.trim() })
                    }
                    className="rounded-md bg-warning px-3 py-1.5 text-sm font-medium text-brand-foreground disabled:opacity-50"
                  >
                    Confirmar ajuste
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
