import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Lead } from "@/lib/comercial";
import { formatBRL } from "@/lib/comercial";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_COLOR,
  legacyStage,
  type OpportunityStage,
} from "@/lib/comercial-engine";
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

  const byStage = useMemo(() => {
    const map = new Map<OpportunityStage, Lead[]>(OPPORTUNITY_STAGES.map((s) => [s, []]));
    for (const l of leads) {
      const key = legacyStage(l.stage);
      map.get(key)!.push(l);
    }
    return map;
  }, [leads]);

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
      {OPPORTUNITY_STAGES.map((stage) => {
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
            className={`flex max-h-[calc(100vh-260px)] w-[300px] shrink-0 flex-col rounded-xl border transition-colors ${
              dragOverCol === stage
                ? "border-foreground/30 bg-muted/10"
                : "border-border bg-background"
            }`}
          >
            <div className="sticky top-0 z-10 rounded-t-xl border-b border-border/60 bg-background px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${OPPORTUNITY_STAGE_COLOR[stage]}`}
                  />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {OPPORTUNITY_STAGE_LABEL[stage]}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onCreateInStage(stage)}
                  aria-label={`Nova oportunidade em ${OPPORTUNITY_STAGE_LABEL[stage]}`}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {items.length} · {formatBRL(sum)}
              </p>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {items.length === 0 ? (
                <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  Sem oportunidades
                </div>
              ) : (
                items.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    dragging={dragId === lead.id}
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
  );
}
