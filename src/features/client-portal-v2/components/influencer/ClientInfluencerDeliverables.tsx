import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronDown, Film, X } from "lucide-react";
import { respondCampanhaEntregaSession } from "@/lib/portal-auth.functions";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { InfluencerDrawerSection } from "./InfluencerDrawerSection";
import {
  activeAjuste,
  ajusteSemDetalheDisponivel,
  entregaHasExpandableDetails,
  formatAjusteSummary,
} from "../../lib/ajuste-format";
import type { PublicEntrega } from "@/lib/portal-types";

const CAN_DECIDE_STAGES = new Set(["ROTEIRO_APROVACAO", "CONTEUDO_APROVACAO"]);

function AdjustForm({
  onConfirm,
  onCancel,
  disabled,
}: {
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Descreva o ajuste necessário (obrigatório)..."
        className="min-h-16 rounded-md border border-border bg-card px-2 py-1.5 text-sm"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1 text-xs text-text-secondary hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={!motivo.trim() || disabled}
          onClick={() => onConfirm(motivo.trim())}
          className="rounded-md bg-warning px-2.5 py-1 text-xs font-medium text-brand-foreground disabled:opacity-50"
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}

/** Entregas — cada uma como linha operacional (formato, status, prazo,
 * próxima ação), expandível pra revelar detalhes sem abrir outro drawer
 * por cima. Ações reaproveitam a MESMA server function já usada em
 * Aprovações/Conteúdos (`respondCampanhaEntregaSession`) — nenhum novo
 * caminho de escrita. */
export function ClientInfluencerDeliverables({
  entregas,
  campanhaId,
  influencerId,
}: {
  entregas: PublicEntrega[];
  campanhaId: string;
  influencerId: string;
}) {
  const { reload, readOnly } = usePortalSessionData();
  const queryClient = useQueryClient();
  const respondFn = useServerFn(respondCampanhaEntregaSession);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (vars: { entregaId: string; status: "aprovado" | "reprovado"; motivo?: string }) =>
      respondFn({ data: { campanhaId, influencerId, ...vars } }),
    onSuccess: () => {
      reload();
      queryClient.invalidateQueries();
      toast.success("Decisão registrada.");
      setAdjustingId(null);
    },
    onError: () => toast.error("Não foi possível registrar a decisão. Tente novamente."),
  });

  if (entregas.length === 0) return null;

  return (
    <InfluencerDrawerSection icon={<Film className="h-4 w-4" />} title="Entregas">
      <div className="space-y-1.5 rounded-2xl bg-card p-2 dark:shadow-none">
        {entregas.map((entrega) => {
          const canDecide = CAN_DECIDE_STAGES.has(entrega.stage) && !readOnly;
          const hasDetails = entregaHasExpandableDetails(entrega, canDecide);
          const expanded = hasDetails && expandedId === entrega.id;
          const ajuste = activeAjuste(entrega);
          return (
            <div key={entrega.id} className="rounded-xl px-3 py-2.5">
              {hasDetails ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : entrega.id)}
                  className="flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {entrega.quantidade} {entrega.titulo || entrega.tipo}
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">{entrega.statusCliente}</p>
                    {ajuste && !expanded && (
                      <p className="mt-0.5 truncate text-xs text-text-secondary">
                        {formatAjusteSummary(ajuste.veredito)}
                      </p>
                    )}
                    {!ajuste && !expanded && ajusteSemDetalheDisponivel(entrega) && (
                      <p className="mt-0.5 truncate text-xs text-text-secondary">
                        Ajuste solicitado anteriormente.
                      </p>
                    )}
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
              ) : (
                <div className="flex w-full items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {entrega.quantidade} {entrega.titulo || entrega.tipo}
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">{entrega.statusCliente}</p>
                  </div>
                </div>
              )}

              {expanded && (
                <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
                  {ajuste && (
                    <div className="rounded-lg bg-warning-soft p-2.5">
                      <p className="text-xs font-medium text-foreground">
                        {formatAjusteSummary(ajuste.veredito)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-text-secondary">
                        {ajuste.veredito.motivo}
                      </p>
                    </div>
                  )}
                  {!ajuste && ajusteSemDetalheDisponivel(entrega) && (
                    <div className="rounded-lg bg-warning-soft p-2.5">
                      <p className="text-xs font-medium text-foreground">
                        Ajuste solicitado anteriormente.
                      </p>
                      <p className="mt-1 text-xs text-text-secondary">
                        Os detalhes da solicitação não estão disponíveis.
                      </p>
                    </div>
                  )}
                  {entrega.dataPostagem && (
                    <p className="text-xs text-text-secondary">
                      Prazo: {new Date(entrega.dataPostagem).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                  {entrega.publicadoEm && (
                    <p className="text-xs text-text-secondary">
                      Publicado em: {new Date(entrega.publicadoEm).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                  {entrega.url && (
                    <a
                      href={entrega.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs font-medium text-brand hover:underline"
                    >
                      Abrir publicação
                    </a>
                  )}

                  {canDecide &&
                    (adjustingId === entrega.id ? (
                      <AdjustForm
                        disabled={mutation.isPending}
                        onCancel={() => setAdjustingId(null)}
                        onConfirm={(motivo) =>
                          mutation.mutate({ entregaId: entrega.id, status: "reprovado", motivo })
                        }
                      />
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={mutation.isPending}
                          onClick={() =>
                            mutation.mutate({ entregaId: entrega.id, status: "aprovado" })
                          }
                          className="flex items-center gap-1 rounded-md bg-success px-2.5 py-1.5 text-xs font-medium text-brand-foreground disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" /> Aprovar
                        </button>
                        <button
                          type="button"
                          disabled={mutation.isPending}
                          onClick={() => setAdjustingId(entrega.id)}
                          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-warning hover:bg-warning-soft disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" /> Solicitar ajuste
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </InfluencerDrawerSection>
  );
}
