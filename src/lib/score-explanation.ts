import {
  COMPROMISSOS_MAX_PONTOS,
  ENTREGA_MAX_PONTOS,
  PREVISIBILIDADE_MAX_PONTOS,
  FLUXO_MAX_PONTOS,
  type ScoreOperacionalV2,
} from "@/lib/performance-engine";

/**
 * Explicação e linhas do Score Operacional — derivadas EXATAMENTE do `ScoreOperacionalV2` que o
 * motor calculou (mesmos números, nunca um segundo cálculo). A tela só apresenta o que sai daqui.
 */

export type ScoreDimensionRow = {
  key: "prazo" | "previsibilidade" | "compromissos" | "fluxo";
  label: string;
  /** Pontos exibidos; `null` = dimensão sem dados (peso redistribuído). */
  points: number | null;
  max: number;
  /** Uma linha curta de contexto (os números por trás dos pontos). */
  detail: string;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pct = (r: number) => `${Math.round(r * 100)}%`;

export function scoreDimensionRows(score: ScoreOperacionalV2): ScoreDimensionRow[] {
  const e = score.entrega;
  const p = score.previsibilidade;
  const c = score.compromissos;
  const f = score.fluxo;

  const replans = p.sameDayReplans + p.lateReplans + p.earlyReplans + p.exemptedCount;
  return [
    {
      key: "prazo",
      label: "Confiabilidade de prazo",
      points: score.entregaPontos,
      max: ENTREGA_MAX_PONTOS,
      detail:
        e.onTimeRate == null
          ? e.atualmenteAtrasadas > 0
            ? `${plural(e.atualmenteAtrasadas, "tarefa atrasada agora", "tarefas atrasadas agora")}`
            : "Sem conclusões com prazo no período"
          : `${pct(e.onTimeRate)} no prazo (${e.completedOnTime} de ${e.completedTasksWithDeadline})${e.atualmenteAtrasadas > 0 ? ` · ${plural(e.atualmenteAtrasadas, "atrasada agora", "atrasadas agora")}` : ""}`,
    },
    {
      key: "previsibilidade",
      label: "Previsibilidade",
      points: score.previsibilidadePontos,
      max: PREVISIBILIDADE_MAX_PONTOS,
      detail:
        score.previsibilidadePontos == null
          ? "Sem base no período"
          : replans === 0
            ? "Nenhum replanejamento no período"
            : `${plural(replans, "replanejamento", "replanejamentos")}${p.lateReplans > 0 ? ` · ${p.lateReplans} depois do vencimento` : ""}${p.sameDayReplans > 0 ? ` · ${p.sameDayReplans} no dia` : ""}`,
    },
    {
      key: "compromissos",
      label: "Compromissos",
      points: score.compromissosAplicavel ? score.compromissosPontos : null,
      max: COMPROMISSOS_MAX_PONTOS,
      detail: score.compromissosAplicavel
        ? `${c.attended} de ${plural(c.expected, "reunião", "reuniões")}`
        : "Sem reunião esperada no período",
    },
    {
      key: "fluxo",
      label: "Fluxo sem retrabalho",
      points: score.fluxoAplicavel ? score.fluxoPontos : null,
      max: FLUXO_MAX_PONTOS,
      detail:
        f.evaluated === 0
          ? "Nenhuma entrega passou por aprovação no período"
          : f.insufficient
            ? `${plural(f.evaluated, "entrega avaliada", "entregas avaliadas")} — amostra pequena demais para pontuar`
            : `${pct(f.rate ?? 0)} · ${f.clean} de ${plural(f.evaluated, "entrega", "entregas")} sem ajustes${f.withAdjustments > 0 ? ` · ${f.withAdjustments} passaram por ajustes` : ""}`,
    },
  ];
}

/** Frase única que explica a nota, com os mesmos números do motor. Vazia sem dados. */
export function explainScore(score: ScoreOperacionalV2): string {
  if (score.score == null) return "";
  const e = score.entrega;
  const p = score.previsibilidade;
  const f = score.fluxo;
  const parts: string[] = [];
  if (e.onTimeRate != null)
    parts.push(`${pct(e.onTimeRate)} das conclusões foram entregues no prazo`);
  const replans = p.sameDayReplans + p.lateReplans + p.earlyReplans + p.exemptedCount;
  if (score.previsibilidadePontos != null && replans > 0)
    parts.push(`houve ${plural(replans, "replanejamento", "replanejamentos")} no período`);
  if (score.compromissosAplicavel && score.compromissos.expected > 0)
    parts.push(
      `${score.compromissos.attended} de ${plural(score.compromissos.expected, "reunião", "reuniões")} com presença`,
    );
  if (score.fluxoAplicavel)
    parts.push(
      f.withAdjustments === 0
        ? `nenhuma das ${f.evaluated} entregas voltou para ajustes`
        : `${f.withAdjustments} das ${f.evaluated} entregas passaram por ajustes`,
    );
  if (parts.length === 0) return "";
  const sentence = parts.join("; ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
