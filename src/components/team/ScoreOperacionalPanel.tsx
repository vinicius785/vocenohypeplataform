import { useState } from "react";
import { Gauge, ChevronDown, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  classifyReplanTiming,
  REPLAN_TIMING_LABEL,
  SAMPLE_CONFIDENCE_LABEL,
  SCORE_CLASSIFICACAO_TONE,
  OPERATIONAL_SCORE_VERSION,
  COMPROMISSOS_MAX_PONTOS,
  ENTREGA_MAX_PONTOS,
  FLUXO_MAX_PONTOS,
  PREVISIBILIDADE_MAX_PONTOS,
  type PerformanceSettings,
  type ScoreOperacionalV2,
  type TaskOutcome,
} from "@/lib/performance-engine";
import type { DashTask } from "@/lib/task-aggregation";
import type { Meeting } from "@/lib/reunioes-store";
import {
  DEADLINE_CHANGE_MOTIVO_LABEL,
  type DeadlineChangeMotivo,
} from "@/components/tasks/task-people";
import { explainScore, scoreDimensionRows } from "@/lib/score-explanation";

export type ProfileCompletion = {
  outcome: TaskOutcome;
  delayMinutes: number;
  taskId?: string | null;
  taskTitle?: string | null;
  occurredAt: string;
};
export type ProfileDeadlineChange = {
  taskId?: string | null;
  taskTitle?: string | null;
  from?: string;
  isCritical: boolean;
  motivo?: string;
  exemptFromResponsibility: boolean;
  occurredAt: string;
};
export type ProfileAttendance = {
  attended: boolean;
  meetingId?: string | null;
  occurredAt: string;
};

/** "20% · 6 de 30 tarefas" — taxa SEMPRE acompanhada do "N de M" (item 5
 * do pedido: nunca mostrar só a taxa, nem só o número absoluto). */
