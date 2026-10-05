import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AJUSTE_PHASE_LABEL,
  feedbackExcerpt,
  formatFeedbackWhen,
  type AjusteNextStep,
  type AjustePhase,
  type AjusteView,
} from "@/lib/entrega-ajustes";
import { cn } from "@/lib/utils";

const PHASE_DOT: Record<AjustePhase, string> = {
  solicitados: "bg-amber-500",
  em_ajustes: "bg-sky-500",
  reenviado: "bg-muted-foreground/60",
};

/** Status da entrega no ciclo de ajustes: pontinho + rótulo, discreto (sem painel colorido). */
export function AjusteStatusPill({ phase }: { phase: AjustePhase }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PHASE_DOT[phase])} />
      {AJUSTE_PHASE_LABEL[phase]}
    </span>
  );
}

/** "Feedback do cliente": quem, quando, etapa e um resumo curto; o texto completo abre à parte. */
export function EntregaFeedbackSection({ view }: { view: AjusteView }) {
  const [open, setOpen] = useState(false);
  const { veredito } = view;
  const excerpt = feedbackExcerpt(veredito.motivo);
  const when = formatFeedbackWhen(veredito.respondedAt);
  return (
    <section aria-label="Feedback do cliente" className="space-y-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        Feedback do cliente
      </h3>
      <p className="text-xs text-text-secondary">
        {veredito.autorNome || "Cliente"}
        {when ? ` · ${when}` : ""}
      </p>
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">{view.etapaLabel}</p>
        <p className="whitespace-pre-line break-words border-l-2 border-border pl-3 text-sm leading-relaxed text-foreground">
          “{excerpt.text}”
        </p>
      </div>
      {excerpt.truncated && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-text-secondary underline-offset-2 hover:text-foreground hover:underline"
        >
          Ver feedback completo
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Feedback do cliente — {view.etapaLabel}</DialogTitle>
            <DialogDescription>
              {veredito.autorNome || "Cliente"}
              {when ? ` · ${when}` : ""}
            </DialogDescription>
          </DialogHeader>
          <p className="max-h-[60vh] overflow-y-auto whitespace-pre-line break-words text-sm leading-relaxed text-foreground">
            {veredito.motivo}
          </p>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** "Próximo passo": UMA ação principal por momento e o que acontece depois dela. */
export function EntregaProximoPasso({
  step,
  busy,
  note,
  onRun,
}: {
  step: Pick<AjusteNextStep, "label" | "afterText">;
  busy?: boolean;
  /** Aviso discreto (ex.: o roteiro ainda não foi atualizado desde o feedback). */
  note?: string;
  onRun: () => void;
}) {
  return (
    <section aria-label="Próximo passo" className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        Próximo passo
      </h3>
      <Button variant="primary" className="w-full sm:w-auto" onClick={onRun} disabled={busy}>
        {busy ? "Enviando..." : step.label}
      </Button>
      {note && <p className="text-xs text-warning-soft-foreground">{note}</p>}
      <p className="text-xs text-text-secondary">{step.afterText}</p>
    </section>
  );
}
