import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Lead } from "@/lib/comercial";
import {
  INTERACTION_TYPE_LABEL,
  INTERACTION_OUTCOME_LABEL,
  type InteractionType,
  type InteractionOutcome,
} from "@/lib/commercial-interactions.functions";

const INTERACTION_TYPES = Object.keys(INTERACTION_TYPE_LABEL) as InteractionType[];
const OUTCOMES = Object.keys(INTERACTION_OUTCOME_LABEL) as InteractionOutcome[];

/** ISO local (sem timezone) pra preencher um `<input type="datetime-local">`
 * com o momento atual — igual ao que o campo já produz ao ser editado. */
function nowForDateTimeLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

export type FollowUpInput = {
  interactionType: InteractionType;
  occurredAt: string;
  summary: string;
  outcome?: InteractionOutcome;
  nextActionDescription?: string;
  nextActionAt?: string;
};

const inputCls =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block space-y-1 text-xs font-medium text-text-secondary";

/**
 * Registro rápido de follow-up — SEM abrir a ficha completa do lead
 * (pedido explícito: o card precisa ter esse CTA direto). Modal compacto,
 * vira tela cheia no mobile (`mobileFullScreen`, já suportado por
 * `Dialog`). Nunca altera a etapa do pipeline sozinho — só grava a
 * interação e, se preenchida, a próxima ação (ver `registerFollowUp`).
 */
export function FollowUpDialog({
  lead,
  open,
  onOpenChange,
  onSubmit,
}: {
  lead: Lead;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (input: FollowUpInput) => Promise<void>;
}) {
  const [interactionType, setInteractionType] = useState<InteractionType | "">("");
  const [occurredAt, setOccurredAt] = useState(nowForDateTimeLocal());
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState<InteractionOutcome | "">("");
  const [hasNextAction, setHasNextAction] = useState(false);
  const [nextActionDescription, setNextActionDescription] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setInteractionType("");
    setOccurredAt(nowForDateTimeLocal());
    setSummary("");
    setOutcome("");
    setHasNextAction(false);
    setNextActionDescription("");
    setNextActionAt("");
    setError("");
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const canSave = interactionType !== "" && summary.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        interactionType: interactionType as InteractionType,
        occurredAt: new Date(occurredAt).toISOString(),
        summary: summary.trim(),
        outcome: outcome || undefined,
        nextActionDescription:
          hasNextAction && nextActionDescription.trim() ? nextActionDescription.trim() : undefined,
        nextActionAt:
          hasNextAction && nextActionAt ? new Date(nextActionAt).toISOString() : undefined,
      });
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar o follow-up.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent mobileFullScreen className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar follow-up</DialogTitle>
          <DialogDescription>
            {lead.company || lead.name}
            {lead.contact ? ` · ${lead.contact}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <label className={labelCls}>
            <span>Tipo de contato *</span>
            <select
              value={interactionType}
              onChange={(e) => setInteractionType(e.target.value as InteractionType)}
              className={inputCls}
            >
              <option value="" disabled>
                Selecione
              </option>
              {INTERACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INTERACTION_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>

          <label className={labelCls}>
            <span>Quando aconteceu</span>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className={labelCls}>
            <span>Resumo *</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="O que foi conversado ou combinado?"
              className={`${inputCls} h-20 resize-none py-2`}
              maxLength={2000}
            />
          </label>

          <label className={labelCls}>
            <span>Resultado do contato</span>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as InteractionOutcome)}
              className={inputCls}
            >
              <option value="">—</option>
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {INTERACTION_OUTCOME_LABEL[o]}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={!hasNextAction}
                onChange={(e) => setHasNextAction(!e.target.checked)}
              />
              Sem próxima ação
            </label>
            {hasNextAction && (
              <div className="space-y-2 pt-1">
                <label className={labelCls}>
                  <span>Próxima ação</span>
                  <input
                    value={nextActionDescription}
                    onChange={(e) => setNextActionDescription(e.target.value)}
                    placeholder="Ex.: Enviar apresentação comercial"
                    className={inputCls}
                    maxLength={300}
                  />
                </label>
                <label className={labelCls}>
                  <span>Data e hora</span>
                  <input
                    type="datetime-local"
                    value={nextActionAt}
                    onChange={(e) => setNextActionAt(e.target.value)}
                    className={inputCls}
                  />
                </label>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSave}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar follow-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
