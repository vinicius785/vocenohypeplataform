import type { ComponentType } from "react";
import {
  ArrowRightLeft,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Handshake,
  History,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { LeadHistoryEntry } from "@/lib/comercial";
import {
  formatTimelineWhen,
  type TimelineItem,
  type TimelineKind,
} from "@/lib/comercial-lead-view";
import { linkifyText } from "@/lib/linkify";
import { OPPORTUNITY_STAGE_LABEL } from "@/lib/comercial-engine";
import { stageVisual } from "@/lib/comercial-stage-config";

const KIND_ICON: Record<TimelineKind, ComponentType<{ className?: string }>> = {
  whatsapp: MessageCircle,
  ligacao: Phone,
  email: Mail,
  reuniao: Users,
  outro: MessageSquare,
  stage_change: ArrowRightLeft,
  meeting: CalendarDays,
  proposal: Calculator,
  value_change: CircleDollarSign,
  negotiation: Handshake,
  won: CheckCircle2,
  lost: XCircle,
  created: Sparkles,
};

/** Linha do tempo vertical: ícone por tipo, quando, quem, o que aconteceu e
 * a próxima ação combinada. `compact` (resumo na Visão geral) mostra só
 * tipo, quando e a primeira linha do texto. */
export function TimelineList({
  items,
  compact = false,
}: {
  items: TimelineItem[];
  compact?: boolean;
}) {
  return (
    <ul className={`border-l border-border/60 pl-6 ${compact ? "space-y-3" : "space-y-5"}`}>
      {items.map((item) => {
        const Icon = KIND_ICON[item.kind];
        return (
          <li key={item.id} className="relative text-sm">
            <span
              className="absolute -left-[34px] top-0 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-text-secondary"
              aria-hidden="true"
            >
              <Icon className="h-3 w-3" />
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-foreground">
                {item.title}
                {item.toStage && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${stageVisual(item.toStage).badge}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${stageVisual(item.toStage).dot}`}
                    />
                    {OPPORTUNITY_STAGE_LABEL[item.toStage]}
                  </span>
                )}
              </p>
              <p className="text-[11px] tabular-nums text-text-secondary">
                {formatTimelineWhen(item.at)}
              </p>
            </div>
            <p
              className={`mt-0.5 min-w-0 text-foreground [overflow-wrap:anywhere] ${
                compact ? "line-clamp-1" : "break-words"
              }`}
              title={compact ? item.text : undefined}
            >
              {compact ? item.text : linkifyText(item.text)}
            </p>
            {!compact && (item.author || item.outcome) && (
              <p className="mt-0.5 text-xs text-text-secondary">
                {[item.author, item.outcome && `Resultado: ${item.outcome}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {!compact && item.nextAction && (
              <p className="mt-0.5 text-xs text-text-secondary">
                Próxima ação: {item.nextAction.description || "—"} (
                {formatTimelineWhen(item.nextAction.at)})
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Aba Histórico — a linha do tempo comercial é o conteúdo; "Alterações do
 * lead" (auditoria) fica recolhida no fim, com peso visual bem menor. */
export function LeadHistoryPanel({
  items,
  history,
  auditOpen,
  onAuditOpenChange,
  onRegisterFollowUp,
}: {
  items: TimelineItem[];
  history: LeadHistoryEntry[];
  auditOpen: boolean;
  onAuditOpenChange: (open: boolean) => void;
  onRegisterFollowUp?: () => void;
}) {
  const audit = [...history].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="heading" aria-level={3} className="text-[15px] font-semibold text-foreground">
            Histórico comercial
          </p>
          {onRegisterFollowUp && (
            <Button variant="secondary" size="sm" onClick={onRegisterFollowUp}>
              <MessageSquare /> Registrar follow-up
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Nada registrado ainda. Os contatos e as mudanças de etapa aparecem aqui.
          </p>
        ) : (
          <TimelineList items={items} />
        )}
      </div>

      <Collapsible
        open={auditOpen}
        onOpenChange={onAuditOpenChange}
        className="border-t border-border/60 pt-3"
      >
        <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-md py-1 text-left text-xs font-medium text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronRight
            className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-90"
            aria-hidden="true"
          />
          Alterações do lead
          <span className="tabular-nums">({audit.length})</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          {audit.length === 0 ? (
            <p className="text-xs text-text-secondary">Sem eventos registrados.</p>
          ) : (
            <ul className="space-y-3 border-l border-border/60 pl-5">
              {audit.map((h) => (
                <li key={h.id} className="relative text-xs leading-relaxed">
                  <History
                    className="absolute -left-[27px] top-0.5 h-3 w-3 bg-background text-text-secondary"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 break-words text-foreground [overflow-wrap:anywhere]">
                    {linkifyText(h.text)}
                  </div>
                  <div className="tabular-nums text-text-secondary">
                    {formatTimelineWhen(h.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
