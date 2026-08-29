import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import {
  computeAggregateIndicators,
  type TaskOutcome,
  type PerformanceEventLike,
} from "@/lib/performance-engine";
import {
  DEADLINE_CHANGE_MOTIVO_LABEL,
  type DeadlineChangeMotivo,
} from "@/components/tasks/TaskBoard";
import { TeamMetricCard } from "./TeamMetricCard";

/**
 * Indicadores operacionais agregados do time inteiro (item 20) — ajuda a
 * identificar problema de PROCESSO, não só de pessoa (ex.: "40% dos
 * prazos alterados no próprio dia" é um sinal sobre planejamento, mesmo
 * que todo mundo entregue tudo no fim). Sempre visível — os dados aqui
 * são 100% agregados do time (nenhum recorte por pessoa), sem motivo
 * pra restringir a admin. Reaproveita o MESMO período selecionado em
 * "Performance do Time" (não tem seletor próprio).
 */
export function TeamIndicators({
  events,
  currentlyOverdueCount,
}: {
  events: PerformanceEventLike[];
  currentlyOverdueCount: number;
}) {
  const indicators = useMemo(() => {
    const completions = events
      .filter((e) => e.eventType === "task_completed")
      .map((e) => ({
        outcome: e.data.outcome as TaskOutcome,
        delayMinutes: (e.data.delayMinutes as number) ?? 0,
        // `taskId` é coluna de topo do evento, não `data.taskId` (que
        // nunca existiu ali — leitura antiga sempre resolvia `null`,
        // zerando `pctComPrazoAlterado` silenciosamente).
        taskId: e.taskId,
      }));
    const deadlineChanges = events
      .filter((e) => e.eventType === "task_deadline_changed")
      .map((e) => ({
        taskId: e.taskId,
        isCritical: !!e.data.isCritical,
        motivo: (e.data.motivo as string) ?? undefined,
        exemptFromResponsibility: !!e.data.exemptFromResponsibility,
      }));
    return computeAggregateIndicators(completions, deadlineChanges, currentlyOverdueCount);
  }, [events, currentlyOverdueCount]);

  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" /> Indicadores operacionais
        </h3>
        <span className="text-[11px] text-muted-foreground">
          Mesmo período selecionado em Performance do Time acima
        </span>
      </div>

      <p className="mb-2 mt-4 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Execução &amp; prazo
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TeamMetricCard label="No prazo" value={pct(indicators.pctNoPrazo)} />
        <TeamMetricCard
          label="Concluídas com atraso"
          value={pct(indicators.pctComAtraso)}
          tone={(indicators.pctComAtraso ?? 0) > 20 ? "danger" : "neutral"}
        />
        <TeamMetricCard
          label="Atualmente atrasadas"
          value={indicators.atualmenteAtrasadas}
          tone={indicators.atualmenteAtrasadas > 0 ? "danger" : "neutral"}
        />
        <TeamMetricCard
          label="Tempo médio de atraso"
          value={
            indicators.tempoMedioAtrasoDias == null
              ? "—"
              : `${indicators.tempoMedioAtrasoDias.toFixed(1)}d`
          }
        />
      </div>

      <p className="mb-2 mt-4 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Replanejamento
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TeamMetricCard label="Replanejamentos" value={indicators.qtdReplanejamentos} />
        <TeamMetricCard
          label="Replanejamentos no dia"
          value={indicators.qtdReplanejamentosNoDia}
          tone={indicators.qtdReplanejamentosNoDia > 0 ? "danger" : "neutral"}
        />
        <TeamMetricCard label="Com prazo alterado" value={pct(indicators.pctComPrazoAlterado)} />
        <TeamMetricCard label="Dependência externa" value={pct(indicators.pctDependenciaExterna)} />
      </div>
      {indicators.motivosMaisComuns.length > 0 && (
        <div className="mt-3 rounded-lg border border-border p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Principais motivos de replanejamento
          </p>
          <ul className="space-y-1">
            {indicators.motivosMaisComuns.map((m) => (
              <li key={m.motivo} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {DEADLINE_CHANGE_MOTIVO_LABEL[m.motivo as DeadlineChangeMotivo] ?? m.motivo}
                </span>
                <span className="font-medium tabular-nums text-foreground">{m.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
