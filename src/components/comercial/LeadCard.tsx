import { AlertTriangle, MessageCircle, Phone } from "lucide-react";
import type { Lead } from "@/lib/comercial";
import { formatBRL } from "@/lib/comercial";
import { daysSinceLastContact, hasNoRecentContact, legacyStage } from "@/lib/comercial-engine";
import { Button } from "@/components/ui/button";
import { normalizePhoneDigits } from "@/lib/social-profiles";
import { avatarAccent, initialsOf } from "@/components/team/member-ui";
import { nextActionDisplay } from "@/lib/comercial-lead-view";

/**
 * Card da oportunidade — SIMPLIFICADO (correção pedida): empresa, contato/
 * cargo, valor, próxima ação, tempo sem interação e o CTA operacional
 * principal ("Registrar follow-up"), sem badges/linhas concorrendo entre
 * si. "Próxima ação" (algo planejado, `nextActionAt`/`nextActionDescription`)
 * e "sem interação" (contato real, `lastContactAt`) são conceitos
 * diferentes — nunca misturados na mesma linha.
 */

export function LeadCard({
  lead,
  onOpen,
  onDragStart,
  onDragEnd,
  onRegisterFollowUp,
  dragging,
  draggable = true,
}: {
  lead: Lead;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRegisterFollowUp: () => void;
  dragging: boolean;
  /** Drag nativo (HTML5) não existe em toque — o Kanban desativa isso no
   * mobile e usa o seletor de Etapa dentro do drawer da oportunidade. */
  draggable?: boolean;
}) {
  const stage = legacyStage(lead.stage);
  const isTerminal = stage === "GANHO" || stage === "PERDIDO";
  const nextAction = !isTerminal ? nextActionDisplay(lead) : null;
  const noContact = !isTerminal && hasNoRecentContact(lead);
  const contactDays = daysSinceLastContact(lead);
  const rawDigits = lead.phone ? normalizePhoneDigits(lead.phone) : "";
  // Números brasileiros sem código do país (10-11 dígitos, com DDD) —
  // wa.me exige o formato internacional completo.
  const whatsappDigits =
    rawDigits.length === 10 || rawDigits.length === 11 ? `55${rawDigits}` : rawDigits;
  const hasWhatsapp = whatsappDigits.length >= 12;

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={`surface-card p-4 text-sm transition-all ${
        dragging ? "scale-[0.98] opacity-50 shadow-lg" : ""
      }`}
    >
      <div
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-foreground">
            {lead.company || lead.name}
          </p>
          {(lead.contact || lead.role) && (
            <p className="mt-0.5 truncate text-xs text-text-secondary">
              {lead.contact}
              {lead.contact && lead.role ? " · " : ""}
              {lead.role}
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums text-foreground">
            {formatBRL(lead.value || 0)}
          </span>
          {lead.responsible ? (
            <span
              title={lead.responsible}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarAccent(
                lead.responsible,
              )}`}
            >
              {initialsOf(lead.responsible, "?")}
            </span>
          ) : (
            <span
              title="Sem responsável"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-text-secondary"
            >
              —
            </span>
          )}
        </div>

        {isTerminal ? (
          <div className="mt-2 text-[11px] font-medium text-text-secondary">
            {stage === "GANHO"
              ? "Ganho"
              : lead.lossReason
                ? `Perdido — ${lead.lossReason}`
                : "Perdido"}
          </div>
        ) : (
          nextAction && (
            <div
              className={`mt-2 flex items-center gap-1 truncate text-[11px] font-medium ${
                nextAction.tone === "red"
                  ? "text-danger-soft-foreground"
                  : nextAction.tone === "amber"
                    ? "text-warning-soft-foreground"
                    : "text-foreground"
              }`}
            >
              {nextAction.tone === "red" && <AlertTriangle className="h-3 w-3 shrink-0" />}
              <span className="truncate">{nextAction.text}</span>
            </div>
          )
        )}
      </div>

      {!isTerminal && (
        <>
          {noContact && (
            <p className="mt-2 text-[11px] text-text-secondary">
              {contactDays === null ? "Nunca contatado" : `Sem interação há ${contactDays}d`}
            </p>
          )}
          <div className="mt-2.5 flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onRegisterFollowUp();
              }}
            >
              <Phone /> Registrar follow-up
            </Button>
            {hasWhatsapp && (
              <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <a
                  href={`https://wa.me/${whatsappDigits}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir WhatsApp"
                  aria-label="Abrir WhatsApp"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MessageCircle />
                </a>
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
