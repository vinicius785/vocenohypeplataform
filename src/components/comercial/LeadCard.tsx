import { AlertTriangle, MessageCircle, Phone } from "lucide-react";
import type { Lead } from "@/lib/comercial";
import { formatBRL } from "@/lib/comercial";
import {
  daysSinceLastContact,
  hasNoRecentContact,
  isNextActionOverdue,
  legacyStage,
} from "@/lib/comercial-engine";
import { normalizePhoneDigits } from "@/lib/social-profiles";
import { avatarAccent, initialsOf } from "@/components/team/member-ui";

/**
 * Card da oportunidade — SIMPLIFICADO (correção pedida): empresa, contato/
 * cargo, valor, próxima ação, tempo sem interação e o CTA operacional
 * principal ("Registrar follow-up"), sem badges/linhas concorrendo entre
 * si. "Próxima ação" (algo planejado, `nextActionAt`/`nextActionDescription`)
 * e "sem interação" (contato real, `lastContactAt`) são conceitos
 * diferentes — nunca misturados na mesma linha.
 */

function fmtShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type NextActionDisplay = { tone: "red" | "amber" | "neutral"; text: string } | null;

/** "Vencida há Xd", "Hoje às HH:mm", "Amanhã", ou a data curta — sempre
 * junto da descrição quando existir. */
function nextActionDisplay(lead: Lead): NextActionDisplay {
  if (!lead.nextActionAt) return null;
  const at = new Date(lead.nextActionAt);
  const now = new Date();
  const desc = lead.nextActionDescription ? ` · ${lead.nextActionDescription}` : "";

  if (lead.nextActionAt < now.getTime()) {
    const days = Math.max(1, Math.ceil((now.getTime() - lead.nextActionAt) / 86_400_000));
    return { tone: "red", text: `Vencida há ${days}d${desc}` };
  }
  if (isSameCalendarDay(at, now)) {
    const hh = at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return { tone: "amber", text: `Hoje às ${hh}${desc}` };
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameCalendarDay(at, tomorrow)) {
    return { tone: "neutral", text: `Amanhã${desc}` };
  }
  return { tone: "neutral", text: `${fmtShortDate(lead.nextActionAt)}${desc}` };
}

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
      className={`rounded-[18px] bg-card p-4 text-sm transition-all dark:shadow-none ${
        dragging ? "scale-[0.98] opacity-50 shadow-lg" : "shadow-sm"
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

        {isTerminal ? (
          <div className="mt-2 text-[11px] font-medium text-muted-foreground">
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
                  ? "text-danger"
                  : nextAction.tone === "amber"
                    ? "text-amber-600 dark:text-amber-400"
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRegisterFollowUp();
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted/70"
            >
              <Phone className="h-3 w-3" />
              Registrar follow-up
            </button>
            {hasWhatsapp && (
              <a
                href={`https://wa.me/${whatsappDigits}`}
                target="_blank"
                rel="noreferrer"
                title="Abrir WhatsApp"
                onClick={(e) => e.stopPropagation()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-muted hover:text-foreground"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
