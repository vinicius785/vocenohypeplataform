import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { respondCampanhaInfluSession } from "@/lib/portal-auth.functions";
import { PERFIL_REJEICAO_MOTIVOS } from "@/lib/campanha-status";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import type { PublicInfluencer } from "@/lib/portal-types";

/**
 * Status e ações — só mostra botão quando existe uma decisão real
 * disponível pro estado atual E o usuário tem permissão (`!readOnly`,
 * mesma checagem já usada no resto da V2). Quando a bola está com o
 * time, mostra só o aviso informativo — nunca cria uma pendência falsa
 * pro cliente.
 */
export function ClientInfluencerStatusActions({
  influencer,
  campanhaId,
}: {
  influencer: PublicInfluencer;
  campanhaId: string;
}) {
  const { reload, readOnly } = usePortalSessionData();
  const queryClient = useQueryClient();
  const respondFn = useServerFn(respondCampanhaInfluSession);
  const [rejecting, setRejecting] = useState(false);
  const [motivo, setMotivo] = useState<(typeof PERFIL_REJEICAO_MOTIVOS)[number] | "">("");
  const [comentario, setComentario] = useState("");

  const mutation = useMutation({
    mutationFn: (vars: {
      status: "aprovado" | "reprovado";
      motivoLabel?: (typeof PERFIL_REJEICAO_MOTIVOS)[number];
      comentario?: string;
    }) => respondFn({ data: { campanhaId, influencerId: influencer.id, ...vars } }),
    onSuccess: () => {
      reload();
      queryClient.invalidateQueries();
      toast.success("Decisão registrada.");
      setRejecting(false);
      setMotivo("");
      setComentario("");
    },
    onError: () => toast.error("Não foi possível registrar a decisão. Tente novamente."),
  });

  if (influencer.status !== "ENVIADO_AO_CLIENTE") return null;

  if (readOnly) {
    return (
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-text-secondary">
        Aguardando avaliação — apenas administradores/aprovadores podem decidir.
      </p>
    );
  }

  if (rejecting) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
        <select
          value={motivo}
          onChange={(e) => setMotivo(e.target.value as (typeof PERFIL_REJEICAO_MOTIVOS)[number])}
          className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
        >
          <option value="">Selecione um motivo...</option>
          {PERFIL_REJEICAO_MOTIVOS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {motivo === "Outro" && (
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Descreva o motivo..."
            className="min-h-16 rounded-md border border-border bg-card px-2 py-1.5 text-sm"
          />
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="rounded-md px-2.5 py-1 text-xs text-text-secondary hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!motivo || (motivo === "Outro" && !comentario.trim()) || mutation.isPending}
            onClick={() =>
              mutation.mutate({
                status: "reprovado",
                motivoLabel: motivo || undefined,
                comentario: motivo === "Outro" ? comentario.trim() : undefined,
              })
            }
            className="rounded-md bg-danger px-2.5 py-1 text-xs font-medium text-brand-foreground disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      </div>
    );
  }

  return (
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
        onClick={() => setRejecting(true)}
        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
      >
        <X className="h-4 w-4" /> Não aprovar
      </button>
    </div>
  );
}
