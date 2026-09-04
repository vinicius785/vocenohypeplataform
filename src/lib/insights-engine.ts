/**
 * "Insights do Time" — motor de regras determinístico (item 35 do
 * pedido: "não depender obrigatoriamente de IA generativa"). Cada regra
 * é uma função pura `(bundle) => Insight | null`, sem I/O — quem chama
 * (`TimeSection.tsx`, `MemberProfileDialog.tsx`) já resolveu todos os
 * dados reais num `MemberInsightBundle` antes de rodar `generateInsights`.
 *
 * Nunca escreve no Score Operacional nem recalcula pontuação — insights
 * só LEEM métricas já computadas em outro lugar (entregas, prazos,
 * reuniões, início do dia, Score) e interpretam, nunca alteram.
 *
 * Escopo desta primeira entrega (confirmado com o usuário): onde o
 * pedido original citava um streak exato (ex. "3 semanas consecutivas",
 * "há 18 dias sem atraso"), sem um histórico diário salvo isso não é
 * computável de forma auditável — as regras abaixo comparam PERÍODO
 * ATUAL vs. PERÍODO ANTERIOR EQUIVALENTE em vez de rastrear
 * consecutividade (mesmo padrão já usado pro Score, `previousEquivalentRange`
 * em `performance-engine.ts`). "Mais projetos que o padrão" compara com a
 * média do TIME (não há série histórica por pessoa) — único uso de
 * benchmark cruzado, permitido pelo pedido quando não vira ranking.
 */

export type InsightNature = "destaque" | "atencao" | "tendencia";
export type InsightCategory =
  | "execucao"
  | "carga"
  | "prazos"
  | "evolucao"
  | "reunioes"
  | "rotina"
  | "distribuicao"
  | "risco";

export type Insight = {
  ruleId: string;
  memberId: string;
  memberName: string;
  nature: InsightNature;
  category: InsightCategory;
  text: string;
  priority: number;
};

/** Thresholds centralizados — nenhum número mágico espalhado nas regras
 * (item 35 do pedido). Ajustar comportamento das regras é só editar
 * aqui. */
export const INSIGHT_THRESHOLDS = {
  volumeAcimaPct: 0.2,
  volumeAbaixoPct: 0.2,
  atrasadasMin: 3,
  atrasadasAltaPrioridadeMin: 1,
  atrasadasAntigasDias: 5,
  pontualidadeVariacaoPP: 10,
  replanejamentosVariacaoMin: 2,
  concentracaoPct: 0.6,
  reunioesPerdidasMin: 2,
  reunioesPrevistasMin: 2,
  scoreVariacaoMin: 10,
  semAtrasoDias: 14,
  atrasoMedioReducaoMinDias: 0.5,
  inicioDiaFrequenciaMinRegistros: 5,
  inicioDiaAntesDasHora: 8,
  projetosAcimaMediaTimePct: 0.3,
  amostraMinima: 3,
} as const;

/** Bundle de dados de UM membro — sempre resolvido pelo chamador, nenhuma
 * regra busca dado sozinha. Campos `null`/`undefined` significam "sem
 * amostra suficiente", nunca "zero" — cada regra checa explicitamente. */
export type MemberInsightBundle = {
  memberId: string;
  memberName: string;
  role?: string;

  // Volume de entregas
  thisWeekTotal: number;
  monthlyWeeklyAvg: number | null;

  // Execução/prazos — período atual vs. anterior equivalente
  onTimeRateCurrent: number | null; // 0-100
  onTimeRatePrevious: number | null;
  onTimeSampleCurrent: number;
  onTimeSamplePrevious: number;
  avgDelayDaysCurrent: number | null;
  avgDelayDaysPrevious: number | null;
  replansCurrent: number;
  replansPrevious: number;

  // Situação atual de atraso
  overdueCount: number;
  overdueHighPriorityCount: number;
  overdueOlderThanThresholdCount: number;
  noOverdueForDays: number | null;

  // Score Operacional (só leitura — nunca recalculado aqui). `scorePeriodLabel`
  // descreve a janela usada na comparação (Time: sempre "últimos 30 dias";
  // Perfil: reaproveita o período já selecionado na própria ficha, pra não
  // precisar de um fetch de eventos a mais só pros insights).
  scoreNow: number | null;
  scorePrevious: number | null;
  scorePeriodLabel: string;

  // Carga/distribuição
  openTasksCount: number;
  activeProjectsCount: number;
  teamAvgActiveProjects: number | null;
  topConcentrationLabel: string | null;
  topConcentrationPct: number | null;

  // Reuniões
  meetingsExpected: number;
  meetingsAttended: number;

  // Início do dia
  earlyStartCount: number | null;
  earlyStartWindow: number | null;
};

type Rule = (b: MemberInsightBundle) => Omit<Insight, "memberId" | "memberName"> | null;

