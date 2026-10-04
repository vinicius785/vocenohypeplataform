import { useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SimuladorPropostaForm } from "@/components/comercial/SimuladorPropostaDialog";
import { formatBRL, type Lead, type PropostaSnapshot } from "@/lib/comercial";
import type { deriveOpportunityNextStep, OpportunityActionKind } from "@/lib/comercial-engine";
import { propostaMargem } from "@/lib/comercial-lead-view";
import { BRASILIA_TZ } from "@/lib/timezone";

/** Retorno de `onApply`: `null` = aplicou; texto = mensagem de erro;
 * `"cancelled"` = a pessoa desistiu na confirmação. */
export type ApplyResult = string | null;
export const APPLY_CANCELLED = "cancelled";

/**
 * Aba Proposta — uma área de negociação comercial. Em cima, o que está
 * VALENDO (proposta aplicada); depois "Montar proposta": pacote → composição
 * financeira → preço final (com a ação de aplicar ao negócio). O simulador e
 * a fórmula (`calcPacote`) são os mesmos de antes.
 */
export function LeadProposal({
  proposta,
  lead,
  currentValue,
  nextStep,
  runningAction,
  onEnviarProposta,
  generatingLink,
  linkCopied,
  onCopyLink,
  onApply,
  onDirtyChange,
}: {
  proposta: PropostaSnapshot | undefined;
  lead: Lead | null;
  currentValue: number;
  nextStep: ReturnType<typeof deriveOpportunityNextStep> | null;
  runningAction: OpportunityActionKind | null;
  onEnviarProposta: () => void;
  generatingLink: boolean;
  linkCopied: boolean;
  onCopyLink: () => void;
  onApply: (precoFinal: number, snapshot: PropostaSnapshot) => Promise<ApplyResult>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const margem = proposta ? propostaMargem(proposta) : null;
  const canSend = !!lead && nextStep?.action === "enviar_proposta";

  const handleApply = async (precoFinal: number, snapshot: PropostaSnapshot) => {
    setApplying(true);
    setApplyError(null);
    try {
      const result = await onApply(precoFinal, snapshot);
      if (result === APPLY_CANCELLED) return;
      if (result) setApplyError(result);
      else toast.success(`Valor do negócio atualizado para ${formatBRL(precoFinal)}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      {proposta && margem && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-muted/40 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
              Proposta atual
            </p>
            <p className="mt-0.5 text-sm text-foreground">
              <span className="font-semibold tabular-nums">{formatBRL(proposta.precoFinal)}</span>
              {margem.pct != null && (
                <span className="text-text-secondary">
                  {" "}
                  · margem bruta {Math.round(margem.pct * 100)}%
                </span>
              )}
              <span className="text-text-secondary">
                {" "}
                · calculada em{" "}
                {new Date(proposta.calculadoEm).toLocaleDateString("pt-BR", {
                  timeZone: BRASILIA_TZ,
                })}
                {proposta.ajustadoManualmente ? " (ajustada manualmente)" : ""}
              </span>
            </p>
          </div>
          {canSend && (
            <Button
              variant="primary"
              size="sm"
              isLoading={runningAction === "enviar_proposta"}
              onClick={onEnviarProposta}
            >
              Enviar proposta
            </Button>
          )}
        </div>
      )}

      <div className="space-y-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="heading" aria-level={3} className="text-[15px] font-semibold text-foreground">
              Montar proposta
            </p>
            {lead && (
              <Button
                variant="ghost"
                size="sm"
                className="text-text-secondary"
                isLoading={generatingLink}
                onClick={onCopyLink}
                title="Copia o link da calculadora externa para enviar ou abrir numa call de venda"
              >
                {!generatingLink && <Link2 />}
                {linkCopied ? "Link copiado!" : "Calculadora externa"}
              </Button>
            )}
          </div>
          <p className="text-xs text-text-secondary">
            Defina os serviços e influenciadores que fazem parte desta oportunidade.
          </p>
        </div>

        <SimuladorPropostaForm
          initial={proposta}
          currentValue={currentValue}
          applying={applying}
          applyError={applyError}
          onDirtyChange={onDirtyChange}
          onApply={(precoFinal, snapshot) => void handleApply(precoFinal, snapshot)}
        />
      </div>
    </div>
  );
}
