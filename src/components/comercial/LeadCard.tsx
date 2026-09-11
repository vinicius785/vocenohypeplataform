import { Clock, AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import type { Lead } from "@/lib/comercial";
import { formatBRL } from "@/lib/comercial";
import {
  deriveOpportunityNextStep,
  daysSinceLastStageChange,
  isOpportunityStale,
  isNextActionOverdue,
  legacyStage,
} from "@/lib/comercial-engine";
import { avatarAccent, initialsOf } from "@/components/team/member-ui";

/**
 * Card da oportunidade — redesenhado pra mostrar só o que ajuda a decidir
 * rápido (empresa, contato, valor, responsável, próxima ação, tempo sem
 * interação) com UM tom de risco por card, nunca vários badges disputando
 * atenção. Cargo/setor/origem/observações ficam só no drawer.
 */

type CardTone = "neutral" | "blue" | "amber" | "red" | "green";

function cardSignal(lead: Lead): { tone: CardTone; text: string | null } {
  const stage = legacyStage(lead.stage);
  if (stage === "GANHO") return { tone: "green", text: null };
  if (stage === "PERDIDO") return { tone: "neutral", text: null };

  if (isNextActionOverdue(lead)) return { tone: "red", text: "Reunião vencida" };

  if (isOpportunityStale(lead)) {
    return { tone: "red", text: `Sem interação há ${daysSinceLastStageChange(lead)}d` };
  }

  if (lead.nextMeeting) {
    const days = Math.ceil((new Date(lead.nextMeeting).getTime() - Date.now()) / 86_400_000);
    if (days <= 2) return { tone: "amber", text: `Reunião em ${days === 0 ? "hoje" : `${days}d`}` };
    return { tone: "blue", text: "Reunião agendada" };
  }

  const step = deriveOpportunityNextStep(lead);
  if (step.action === null) return { tone: "neutral", text: null };
  return { tone: "neutral", text: null };
}

function fmtMeetingDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function LeadCard({
  lead,
  onOpen,
  onDragStart,
  onDragEnd,
  dragging,
  draggable = true,
}: {
  lead: Lead;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
  /** Drag nativo (HTML5) não existe em toque — o Kanban desativa isso no
   * mobile e usa o seletor de Etapa dentro do drawer da oportunidade. */
  draggable?: boolean;
}) {
  const step = deriveOpportunityNextStep(lead);
  const signal = cardSignal(lead);
  const stage = legacyStage(lead.stage);

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`cursor-pointer rounded-[18px] bg-card p-4 text-sm transition-all hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:shadow-none ${
        dragging ? "scale-[0.98] opacity-50 shadow-lg" : "shadow-sm"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-foreground">
          {lead.company || lead.name}
        </p>
        {lead.company && lead.name !== lead.company && (
          <p className="truncate text-xs text-text-secondary">{lead.name}</p>
        )}
        {lead.contact && (
          <p className="mt-0.5 truncate text-xs text-text-secondary">{lead.contact}</p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="whitespace-nowrap text-[15px] font-bold tabular-nums text-foreground">
          {formatBRL(lead.value || 0)}
        </span>
        {lead.responsible ? (
          <span
            title={lead.responsible}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarAccent(
              lead.responsible,
            )}`}
          >
            {initialsOf(lead.responsible, "?")}
          </span>
        ) : (
          <span
            title="Sem responsável"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-text-secondary"
          >
            —
          </span>
        )}
      </div>

      {stage === "GANHO" ? (
        <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" /> Ganho
        </div>
      ) : stage === "PERDIDO" ? (
        <div className="mt-2 text-[11px] text-muted-foreground">
          {lead.lossReason ? `Perdido — ${lead.lossReason}` : "Perdido"}
        </div>
      ) : (
        <>
          {step.actionLabel && (
            <div className="mt-2 flex items-center gap-1 truncate text-[11px] font-medium text-foreground">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  step.actor === "CLIENTE" ? "bg-sky-500" : "bg-amber-500"
                }`}
              />
              <span className="truncate">{step.actionLabel}</span>
              {lead.nextMeeting && (
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {fmtMeetingDate(lead.nextMeeting)}
                </span>
              )}
            </div>
          )}
          {!step.actionLabel && step.actor === "CLIENTE" && (
            <div className="mt-2 flex items-center gap-1 truncate text-[11px] text-sky-600 dark:text-sky-400">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
              Aguardando cliente
            </div>
          )}

          {signal.text &&
            (signal.tone === "red" ? (
              // Oportunidade parada/vencida — badge explícito em vez de
              // borda vermelha no card inteiro (o card continua com a
              // mesma superfície do sistema, só o rótulo carrega o risco).
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-1 text-[11px] font-medium text-danger">
                <AlertTriangle className="h-3 w-3" />
                {signal.text}
              </div>
            ) : (
              <div
                className={`mt-1.5 flex items-center gap-1 text-[11px] font-medium ${
                  signal.tone === "amber"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-sky-600 dark:text-sky-400"
                }`}
              >
                {signal.tone === "amber" ? (
                  <Clock className="h-3 w-3" />
                ) : (
                  <CalendarClock className="h-3 w-3" />
                )}
                {signal.text}
              </div>
            ))}
        </>
      )}
    </div>
  );
}
