import { AlertTriangle, MessageCircle, Phone, UserRound } from "lucide-react";
import type { Lead } from "@/lib/comercial";
import { formatBRL } from "@/lib/comercial";
import { legacyStage } from "@/lib/comercial-engine";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { normalizePhoneDigits } from "@/lib/social-profiles";
import { avatarAccent, initialsOf } from "@/components/team/member-ui";
import { contactSubline, leadSituation } from "@/lib/comercial-lead-view";

/**
 * Card da oportunidade — responde, sem abrir a ficha: QUEM é (nome + cargo),
 * QUANTO vale, QUAL a situação e O QUE fazer (o CTA "Registrar follow-up").
 * A "situação" é UMA frase (`leadSituation`): a próxima ação combinada, se
 * houver; senão "aguardando retorno" ou o tempo desde o último contato —
 * sempre em texto discreto, sem badges. O resto (e-mail, telefone, origem,
 * proposta, histórico…) vive na ficha.
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
  const situation = leadSituation(lead);
  const subline = contactSubline(lead.contact, lead.role);
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
      className={`surface-card p-4 text-sm transition-all hover:bg-muted/30 ${
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
          <p
            className="truncate text-[15px] font-semibold text-foreground"
            title={lead.company || lead.name}
          >
            {lead.company || lead.name}
          </p>
          {subline && (
            <p className="mt-0.5 truncate text-xs text-text-secondary" title={subline}>
              {subline}
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          {lead.value ? (
            <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums text-foreground">
              {formatBRL(lead.value)}
            </span>
          ) : (
            <span className="text-xs text-text-secondary">Valor a definir</span>
          )}
          {lead.responsible ? (
            <span
              title={`Responsável: ${lead.responsible}`}
              aria-label={`Responsável: ${lead.responsible}`}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarAccent(
                lead.responsible,
              )}`}
            >
              {initialsOf(lead.responsible, "?")}
            </span>
          ) : (
            <span
              title="Sem responsável"
              aria-label="Sem responsável"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-text-secondary"
            >
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
        </div>

        {/* A situação: uma frase, texto discreto (cor só para ação vencida/de hoje). */}
        <p
          title={[situation.prefix, situation.text].filter(Boolean).join(" ")}
          className={`mt-2 flex items-center gap-1 text-xs ${
            situation.tone === "danger"
              ? "font-medium text-danger-soft-foreground"
              : situation.tone === "warning"
                ? "font-medium text-warning-soft-foreground"
                : situation.tone === "neutral"
                  ? "text-foreground"
                  : "text-text-secondary"
          }`}
        >
          {situation.tone === "danger" && (
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">
            {situation.prefix && (
              <span className="font-normal text-text-secondary">{situation.prefix} </span>
            )}
            {situation.text}
          </span>
        </p>
      </div>

      {!isTerminal && (
        <>
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
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-text-secondary hover:text-foreground"
                    >
                      <a
                        href={`https://wa.me/${whatsappDigits}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Abrir WhatsApp"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MessageCircle />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Abrir WhatsApp</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </>
      )}
    </div>
  );
}