function pct(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function fmt1(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

const RULES: Rule[] = [
  // ---- prazos: risco (ação exigida — prioridade máxima) ----
  (b) => {
    const T = INSIGHT_THRESHOLDS;
    if (
      b.overdueCount < T.atrasadasMin ||
      b.overdueHighPriorityCount < T.atrasadasAltaPrioridadeMin
    )
      return null;
    const antigas =
      b.overdueOlderThanThresholdCount > 0
        ? ` e ${b.overdueOlderThanThresholdCount} atrasada${b.overdueOlderThanThresholdCount === 1 ? "" : "s"} há mais de ${T.atrasadasAntigasDias} dias`
        : "";
    return {
      ruleId: "atrasadas_prioridade_alta",
      nature: "atencao",
      category: "risco",
      priority: 100,
      text: `${b.memberName} possui ${b.overdueCount} tarefas atrasadas, sendo ${b.overdueHighPriorityCount} de prioridade alta${antigas}.`,
    };
  },

  // ---- reuniões perdidas (ação exigida) ----
  (b) => {
    const T = INSIGHT_THRESHOLDS;
    const missed = b.meetingsExpected - b.meetingsAttended;
    if (b.meetingsExpected < T.reunioesPrevistasMin || missed < T.reunioesPerdidasMin) return null;
    return {
      ruleId: "reunioes_perdidas",
      nature: "atencao",
      category: "reunioes",
      priority: 90,
      text: `${b.memberName} perdeu ${missed} das ${b.meetingsExpected} reuniões consideradas no período.`,
    };
  },

  // ---- execução: pontualidade caindo (mudança significativa) ----
  (b) => {
    const T = INSIGHT_THRESHOLDS;
    if (
      b.onTimeRateCurrent == null ||
      b.onTimeRatePrevious == null ||
      b.onTimeSampleCurrent < T.amostraMinima ||
      b.onTimeSamplePrevious < T.amostraMinima
    )
      return null;
    const drop = b.onTimeRatePrevious - b.onTimeRateCurrent;
    if (drop < T.pontualidadeVariacaoPP) return null;
    const volumeAcima =
      b.monthlyWeeklyAvg != null && b.thisWeekTotal > b.monthlyWeeklyAvg * (1 + T.volumeAcimaPct);
    const volumeTexto = volumeAcima
      ? `${b.memberName} está com volume ${pct(b.thisWeekTotal - b.monthlyWeeklyAvg!, b.monthlyWeeklyAvg!)}% acima da própria média mensal, mas a`
      : `A`;
    return {
      ruleId: "pontualidade_queda",
      nature: "atencao",
      category: "execucao",
      priority: 85,
      text: `${volumeTexto} taxa de conclusão no prazo de ${b.memberName} caiu de ${Math.round(b.onTimeRatePrevious)}% para ${Math.round(b.onTimeRateCurrent)}%.`,
    };
  },

  // ---- evolução: replanejamentos em alta ----
  (b) => {
    const T = INSIGHT_THRESHOLDS;
    const increase = b.replansCurrent - b.replansPrevious;
    if (increase < T.replanejamentosVariacaoMin) return null;
    return {
      ruleId: "replanejamentos_alta",
      nature: "atencao",
      category: "prazos",
      priority: 75,
      text: `${b.memberName} teve aumento de replanejamentos no período (${b.replansPrevious} → ${b.replansCurrent}).`,
    };
  },

  // ---- evolução: score caiu ----
  (b) => {
    const T = INSIGHT_THRESHOLDS;
    if (b.scoreNow == null || b.scorePrevious == null) return null;
    const delta = b.scoreNow - b.scorePrevious;
    if (delta > -T.scoreVariacaoMin) return null;
    return {
      ruleId: "score_queda",
      nature: "atencao",
      category: "evolucao",
      priority: 80,
      text: `Score Operacional de ${b.memberName} caiu ${Math.abs(delta)} pontos ${b.scorePeriodLabel}.`,
    };
  },

  // ---- evolução: score subiu (evolução positiva relevante) ----
  (b) => {
    const T = INSIGHT_THRESHOLDS;
    if (b.scoreNow == null || b.scorePrevious == null) return null;
    const delta = b.scoreNow - b.scorePrevious;
    if (delta < T.scoreVariacaoMin) return null;
    return {
      ruleId: "score_evolucao",
      nature: "destaque",
      category: "evolucao",
      priority: 70,
      text: `Score Operacional de ${b.memberName} subiu ${delta} pontos ${b.scorePeriodLabel}.`,
    };
  },

  // ---- prazos: sem atraso há N dias (evolução positiva) ----
  (b) => {
    const T = INSIGHT_THRESHOLDS;
    if (b.overdueCount > 0) return null;
    if (b.noOverdueForDays == null || b.noOverdueForDays < T.semAtrasoDias) return null;
    return {
      ruleId: "sem_atraso_consistente",
      nature: "destaque",
      category: "prazos",
      priority: 65,
      text: `${b.memberName} não teve conclusões atrasadas nos últimos ${b.noOverdueForDays} dias e está sem tarefas vencidas em aberto.`,
    };
  },

  // ---- execução: atraso médio caindo ----
  (b) => {
    const T = INSIGHT_THRESHOLDS;
    if (b.avgDelayDaysCurrent == null || b.avgDelayDaysPrevious == null) return null;
    const reduction = b.avgDelayDaysPrevious - b.avgDelayDaysCurrent;
    if (reduction < T.atrasoMedioReducaoMinDias) return null;
    return {
      ruleId: "atraso_medio_reducao",
      nature: "tendencia",
      category: "execucao",
      priority: 60,
      text: `${b.memberName} reduziu o tempo médio de atraso de ${fmt1(b.avgDelayDaysPrevious)}d para ${fmt1(b.avgDelayDaysCurrent)}d.`,
    };
  },

  // ---- execução: volume acima da média (destaque, sem queda de pontualidade) ----
  (b) => {
    const T = INSIGHT_THRESHOLDS;
    if (b.monthlyWeeklyAvg == null || b.monthlyWeeklyAvg <= 0) return null;
    if (b.thisWeekTotal <= b.monthlyWeeklyAvg * (1 + T.volumeAcimaPct)) return null;
    const p = pct(b.thisWeekTotal - b.monthlyWeeklyAvg, b.monthlyWeeklyAvg);
    const onTimeTexto =
      b.onTimeRateCurrent != null && b.onTimeSampleCurrent >= T.amostraMinima
        ? ` e mantém ${Math.round(b.onTimeRateCurrent)}% das conclusões no prazo`
        : "";
    return {
      ruleId: "volume_acima_media",
      nature: "destaque",
      category: "execucao",
      priority: 55,
      text: `${b.memberName} está com volume ${p}% acima da própria média mensal${onTimeTexto}.`,
    };
  },

  // ---- carga: concentração relevante ----
  (b) => {
    const T = INSIGHT_THRESHOLDS;
    if (
      b.topConcentrationPct == null ||
      b.topConcentrationLabel == null ||
      b.topConcentrationPct < T.concentracaoPct
    )
      return null;
    return {
      ruleId: "concentracao_carga",
      nature: "tendencia",
      category: "carga",
      priority: 45,
      text: `${b.memberName} concentra ${Math.round(b.topConcentrationPct * 100)}% da carga atual em ${b.topConcentrationLabel}.`,
    };
  },

  // ---- carga: mais projetos simultâneos que a média do time ----
  (b) => {
    const T = INSIGHT_THRESHOLDS;
    if (b.teamAvgActiveProjects == null || b.teamAvgActiveProjects <= 0) return null;
    if (b.activeProjectsCount <= b.teamAvgActiveProjects * (1 + T.projetosAcimaMediaTimePct))
      return null;
    return {
      ruleId: "projetos_acima_media_time",
      nature: "tendencia",
      category: "distribuicao",
      priority: 40,
      text: `${b.memberName} está atuando em ${b.activeProjectsCount} projetos/campanhas simultaneamente, acima da média do time (${fmt1(b.teamAvgActiveProjects)}).`,
    };
  },

  // ---- execução: volume abaixo da média (informativo, nunca "problema") ----
  (b) => {
    const T = INSIGHT_THRESHOLDS;
    if (b.monthlyWeeklyAvg == null || b.monthlyWeeklyAvg <= 0) return null;
    if (b.thisWeekTotal >= b.monthlyWeeklyAvg * (1 - T.volumeAbaixoPct)) return null;
    const p = pct(b.monthlyWeeklyAvg - b.thisWeekTotal, b.monthlyWeeklyAvg);
    return {
      ruleId: "volume_abaixo_media",
      nature: "tendencia",
      category: "execucao",
      priority: 30,
      text: `${b.memberName} está com volume ${p}% abaixo da própria média mensal.`,
    };
  },

  // ---- rotina: frequência de início do dia (nunca liga a produtividade) ----
  (b) => {
    const T = INSIGHT_THRESHOLDS;
    if (b.earlyStartCount == null || b.earlyStartWindow == null) return null;
    if (b.earlyStartWindow < T.inicioDiaFrequenciaMinRegistros) return null;
    return {
      ruleId: "inicio_dia_frequencia",
      nature: "tendencia",
      category: "rotina",
      priority: 20,
      text: `${b.memberName} registrou início antes das 0${T.inicioDiaAntesDasHora}:00 em ${b.earlyStartCount} dos últimos ${b.earlyStartWindow} dias registrados.`,
    };
  },
];

/** Roda todas as regras contra todos os bundles, junta os não-nulos,
 * ordena por prioridade e corta em `maxResults`. Nunca mais de 1 insight
 * do mesmo `ruleId` para a mesma pessoa (cada regra roda 1x por pessoa,
 * já garante isso por construção). */
export function generateInsights(bundles: MemberInsightBundle[], maxResults = 5): Insight[] {
  const all: Insight[] = [];
  for (const bundle of bundles) {
    for (const rule of RULES) {
      const result = rule(bundle);
      if (result) {
        all.push({ ...result, memberId: bundle.memberId, memberName: bundle.memberName });
      }
    }
  }
  return all.sort((a, b) => b.priority - a.priority).slice(0, maxResults);
}
