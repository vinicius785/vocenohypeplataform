import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X, ChevronDown } from "lucide-react";
import {
  respondCampanhaInfluSession,
  respondCampanhaEntregaSession,
} from "@/lib/portal-auth.functions";
import { PERFIL_REJEICAO_MOTIVOS } from "@/lib/campanha-status";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { deriveApprovalItems } from "../lib/derive";
import type { ApprovalItem, ApprovalKind } from "../types/approvals";

/**
 * Central de Aprovações — todas as decisões pendentes num único lugar,
 * segmentadas por tipo (nunca uma lista misturada). Ação real: chama as
 * MESMAS server functions que já existem (`respondCampanhaInfluSession`/
 * `respondCampanhaEntregaSession`, ver `portal-auth.functions.ts`) — a V2
 * não inventa um novo caminho de escrita, só uma apresentação nova.
 */

const KIND_LABEL: Record<ApprovalKind, string> = {
  influencer: "Influenciadores",
  content: "Conteúdos",
  briefing: "Briefings",
};

const PRIORITY_TONE: Record<ApprovalItem["priority"], string> = {
  high: "border-l-danger",
  medium: "border-l-warning",
  low: "border-l-brand",
};

function RejectMenu({
  onConfirm,
  disabled,
}: {
  onConfirm: (motivoLabel: (typeof PERFIL_REJEICAO_MOTIVOS)[number], comentario?: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState<(typeof PERFIL_REJEICAO_MOTIVOS)[number] | "">("");
  const [comentario, setComentario] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" /> Não aprovar
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-border bg-muted/30 p-2 sm:w-64">
      <select
        value={motivo}
        onChange={(e) => setMotivo(e.target.value as (typeof PERFIL_REJEICAO_MOTIVOS)[number])}
        className="rounded-md border border-border bg-card px-2 py-1.5 text-xs"
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
          className="min-h-16 rounded-md border border-border bg-card px-2 py-1.5 text-xs"
        />
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={!motivo || (motivo === "Outro" && !comentario.trim())}
          onClick={() => {
            if (!motivo) return;
            onConfirm(motivo, motivo === "Outro" ? comentario.trim() : undefined);
            setOpen(false);
            setMotivo("");
            setComentario("");
          }}
          className="rounded-md bg-danger px-2.5 py-1 text-xs font-medium text-brand-foreground disabled:opacity-50"
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}

export function AprovacoesV2() {
  const { data, reload, readOnly } = usePortalSessionData();
  const queryClient = useQueryClient();
  const [activeKind, setActiveKind] = useState<ApprovalKind | "todas">("todas");
  const [expanded, setExpanded] = useState<string | null>(null);

  const respondInfluFn = useServerFn(respondCampanhaInfluSession);
  const respondEntregaFn = useServerFn(respondCampanhaEntregaSession);

  const items = useMemo(() => deriveApprovalItems(data), [data]);
  const filtered = activeKind === "todas" ? items : items.filter((i) => i.kind === activeKind);

  const counts: Record<ApprovalKind, number> = {
    influencer: items.filter((i) => i.kind === "influencer").length,
    content: items.filter((i) => i.kind === "content").length,
    briefing: items.filter((i) => i.kind === "briefing").length,
  };

  const influMutation = useMutation({
    mutationFn: (vars: {
      campanhaId: string;
      influencerId: string;
      status: "aprovado" | "reprovado";
      motivoLabel?: (typeof PERFIL_REJEICAO_MOTIVOS)[number];
      comentario?: string;
    }) => respondInfluFn({ data: vars }),
    onSuccess: () => {
      reload();
      queryClient.invalidateQueries();
      toast.success("Decisão registrada.");
    },
    onError: () => toast.error("Não foi possível registrar a decisão. Tente novamente."),
  });

  const entregaMutation = useMutation({
    mutationFn: (vars: {
      campanhaId: string;
      influencerId: string;
      entregaId: string;
      status: "aprovado" | "reprovado";
      motivo?: string;
    }) => respondEntregaFn({ data: vars }),
    onSuccess: () => {
      reload();
      queryClient.invalidateQueries();
      toast.success("Decisão registrada.");
    },
    onError: () => toast.error("Não foi possível registrar a decisão. Tente novamente."),
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Aprovações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todas as decisões pendentes num único lugar.
        </p>
      </header>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setActiveKind("todas")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            activeKind === "todas"
              ? "bg-brand/10 text-brand"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Todas ({items.length})
        </button>
        {(["influencer", "content", "briefing"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setActiveKind(k)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              activeKind === k ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {KIND_LABEL[k]} ({counts[k]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma pendência{" "}
          {activeKind !== "todas" ? `em ${KIND_LABEL[activeKind].toLowerCase()}` : ""} agora.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => {
            const isPendingMutation =
              (item.kind !== "content" && influMutation.isPending) ||
              (item.kind === "content" && entregaMutation.isPending);
            return (
              <div
                key={item.id}
                className={`flex flex-col gap-2 rounded-lg border border-border border-l-4 bg-card px-4 py-3 ${PRIORITY_TONE[item.priority]}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.campanhaNome}
                      {item.subtitle ? ` · ${item.subtitle}` : ""}
                      {item.dueLabel ? ` · ${item.dueLabel}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                    aria-label="Detalhes"
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${expanded === item.id ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>

                {item.kind !== "briefing" && !readOnly && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isPendingMutation}
                      onClick={() => {
                        if (item.kind === "influencer") {
                          influMutation.mutate({
                            campanhaId: item.campanhaId,
                            influencerId: item.influencerId,
                            status: "aprovado",
                          });
                        } else {
                          entregaMutation.mutate({
                            campanhaId: item.campanhaId,
                            influencerId: item.influencerId,
                            entregaId: item.entregaId!,
                            status: "aprovado",
                          });
                        }
                      }}
                      className="flex items-center gap-1 rounded-md bg-success px-2.5 py-1.5 text-xs font-medium text-brand-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </button>

                    {item.kind === "influencer" ? (
                      <RejectMenu
                        disabled={isPendingMutation}
                        onConfirm={(motivoLabel, comentario) =>
                          influMutation.mutate({
                            campanhaId: item.campanhaId,
                            influencerId: item.influencerId,
                            status: "reprovado",
                            motivoLabel,
                            comentario,
                          })
                        }
                      />
                    ) : (
                      <ContentAdjustButton
                        disabled={isPendingMutation}
                        onConfirm={(motivo) =>
                          entregaMutation.mutate({
                            campanhaId: item.campanhaId,
                            influencerId: item.influencerId,
                            entregaId: item.entregaId!,
                            status: "reprovado",
                            motivo,
                          })
                        }
                      />
                    )}
                  </div>
                )}
                {item.kind === "briefing" && (
                  <p className="text-xs text-muted-foreground">
                    Aguardando o time confirmar o briefing personalizado — nenhuma ação sua
                    necessária ainda.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContentAdjustButton({
  onConfirm,
  disabled,
}: {
  onConfirm: (motivo: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [comentario, setComentario] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-warning hover:bg-warning-soft disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" /> Solicitar ajustes
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-border bg-muted/30 p-2 sm:w-72">
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder="Descreva o ajuste necessário (obrigatório)..."
        className="min-h-16 rounded-md border border-border bg-card px-2 py-1.5 text-xs"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={!comentario.trim()}
          onClick={() => {
            onConfirm(comentario.trim());
            setOpen(false);
            setComentario("");
          }}
          className="rounded-md bg-warning px-2.5 py-1 text-xs font-medium text-brand-foreground disabled:opacity-50"
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}