function fmtTaxaComN(rate: number | null, n: number, total: number): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}% · ${n} de ${total}`;
}

/** Ícone pequeno com tooltip explicativo — reaproveitado nos títulos das
 * métricas mais complexas (item 16 do pedido). Precisa de um
 * `TooltipProvider` ancestral (envolve a seção do Score inteira). */
function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3 w-3 shrink-0 cursor-help text-text-secondary/70" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Painel do Score Operacional (card + composição transparente) —
 * extraído de `MemberProfileDialog` sem mudar nenhuma fórmula/texto, pra o
 * perfil da V1 e o perfil central da Time V2 mostrarem exatamente o mesmo
 * Score (uma única implementação da apresentação, nunca duas). Quem chama
 * calcula `score` (`computeMemberScoreV2`) e passa os eventos usados na
 * composição.
 */
export function ScoreOperacionalPanel({
  score,
  trendLabel,
  completions,
  deadlineChanges,
  attendance,
  meetingsById,
  performanceSettings,
  tasksForMember,
  openById,
  initialShowComposition,
}: {
  score: ScoreOperacionalV2;
  trendLabel: string | null;
  completions: ProfileCompletion[];
  deadlineChanges: ProfileDeadlineChange[];
  attendance: ProfileAttendance[];
  meetingsById: Map<string, Meeting>;
  performanceSettings: PerformanceSettings;
  tasksForMember: DashTask[];
  openById: (id: string) => void;
  initialShowComposition?: boolean;
}) {
  const entrega = score.entrega;
  const previsibilidade = score.previsibilidade;
  const compromissos = score.compromissos;
  const fluxo = score.fluxo;
  const rows = scoreDimensionRows(score);
  const explanation = explainScore(score);
  const scoreTone =
    score.score == null
      ? "text-text-secondary"
      : (SCORE_CLASSIFICACAO_TONE[score.classificacao ?? "Sem avaliação"] ?? "text-foreground");
  const [showComposition, setShowComposition] = useState(!!initialShowComposition);

  return (
    <TooltipProvider delayDuration={200}>
      <section className="rounded-lg border border-border p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
            <Gauge className="h-3.5 w-3.5" /> Score Operacional
            <InfoTip text="Mede como o trabalho está sendo executado: prazo, previsibilidade, compromissos e eficiência do fluxo de aprovação. Não é uma avaliação da pessoa nem inclui comunicação." />
          </p>
          <div className="text-right">
            <p
              className={`flex items-center justify-end gap-1.5 text-4xl font-normal tracking-tight ${scoreTone}`}
            >
              {score.score == null ? "—" : score.score}
              {score.score != null && <span className="text-base text-text-secondary">/100</span>}
            </p>
            {score.dataState === "sem_dados" && (
              <p className="text-xs font-medium text-text-secondary">Sem dados suficientes</p>
            )}
            {score.dataState === "provisorio" && (
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Provisório</p>
            )}
            {score.classificacao && (
              <p className="text-xs font-medium text-text-secondary">{score.classificacao}</p>
            )}
            {trendLabel && score.dataState !== "sem_dados" && (
              <p className="text-[11px] text-text-secondary">{trendLabel}</p>
            )}
          </div>
        </div>
        {score.dataState === "sem_dados" && (
          <p className="mt-3 rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] text-text-secondary">
            Nenhuma atividade operacional no período selecionado — sem tarefa concluída, tarefa
            aberta com prazo, ou reunião esperada neste recorte, não há base pra calcular um score.
          </p>
        )}
        {score.dataState === "provisorio" && (
          <p className="mt-3 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            Baseado em {score.amostra} tarefa{score.amostra === 1 ? "" : "s"} — amostra pequena (
            {SAMPLE_CONFIDENCE_LABEL[score.confidence].toLowerCase()}), ainda sem classificação
            definitiva e fora de comparações/rankings com outras pessoas.
          </p>
        )}
        {score.dataState === "definitivo" && (
          <p className="mt-3 text-[11px] text-text-secondary">
            Baseado em {score.amostra} tarefas no período ·{" "}
            {SAMPLE_CONFIDENCE_LABEL[score.confidence]}
          </p>
        )}

        {score.dataState !== "sem_dados" && explanation && (
          <p className="mt-3 text-sm text-foreground">{explanation}</p>
        )}

        <ul className="mt-5 space-y-3.5" aria-label="Dimensões do score">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{r.label}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {r.points == null ? (
                    <span className="font-normal text-text-secondary">Sem dados</span>
                  ) : (
                    <>
                      {r.points}
                      <span className="font-normal text-text-secondary"> / {r.max}</span>
                    </>
                  )}
                </span>
              </div>
              <div
                className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${r.label}: ${r.points ?? 0} de ${r.max}`}
              >
                <div
                  className="h-full rounded-full bg-foreground/70"
                  style={{
                    width: `${r.points == null ? 0 : Math.min(100, (r.points / r.max) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-text-secondary">{r.detail}</p>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setShowComposition((s) => !s)}
          className="mt-5 flex w-full items-center justify-between border-t border-border pt-4 text-[11px] font-medium text-text-secondary hover:text-foreground"
        >
          Ver composição do score
          <ChevronDown
            className={`h-3 w-3 transition-transform ${showComposition ? "rotate-180" : ""}`}
          />
        </button>

        {showComposition && (
          <div className="mt-4 space-y-4 rounded-lg border border-border bg-muted/20 p-4 text-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">
                  Confiabilidade de prazo — fórmula
                </span>
                <span className="tabular-nums text-text-secondary">
                  {score.entregaPontos == null ? "—" : score.entregaPontos} / {ENTREGA_MAX_PONTOS}
                </span>
              </div>
              <div className="mt-1.5 space-y-0.5 text-text-secondary">
                <p className="font-medium text-foreground/80">Conclusões no prazo (até 40 pts)</p>
                <p>
                  onTimeRate = concluídas no prazo ÷ concluídas com prazo definido ={" "}
                  {entrega.completedOnTime} ÷ {entrega.completedTasksWithDeadline} ={" "}
                  {entrega.onTimeRate == null ? "—" : `${Math.round(entrega.onTimeRate * 100)}%`}
                </p>
                <p>
                  Pontos: {entrega.onTimePoints == null ? "—" : entrega.onTimePoints.toFixed(1)} /
                  40
                </p>
                <p>Concluídas com atraso: {entrega.completedLate}</p>
                <p>
                  Sem prazo definido (ignoradas nesta taxa): {entrega.semPrazoCount} — não entram
                  nem a favor nem contra por não terem prazo pra comparar.
                </p>
                <p className="mt-2 font-medium text-foreground/80">
                  Saúde atual dos prazos (até 10 pts)
                </p>
                <p>
                  healthRate = 1 − (atraso ponderado ÷ base do período) = 1 − (
                  {entrega.weightedCurrentOverdue.toFixed(2)} ÷ {entrega.periodTaskBase}) ={" "}
                  {entrega.currentHealthRate == null
                    ? "—"
                    : `${Math.round(entrega.currentHealthRate * 100)}%`}
                </p>
                <p>
                  Pontos: {entrega.healthPoints == null ? "—" : entrega.healthPoints.toFixed(1)} /
                  10 · base do período (concluídas com prazo + abertas com prazo):{" "}
                  {entrega.periodTaskBase}
                </p>
              </div>

              {entrega.overdueDetails.filter((d) => d.weightedContribution > 0).length > 0 && (
                <div className="mt-2 rounded-md bg-background/60 p-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                    Tarefas que causaram desconto na saúde atual
                  </p>
                  <ul className="space-y-1 text-text-secondary">
                    {entrega.overdueDetails
                      .filter((d) => d.weightedContribution > 0)
                      .map((d) => {
                        const found = d.id ? tasksForMember.find((t) => t.id === d.id) : null;
                        const label = (
                          <>
                            <span className="min-w-0 flex-1 truncate">{d.title ?? "Tarefa"}</span>
                            <span className="shrink-0 text-destructive">
                              +{d.daysOverdue}d{d.highPriority ? " · alta prioridade" : ""}
                              {d.internallyBlocked ? " · bloqueada internamente" : ""} · peso{" "}
                              {d.weightedContribution.toFixed(2)}
                            </span>
                          </>
                        );
                        return (
                          <li key={d.id} className="flex items-center gap-2">
                            {found ? (
                              <button
                                type="button"
                                onClick={() => openById(found.id)}
                                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/50 hover:underline"
                              >
                                {label}
                              </button>
                            ) : (
                              <div className="flex w-full items-center gap-2 px-1 py-0.5">
                                {label}
                              </div>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                </div>
              )}

              {entrega.overdueDetails.filter((d) => d.externallyBlocked).length > 0 && (
                <div className="mt-2 rounded-md bg-background/60 p-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                    Dependências externas desconsideradas (bloqueio ativo)
                  </p>
                  <ul className="space-y-0.5 text-text-secondary">
                    {entrega.overdueDetails
                      .filter((d) => d.externallyBlocked)
                      .map((d) => (
                        <li key={d.id} className="truncate">
                          · {d.title ?? "Tarefa"} — atrasada há {d.daysOverdue}d, mas bloqueada
                          aguardando cliente/fornecedor, não penalizada.
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Previsibilidade</span>
                <span className="tabular-nums text-text-secondary">
                  {score.previsibilidadePontos == null ? "—" : score.previsibilidadePontos} /{" "}
                  {PREVISIBILIDADE_MAX_PONTOS}
                </span>
              </div>
              <div className="mt-1.5 space-y-0.5 text-text-secondary">
                <p>
                  predictabilityLoss = (sameDayRate + 4×lateReplanRate + 2×repeatedRate) ÷ 7 ×{" "}
                  {PREVISIBILIDADE_MAX_PONTOS} = {previsibilidade.predictabilityLoss.toFixed(1)} pts
                  descontados de {PREVISIBILIDADE_MAX_PONTOS}
                </p>
                <p>
                  Taxa de replanejamento:{" "}
                  {fmtTaxaComN(
                    previsibilidade.taxaReplanejamento,
                    previsibilidade.tarefasReplanejadas,
                    previsibilidade.tarefasElegiveis,
                  )}
                </p>
                <p>Replanejamentos antecipados (sem penalidade): {previsibilidade.earlyReplans}</p>
                <p>No dia (penalidade leve): {previsibilidade.sameDayReplans}</p>
                <p>Após vencimento (penalidade maior): {previsibilidade.lateReplans}</p>
                <p>
                  Repetições problemáticas na mesma tarefa:{" "}
                  {previsibilidade.repeatedProblematicReplans}
                </p>
                {previsibilidade.exemptedCount > 0 && (
                  <p>
                    Isentos por dependência externa registrada a tempo:{" "}
                    {previsibilidade.exemptedCount}
                  </p>
                )}
              </div>
            </div>

            {deadlineChanges.length > 0 && (
              <div className="border-t border-border pt-2">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                  Replanejamentos considerados no período
                </p>
                <ul className="space-y-0.5">
                  {deadlineChanges.map((d, i) => {
                    const timing = d.from
                      ? classifyReplanTiming(
                          d.from,
                          d.occurredAt,
                          performanceSettings.deadlineCutoffHour,
                        )
                      : null;
                    const isSevere = timing === "no_dia" || timing === "apos_vencimento";
                    const exempted = isSevere && d.exemptFromResponsibility;
                    return (
                      <li
                        key={`${d.taskId}_${i}`}
                        className="flex items-center justify-between gap-2 px-1 py-0.5"
                      >
                        <span className="min-w-0 flex-1 truncate">{d.taskTitle ?? "Tarefa"}</span>
                        <span
                          className={`shrink-0 ${isSevere && !exempted ? "text-destructive" : "text-text-secondary"}`}
                        >
                          {timing ? REPLAN_TIMING_LABEL[timing] : "—"}
                          {exempted && " · isento (dependência externa)"}
                          {d.motivo &&
                            ` · ${DEADLINE_CHANGE_MOTIVO_LABEL[d.motivo as DeadlineChangeMotivo] ?? d.motivo}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Compromissos</span>
                <span className="tabular-nums text-text-secondary">
                  {score.compromissosAplicavel
                    ? `${score.compromissosPontos} / ${COMPROMISSOS_MAX_PONTOS}`
                    : "Não aplicável"}
                </span>
              </div>
              <div className="mt-1.5 space-y-0.5 text-text-secondary">
                {score.compromissosAplicavel ? (
                  <>
                    <p>Reuniões consideradas: {compromissos.expected}</p>
                    <p>Participadas: {compromissos.attended}</p>
                    <p>Perdidas: {Math.max(0, compromissos.expected - compromissos.attended)}</p>
                    {attendance.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {attendance.slice(0, 8).map((a, i) => {
                          const meeting = a.meetingId ? meetingsById.get(a.meetingId) : null;
                          return (
                            <li key={a.meetingId ?? i} className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate">
                                {meeting?.titulo ?? "Reunião"}
                              </span>
                              <span
                                className={a.attended ? "text-text-secondary" : "text-destructive"}
                              >
                                {a.attended ? "Participou" : "Perdeu"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                ) : (
                  <p>
                    Nenhuma reunião esperada desta pessoa no período — peso redistribuído entre as
                    demais dimensões (não conta nem a favor nem contra).
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Fluxo sem retrabalho</span>
                <span className="tabular-nums text-text-secondary">
                  {score.fluxoAplicavel
                    ? `${score.fluxoPontos} / ${FLUXO_MAX_PONTOS}`
                    : "Sem dados"}
                </span>
              </div>
              <div className="mt-1.5 space-y-0.5 text-text-secondary">
                <p>
                  Entregas avaliadas (passaram por aprovação e foram resolvidas no período):{" "}
                  {fluxo.evaluated}
                </p>
                <p>Aprovadas sem passar por “Em ajustes”: {fluxo.clean}</p>
                <p>Passaram por ajustes: {fluxo.withAdjustments}</p>
                {fluxo.avgCycles != null && (
                  <p>
                    Ciclos de ajuste: {fluxo.cycles} no total ·{" "}
                    {fluxo.avgCycles.toFixed(1).replace(".", ",")} por entrega com ajuste
                  </p>
                )}
                <p>
                  {score.fluxoAplicavel
                    ? `Pontos = ${fluxo.rate == null ? "—" : Math.round(fluxo.rate * 100)}% × ${FLUXO_MAX_PONTOS} (entrega com vários ciclos conta uma vez só).`
                    : "Menos de 3 entregas avaliadas: a dimensão não entra no cálculo e o peso é redistribuído."}
                </p>
                <p>Mede o fluxo de aprovação, não a qualidade de quem entrega.</p>
              </div>
            </div>

            <div className="border-t border-border pt-2 text-text-secondary">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide">
                Dados desconsiderados nesta composição
              </p>
              <ul className="space-y-0.5">
                <li>
                  · {entrega.semPrazoCount} tarefa{entrega.semPrazoCount === 1 ? "" : "s"} concluída
                  {entrega.semPrazoCount === 1 ? "" : "s"} sem prazo definido — sem prazo pra
                  comparar, não entram na taxa de conclusão no prazo.
                </li>
                <li>
                  · Ausência não justificada em reunião conta contra a taxa de Compromissos — este
                  produto ainda não distingue "ausência justificada" de "não compareceu" no cadastro
                  de reuniões (gap documentado, não uma aproximação silenciosa).
                </li>
              </ul>
            </div>

            <p className="border-t border-border pt-2 text-[11px] text-text-secondary/70">
              Fórmula v{score.version} · Score Operacional (
              {OPERATIONAL_SCORE_VERSION === score.version ? "atual" : "versão anterior"})
            </p>

            {completions.length > 0 && (
              <div className="border-t border-border pt-2">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                  Tarefas concluídas no período
                </p>
                <ul className="space-y-0.5">
                  {completions.slice(0, 8).map((c, i) => {
                    const found = c.taskId ? tasksForMember.find((t) => t.id === c.taskId) : null;
                    const label =
                      c.outcome === "late"
                        ? "Atrasada"
                        : c.outcome === "early"
                          ? "Antecipada"
                          : "No prazo";
                    const content = (
                      <>
                        <span className="min-w-0 flex-1 truncate">{c.taskTitle ?? "Tarefa"}</span>
                        <span
                          className={`shrink-0 ${c.outcome === "late" ? "text-destructive" : "text-text-secondary"}`}
                        >
                          {label}
                        </span>
                      </>
                    );
                    return (
                      <li key={c.taskId ?? i}>
                        {found ? (
                          <button
                            type="button"
                            onClick={() => openById(found.id)}
                            className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/50 hover:underline"
                          >
                            {content}
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 px-1 py-0.5 text-text-secondary">
                            {content}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {completions.length > 8 && (
                  <p className="mt-1 text-[11px] text-text-secondary">
                    +{completions.length - 8} outra{completions.length - 8 === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            )}

            {deadlineChanges.length > 0 && (
              <div className="border-t border-border pt-2">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                  Replanejamentos no período
                </p>
                <ul className="space-y-0.5">
                  {deadlineChanges.slice(0, 8).map((d, i) => {
                    const timing = d.from
                      ? classifyReplanTiming(
                          d.from,
                          d.occurredAt,
                          performanceSettings.deadlineCutoffHour,
                        )
                      : null;
                    const isSevere = timing === "no_dia" || timing === "apos_vencimento";
                    return (
                      <li
                        key={`${d.taskId}_${i}`}
                        className="flex items-center justify-between gap-2 px-1 py-0.5"
                      >
                        <span className="min-w-0 flex-1 truncate">{d.taskTitle ?? "Tarefa"}</span>
                        <span
                          className={`shrink-0 ${isSevere ? "text-destructive" : "text-text-secondary"}`}
                        >
                          {timing ? REPLAN_TIMING_LABEL[timing] : "—"}
                          {d.motivo &&
                            ` · ${DEADLINE_CHANGE_MOTIVO_LABEL[d.motivo as DeadlineChangeMotivo] ?? d.motivo}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </TooltipProvider>
  );
}
