import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { NativeSelect } from "@/components/ui/native-select";

const INTERACTION_TYPES = Object.keys(INTERACTION_TYPE_LABEL) as InteractionType[];
const OUTCOMES = Object.keys(INTERACTION_OUTCOME_LABEL) as InteractionOutcome[];

/** ISO local (sem timezone) pra preencher um `<Input type="datetime-local">`
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

const labelCls = "block space-y-1.5 text-sm font-medium text-foreground";

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
            <NativeSelect
              value={interactionType}
              onChange={(e) => setInteractionType(e.target.value as InteractionType)}
            >
              <option value="" disabled>
                Selecione
              </option>
              {INTERACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INTERACTION_TYPE_LABEL[t]}
                </option>
              ))}
            </NativeSelect>
          </label>

          <label className={labelCls}>
            <span>Quando aconteceu</span>
            <Input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </label>

          <label className={labelCls}>
            <span>Resumo *</span>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="O que foi conversado ou combinado?"
              className="h-20 resize-none py-2"
              maxLength={2000}
            />
          </label>

          <label className={labelCls}>
            <span>Resultado do contato</span>
            <NativeSelect
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as InteractionOutcome)}
            >
              <option value="">—</option>
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {INTERACTION_OUTCOME_LABEL[o]}
                </option>
              ))}
            </NativeSelect>
          </label>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Input
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
                  <Input
                    value={nextActionDescription}
                    onChange={(e) => setNextActionDescription(e.target.value)}
                    placeholder="Ex.: Enviar apresentação comercial"
                    maxLength={300}
                  />
                </label>
                <label className={labelCls}>
                  <span>Data e hora</span>
                  <Input
                    type="datetime-local"
                    value={nextActionAt}
                    onChange={(e) => setNextActionAt(e.target.value)}
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
