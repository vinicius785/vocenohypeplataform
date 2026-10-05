import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
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
  AJUSTE_TRAIL,
  feedbackExcerpt,
  formatFeedbackWhen,
  reenviadoMessage,
  type AjusteNextStep,
  type AjustePhase,
  type AjusteView,
} from "@/lib/entrega-ajustes";
import { cn } from "@/lib/utils";

const PHASE_BADGE: Record<AjustePhase, string> = {
  solicitados: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  em_ajustes: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  reenviado: "border-border bg-muted/60 text-foreground",
};
const PHASE_DOT: Record<AjustePhase, string> = {
  solicitados: "bg-amber-500",
  em_ajustes: "bg-sky-500",
  reenviado: "bg-muted-foreground/60",
};

/** Status da entrega no ciclo de ajustes: badge pequeno, com leve tonalidade de atenção. */
export function AjusteStatusPill({ phase }: { phase: AjustePhase }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        PHASE_BADGE[phase],
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PHASE_DOT[phase])} />
      {AJUSTE_PHASE_LABEL[phase]}
    </span>
  );
}

/** Status sem ciclo de ajustes: mesmo formato, neutro (ou verde quando publicada). */
export function EntregaStatusBadge({ label, done }: { label: string; done?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        done
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-border bg-muted/60 text-foreground",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          done ? "bg-emerald-500" : "bg-muted-foreground/60",
        )}
      />
      {label}
    </span>
  );
}

/** Ajustes solicitados → Em ajustes → Aguardando aprovação: conta a história do ciclo. */
export function AjusteTrail({ phase }: { phase: AjustePhase }) {
  const current = AJUSTE_TRAIL.indexOf(phase);
  return (
    <ol
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]"
      aria-label="Ciclo de ajustes"
    >
      {AJUSTE_TRAIL.map((p, i) => (
        <li key={p} className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              i === current
                ? "font-semibold text-foreground"
                : i < current
                  ? "text-text-secondary line-through decoration-border"
                  : "text-text-secondary",
            )}
          >
            {AJUSTE_PHASE_LABEL[p]}
          </span>
          {i < AJUSTE_TRAIL.length - 1 && <ArrowRight className="h-3 w-3 text-text-secondary/60" />}
        </li>
      ))}
    </ol>
  );
}

/** Bloco do que exige ação: quem pediu, quando, em qual etapa e um resumo curto. Leve tonalidade de
 * atenção na superfície (sem painel colorido); depois do reenvio fica neutro como "feedback anterior". */
export function EntregaFeedbackSection({ view }: { view: AjusteView }) {
  const [open, setOpen] = useState(false);
  const { veredito } = view;
  const pending = view.phase !== "reenviado";
  const excerpt = feedbackExcerpt(veredito.motivo, pending ? 150 : 100);
  const when = formatFeedbackWhen(veredito.respondedAt);
  const who = veredito.autorNome || "Cliente";
  return (
    <section
      aria-label="Feedback do cliente"
      className={cn(
        "space-y-2 rounded-lg border p-3.5",
        pending ? "border-amber-500/20 bg-amber-500/[0.06]" : "border-border/60 bg-muted/20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {pending && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />}
            {pending ? "Ajustes solicitados pelo cliente" : "Feedback anterior do cliente"}
          </h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            {who}
            {when ? ` · ${when}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] font-medium text-foreground">
          {view.etapaLabel}
        </span>
      </div>
      <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground/90">
        “{excerpt.text}”
      </p>
      {excerpt.truncated && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-2 hover:underline"
        >
          Ver feedback completo <ArrowRight className="h-3 w-3" />
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Feedback do cliente — {view.etapaLabel}</DialogTitle>
            <DialogDescription>
              {who}
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

/** "Próxima ação": UMA ação principal por momento, a trilha do ciclo e o que acontece depois. */
export function EntregaProximoPasso({
  step,
  phase,
  busy,
  note,
  onRun,
}: {
  step: Pick<AjusteNextStep, "label" | "afterText">;
  phase: AjustePhase;
  busy?: boolean;
  /** Aviso discreto (ex.: o roteiro ainda não foi atualizado desde o feedback). */
  note?: string;
  onRun: () => void;
}) {
  return (
    <section aria-label="Próxima ação" className="space-y-2.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        Próxima ação
      </h3>
      <Button
        variant="primary"
        size="comfortable"
        className="w-full sm:w-auto"
        onClick={onRun}
        disabled={busy}
      >
        {busy ? "Enviando..." : step.label}
      </Button>
      {note && <p className="text-xs text-warning-soft-foreground">{note}</p>}
      <p className="text-xs text-text-secondary">{step.afterText}</p>
      <AjusteTrail phase={phase} />
    </section>
  );
}

/** Depois do reenvio: o status continua sendo a referência; aqui só um aviso pequeno. */
export function EntregaReenviadoNote({ view }: { view: AjusteView }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-text-secondary">
      <Check className="h-3.5 w-3.5 text-success" />
      {reenviadoMessage(view)}
    </p>
  );
}
