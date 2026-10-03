import type { ReactNode } from "react";
import { KpiCell, KpiStrip } from "@/components/shared/Kpi";

/** Legenda curta de um grupo de KPIs ("Agora", "Neste mês"). */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="px-1 text-[11px] font-medium text-text-secondary">{title}</p>
      {children}
    </div>
  );
}

/**
 * Faixa de resumo operacional — responde de relance: quantas abertas,
 * quantas vencem hoje, quantas atrasadas, quantas bloqueadas (estado
 * ATUAL) e, no período escolhido, quantas foram concluídas, quanto saiu no
 * prazo e como está a resposta no chat. Sem ranking, sem número gigante.
 */
export function TimeSummaryStrip({
  openCount,
  dueTodayCount,
  overdueCount,
  blockedCount,
  blockedHint,
  completedCount,
  onTimePct,
  onTimeSample,
  responseLabel,
  responseHint,
  periodLabel,
  onOpenAberto,
  onOpenHoje,
  onOpenAtrasadas,
  onOpenBloqueadas,
}: {
  openCount: number;
  dueTodayCount: number;
  overdueCount: number;
  blockedCount: number;
  blockedHint: string | null;
  completedCount: number;
  onTimePct: number | null;
  onTimeSample: number;
  responseLabel: string;
  responseHint: string | null;
  periodLabel: string;
  onOpenAberto: () => void;
  onOpenHoje: () => void;
  onOpenAtrasadas: () => void;
  onOpenBloqueadas: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,4fr)_minmax(0,3fr)]">
      <Group title="Agora">
        <KpiStrip aria-label="Tarefas agora">
          <KpiCell label="Abertas" value={openCount} onClick={onOpenAberto} />
          <KpiCell label="Vencem hoje" value={dueTodayCount} tone="warning" onClick={onOpenHoje} />
          <KpiCell label="Atrasadas" value={overdueCount} tone="danger" onClick={onOpenAtrasadas} />
          <KpiCell
            label="Bloqueadas"
            value={blockedCount}
            complement={blockedHint ?? undefined}
            onClick={blockedCount > 0 ? onOpenBloqueadas : undefined}
          />
        </KpiStrip>
      </Group>
      <Group title={periodLabel}>
        <KpiStrip aria-label={`Resultados ${periodLabel.toLowerCase()}`}>
          <KpiCell label="Concluídas" value={completedCount} />
          <KpiCell
            label="No prazo"
            value={onTimePct == null ? "—" : `${Math.round(onTimePct)}%`}
            complement={
              onTimeSample === 0
                ? "Sem conclusões avaliadas"
                : `${onTimeSample} ${onTimeSample === 1 ? "conclusão avaliada" : "conclusões avaliadas"}`
            }
          />
          <KpiCell label="Resposta média" value={responseLabel} complement={responseHint} />
        </KpiStrip>
      </Group>
    </div>
  );
}
