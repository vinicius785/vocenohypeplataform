import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Lead } from "@/lib/comercial";
import { formatBRL } from "@/lib/comercial";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_COLOR,
  OPPORTUNITY_STAGE_RING,
  legacyStage,
  type OpportunityStage,
} from "@/lib/comercial-engine";
import { useIsMobile } from "@/hooks/use-mobile";
import { LeadCard } from "./LeadCard";

/**
 * Kanban da oportunidade — largura total (descontando só a sidebar já
 * existente do app), colunas de ~300px com scroll horizontal e scroll
 * VERTICAL independente por coluna (cabeçalho fixo durante essa rolagem —
 * melhoria em relação ao Kanban de tarefas, que rola junto com a página).
 * Drag-and-drop nativo (HTML5, sem lib), mesmo padrão de
 * `src/components/tasks/TaskBoard.tsx`. As 9 etapas (`OPPORTUNITY_STAGES`,
 * incluindo PERDIDO) são a única fonte de verdade — nenhuma cópia paralela
 * de configuração de coluna.
 */
export function PipelineBoard({
  leads,
  onOpenLead,
  onMoveLead,
  onCreateInStage,
}: {
  leads: Lead[];
  onOpenLead: (lead: Lead) => void;
  onMoveLead: (id: string, stage: OpportunityStage) => void;
  onCreateInStage: (stage: OpportunityStage) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<OpportunityStage | null>(null);
  const isMobile = useIsMobile();
  const [mobileStage, setMobileStage] = useState<OpportunityStage>(OPPORTUNITY_STAGES[0]);

  const byStage = useMemo(() => {
    const map = new Map<OpportunityStage, Lead[]>(OPPORTUNITY_STAGES.map((s) => [s, []]));
    for (const l of leads) {
      const key = legacyStage(l.stage);
      map.get(key)!.push(l);
    }
    return map;
  }, [leads]);

  // Sem drag nativo em toque (ver LeadCard) — mobile mostra só a etapa
  // ativa, trocada por chips com contador, em vez da faixa lado a lado.
  const stagesToRender = isMobile ? [mobileStage] : OPPORTUNITY_STAGES;

  return (
    <div className="space-y-3">
      {isMobile && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {OPPORTUNITY_STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => setMobileStage(stage)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium ${
                mobileStage === stage
                  ? "bg-brand text-brand-foreground"
                  : "bg-card text-text-secondary"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${OPPORTUNITY_STAGE_COLOR[stage]}`} />
              {OPPORTUNITY_STAGE_LABEL[stage]}
              <span className="tabular-nums opacity-70">{byStage.get(stage)?.length ?? 0}</span>
            </button>
          ))}
        </div>
      )}
      {/* `relative` + fade à direita — indicação discreta de que há mais
       * etapas fora da viewport, sem esconder o scrollbar. */}
      <div className="relative">
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
          {stagesToRender.map((stage) => {
            const items = byStage.get(stage) ?? [];
            const sum = items.reduce((acc, l) => acc + (l.value || 0), 0);
            return (
              <div
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setDragOverCol(stage)}
                onDragLeave={() => setDragOverCol((cur) => (cur === stage ? null : cur))}
                onDrop={() => {
                  if (dragId) onMoveLead(dragId, stage);
                  setDragId(null);
                  setDragOverCol(null);
                }}
                className={`flex ${isMobile ? "w-full" : "w-[320px] shrink-0"} flex-col rounded-[20px] bg-muted/40 transition-colors dark:bg-white/[0.03] ${
                  dragOverCol === stage ? `ring-2 ${OPPORTUNITY_STAGE_RING[stage]}` : ""
                }`}
              >
                {/* Cabeçalho NÃO sticky (correção — Etapa 8): a coluna não
                 * tem mais seu próprio scroll vertical (`overflow-y-auto` +
                 * `max-h-*` saíram), então não existe mais um contexto de
                 * rolagem local pra um `sticky top-0` grudar sem se colar
                 * ao scroll da PÁGINA inteira (que passaria por cima de
                 * outro conteúdo ao rolar). A rolagem vertical única e
                 * real agora é a da página; o board só rola no eixo X. */}
                <div className="rounded-t-[20px] bg-muted/40 px-4 py-3 dark:bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${OPPORTUNITY_STAGE_COLOR[stage]}`}
                      />
                      <h3
                        title={OPPORTUNITY_STAGE_LABEL[stage]}
                        className="truncate text-[13px] font-semibold text-foreground"
                      >
                        {OPPORTUNITY_STAGE_LABEL[stage]}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => onCreateInStage(stage)}
                      aria-label={`Nova oportunidade em ${OPPORTUNITY_STAGE_LABEL[stage]}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-card hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-1 text-[12px] tabular-nums text-text-secondary">
                    {items.length} · {formatBRL(sum)}
                  </p>
                </div>

                <div className="space-y-2.5 p-3 pt-1">
                  {items.length === 0 ? (
                    <div className="rounded-[16px] bg-card/40 py-5 text-center text-xs text-text-secondary">
                      Sem oportunidades
                    </div>
                  ) : (
                    items.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        dragging={dragId === lead.id}
                        draggable={!isMobile}
                        onOpen={() => onOpenLead(lead)}
                        onDragStart={() => setDragId(lead.id)}
                        onDragEnd={() => setDragId(null)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {!isMobile && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-muted to-transparent dark:from-background" />
        )}
      </div>
    </div>
  );
}
