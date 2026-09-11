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
function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "danger";
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p
        className={`mt-1 whitespace-nowrap text-xl font-bold tabular-nums leading-none ${
          tone === "danger" ? "text-danger" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

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
    <div className="rounded-[24px] bg-card p-5 dark:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
          <BarChart3 className="h-4 w-4 text-text-secondary" /> Indicadores operacionais
        </h3>
        <span className="text-[11px] text-text-secondary">
          Mesmo período selecionado em Performance do Time acima
        </span>
      </div>

      {/* Superfície consolidada com divisores discretos entre grupos —
       * antes cada indicador era um card com borda própria (correção). */}
      <div className="mt-4 space-y-4">
        <div className="border-b border-border/60 pb-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            Execução &amp; prazo
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="No prazo" value={pct(indicators.pctNoPrazo)} />
            <Stat
              label="Concluídas com atraso"
              value={pct(indicators.pctComAtraso)}
              tone={(indicators.pctComAtraso ?? 0) > 20 ? "danger" : "neutral"}
            />
            <Stat
              label="Atualmente atrasadas"
              value={indicators.atualmenteAtrasadas}
              tone={indicators.atualmenteAtrasadas > 0 ? "danger" : "neutral"}
            />
            <Stat
              label="Tempo médio de atraso"
              value={
                indicators.tempoMedioAtrasoDias == null
                  ? "—"
                  : `${indicators.tempoMedioAtrasoDias.toFixed(1)}d`
              }
            />
          </div>
        </div>

        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            Replanejamento &amp; dependências
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Replanejamentos" value={indicators.qtdReplanejamentos} />
            <Stat
              label="Replanejamentos no dia"
              value={indicators.qtdReplanejamentosNoDia}
              tone={indicators.qtdReplanejamentosNoDia > 0 ? "danger" : "neutral"}
            />
            <Stat label="Com prazo alterado" value={pct(indicators.pctComPrazoAlterado)} />
            <Stat label="Dependência externa" value={pct(indicators.pctDependenciaExterna)} />
          </div>
        </div>
      </div>

      {indicators.motivosMaisComuns.length > 0 && (
        <details className="mt-4 border-t border-border/60 pt-4">
          <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-wide text-text-secondary hover:text-foreground">
            Principais motivos de replanejamento
          </summary>
          <ul className="mt-3 space-y-1.5">
            {indicators.motivosMaisComuns.map((m) => (
              <li key={m.motivo} className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">
                  {DEADLINE_CHANGE_MOTIVO_LABEL[m.motivo as DeadlineChangeMotivo] ?? m.motivo}
                </span>
                <span className="font-medium tabular-nums text-foreground">{m.count}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
