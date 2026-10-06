import { formatResponseDuration } from "@/lib/member-response-time";
import type { ViewId } from "./MemberViews";

/**
 * Insights do Time (V2) — "radar operacional". Cada insight é DADO → INTERPRETAÇÃO → CONTEXTO → AÇÃO:
 * `evidence` traz os números (e o contexto que os sustenta), `reading` traz a leitura gerencial
 * (o que isso significa / o que vale fazer) e `view` leva ao lugar certo no detalhe do membro.
 *
 * Regras de honestidade:
 * - volume NÃO é sobrecarga: "carga acima do esperado" exige parcela alta das abertas E das tarefas
 *   novas; backlog causado por atraso vira "acúmulo por atraso"; quem tem muitas tarefas mas
 *   conclui no prazo não gera insight;
 * - nada de "sobrecarga", "má comunicação", "baixa produtividade": só o que os números dizem;
 * - sem amostra mínima, sem insight;
 * - só dependências formais (`task_dependencies`).
 * Os limiares ficam em `TEAM_INSIGHT_THRESHOLDS` e TODA função recebe overrides, para ajuste depois
 * de ver dados reais sem mexer nas regras.
 */

export type TeamInsightCategory = "atencao" | "operacao" | "tendencia" | "destaque";
/** P0 exige ação agora · P1 risco/mudança relevante · P2 tendência útil · P3 reconhecimento. */
export type TeamInsightPriority = 0 | 1 | 2 | 3;

export type TeamInsightV2 = {
  id: string;
  ruleId: string;
  category: TeamInsightCategory;
  priority: TeamInsightPriority;
  /** Pessoa relacionada; ausente = insight do time. */
  memberId?: string;
  memberName?: string;
  /** Fato + contexto, com os números. */
  evidence: string;
  /** Interpretação / ação sugerida (leitura gerencial). */
  reading: string;
  /** Ressalva de método exibida junto (ex.: reatribuições distorcem a % de novas demandas). */
  caveat?: string;
  /** Aba do detalhe do membro e rótulo do link ("Ver tarefas →"). */
  view?: ViewId;
  actionLabel?: string;
  /** Desempate dentro da mesma prioridade (maior = mais forte). */
  weight: number;
  /** Tema para eliminar redundância: no máximo 1 insight por pessoa e tema. */
  topic: string;
  /** Ordem editorial dentro da lista (menor = antes; P0 sempre vem primeiro). */
  rank: number;
  /** Janela em que o número vale (ex.: "este mês"), mostrada discretamente. */
  window?: string;
  /** Rótulo curto que substitui o da categoria (ex.: "Maior demanda"). */
  label?: string;
};

export const TEAM_INSIGHT_THRESHOLDS = {
  amostraMinima: 3,
  amostraPrevisibilidade: 5,
  pontualidadeVariacaoPP: 10,
  pontualidadeQuedaForteP0: 20,
  acumuloMinAtrasadas: 3,
  acumuloPctAbertas: 0.5,
  cargaMinMembros: 4,
  cargaMinAbertas: 5,
  cargaPctAbertas: 0.3,
  cargaVsMedia: 1.5,
  novasPctCarga: 0.3,
  concentracaoNovasPct: 0.4,
  concentracaoMinNovas: 8,
  replanejamentoAlta: 2,
  respostaVariacaoPct: 30,
  respostaMinRespondidas: 5,
  bloqueioMin: 3,
  gargaloMin: 3,
  previsibilidadePct: 90,
  demandadoMinSinais: 3,
  demandadoVsMedia: 1.2,
  reunioesPerdidasMin: 2,
  reunioesPrevistasMin: 2,
  tendenciaTimePct: 20,
  tendenciaMinBase: 5,
  demandaPctNovas: 0.25,
  demandaVsMedia: 1.5,
  demandaMinNovas: 8,
  respostaLentaVsTime: 1.5,
  respostaRapidaVsTime: 0.5,
  respostaRapidaMin: 10,
  atrasosConcentradosMin: 6,
  atrasosConcentradosPct: 0.7,
  fluxoMinAvaliaveis: 5,
  fluxoMinPessoasTime: 3,
  fluxoMelhorPct: 0.9,
  fluxoAjustesAltoPct: 0.4,
  fluxoAjustesVsTime: 1.3,
  fluxoTendenciaPP: 10,
  fluxoTendenciaMinBase: 10,
  cargaBoaExecDemandaPct: 0.3,
  cargaBoaExecDemandaMinNovas: 8,
  maxInsights: 12,
  maxPorPessoa: 2,
  maxDestaques: 3,
  maxTendenciasTime: 3,
} as const;
export type InsightThresholds = { -readonly [K in keyof typeof TEAM_INSIGHT_THRESHOLDS]: number };

const th = (o?: Partial<InsightThresholds>): InsightThresholds => ({
  ...TEAM_INSIGHT_THRESHOLDS,
  ...o,
});

/** Sinais de UM membro, já resolvidos por quem chama (nenhuma regra busca dado sozinha). `null` =
 * sem amostra — nunca zero. */
export type MemberSignals = {
  id: string;
  name: string;
  openCount: number;
  overdueCount: number;
  overdueHighPriority: number;
  overdueOld: number;
  /** Tarefas criadas na janela atual / anterior cujo responsável ATUAL é o membro. */
  newTasks: number;
  newTasksPrev: number;
  onTimeRate: number | null;
  onTimeRatePrev: number | null;
  onTimeSample: number;
  onTimeSamplePrev: number;
  replans: number;
  replansPrev: number;
  criticalReplans: number;
  criticalReplansPrev: number;
  repeatedReplans: number;
  meetingsExpected: number;
  meetingsAttended: number;
  /** Tempo de resposta (segundos úteis) e nº de demandas respondidas, atual e anterior. */
  responseAvg: number | null;
  responseAvgPrev: number | null;
  answered: number;
  answeredPrev: number;
  /** Fluxo sem retrabalho (tarefas aprovadas no período; quantas passaram por "Em ajustes"). */
  flowEvaluated: number;
  flowWithAdjustments: number;
  flowEvaluatedPrev: number;
  flowWithAdjustmentsPrev: number;
};

export type DependencyTask = { id: string; title: string; memberIds: string[]; open: boolean };
export type DependencyEdge = { blockingTaskId: string; blockedTaskId: string };

export type TeamInsightsInput = {
  members: MemberSignals[];
  edges: DependencyEdge[];
  tasks: Map<string, DependencyTask>;
  /** Tarefas DISTINTAS criadas na janela (não a soma das atribuições). Base das % de novas demandas. */
  newTasksTotal?: number;
};

const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const first = (name: string) => name.split(" ")[0];
const mk = (
  i: Omit<TeamInsightV2, "id" | "weight" | "topic" | "rank"> & {
    weight?: number;
    topic?: string;
    rank?: number;
  },
): TeamInsightV2 => ({
  ...i,
  id: `${i.ruleId}:${i.memberId ?? "time"}`,
  weight: i.weight ?? 0,
  topic: i.topic ?? i.ruleId,
  rank: i.rank ?? 8,
});

/* ---------------- regras por pessoa ---------------- */

/** Atraso, em UMA frase (mesma causa): acúmulo por atraso e/ou queda de pontualidade. */
export function ruleAtraso(m: MemberSignals, o?: Partial<InsightThresholds>): TeamInsightV2 | null {
  const T = th(o);
  const acumulo =
    m.overdueCount >= T.acumuloMinAtrasadas &&
    m.openCount > 0 &&
    m.overdueCount / m.openCount >= T.acumuloPctAbertas;
  const drop =
    m.onTimeRate != null &&
    m.onTimeRatePrev != null &&
    m.onTimeSample >= T.amostraMinima &&
    m.onTimeSamplePrev >= T.amostraMinima
      ? m.onTimeRatePrev - m.onTimeRate
      : 0;
  const queda = drop >= T.pontualidadeVariacaoPP;
  const altaPrioridade = m.overdueCount >= T.acumuloMinAtrasadas && m.overdueHighPriority > 0;
  if (!acumulo && !queda && !altaPrioridade) return null;

  const partes: string[] = [];
  if (acumulo || altaPrioridade) {
    partes.push(
      `${m.name} tem ${plural(m.openCount, "tarefa aberta", "tarefas abertas")}, ${m.overdueCount} atrasada${m.overdueCount === 1 ? "" : "s"}` +
        (m.overdueHighPriority > 0 ? ` (${m.overdueHighPriority} de prioridade alta)` : "") +
        (m.overdueOld > 0 ? `, ${m.overdueOld} há mais de 5 dias` : ""),
    );
  }
  if (queda) {
    const frase = `a conclusão no prazo caiu de ${Math.round(m.onTimeRatePrev!)}% para ${Math.round(m.onTimeRate!)}%`;
    partes.push(partes.length ? `e ${frase}` : `${m.name}: ${frase}`);
  }
  const evidence = `${partes.join(", ")}.`;
  const reading =
    acumulo || altaPrioridade
      ? "O acúmulo vem de tarefas que não foram concluídas, não de volume novo — vale destravar as mais antigas antes de redistribuir."
      : "O ritmo de entrega no prazo piorou frente ao mês passado; vale entender o que mudou nas tarefas dela.";
  const p0 = altaPrioridade || m.overdueOld > 0 || drop >= T.pontualidadeQuedaForteP0;
  return mk({
    ruleId: "atraso",
    rank: 4,
    topic: "prazo",
    category: "atencao",
    priority: p0 ? 0 : 1,
    memberId: m.id,
    memberName: m.name,
    evidence,
    reading,
    view: "tarefas",
    actionLabel: `Ver tarefas de ${first(m.name)}`,
    weight: m.overdueCount * 2 + drop,
  });
}

/** Carga acima do esperado: parcela alta das abertas E das tarefas novas, sem ser backlog de atraso.
 * "Carga" não é diagnóstico de sobrecarga — só descreve onde o trabalho está concentrado. */
export function ruleCarga(
  m: MemberSignals,
  all: MemberSignals[],
  o?: Partial<InsightThresholds>,
  newTasksTotal?: number,
): TeamInsightV2 | null {
  const T = th(o);
  if (all.length < T.cargaMinMembros) return null;
  const totalOpen = all.reduce((s, x) => s + x.openCount, 0);
  const totalNew = newTasksTotal ?? all.reduce((s, x) => s + x.newTasks, 0);
  const avgOpen = totalOpen / all.length;
  const openShare = totalOpen > 0 ? m.openCount / totalOpen : 0;
  const newShare = totalNew > 0 ? m.newTasks / totalNew : 0;
  const mostlyOverdue = m.openCount > 0 && m.overdueCount / m.openCount >= T.acumuloPctAbertas;
  if (
    mostlyOverdue ||
    m.openCount < T.cargaMinAbertas ||
    openShare < T.cargaPctAbertas ||
    m.openCount < avgOpen * T.cargaVsMedia ||
    newShare < T.novasPctCarga
  )
    return null;
  return mk({
    ruleId: "carga_acima",
    topic: "demanda",
    rank: 3,
    label: "Carga",
    category: "operacao",
    priority: 1,
    memberId: m.id,
    memberName: m.name,
    evidence: `${m.name} concentra ${pct(m.openCount, totalOpen)}% das tarefas abertas do time e recebeu ${m.newTasks} das ${totalNew} tarefas criadas neste mês (${pct(m.newTasks, totalNew)}%).`,
    reading:
      "As duas medidas apontam para a mesma pessoa; vale revisar se a distribuição é intencional antes que vire gargalo.",
    caveat: CAVEAT_REATRIBUICAO,
    view: "tarefas",
    actionLabel: `Ver tarefas de ${first(m.name)}`,
    weight: openShare * 100 + newShare * 100,
  });
}

const CAVEAT_REATRIBUICAO =
  "Conta tarefas (sem subtarefas) pelo responsável atual; reatribuições podem distorcer a parcela de novas demandas.";

/** Demanda: quem recebeu o maior volume de tarefas novas. Separa VOLUME DE DEMANDA de sobrecarga:
 * só vira "mais demandado" (≥ 3 sinais independentes) quando outros sinais convergem — e mesmo
 * assim descreve volume, nunca conclui sobrecarga. */
export function ruleDemanda(
  all: MemberSignals[],
  o?: Partial<InsightThresholds>,
  newTasksTotal?: number,
): TeamInsightV2 | null {
  const T = th(o);
  if (all.length < T.cargaMinMembros) return null;
  const totalNew = newTasksTotal ?? all.reduce((s, x) => s + x.newTasks, 0);
  if (totalNew < T.demandaMinNovas) return null;
  const max = Math.max(...all.map((m) => m.newTasks));
  const lideres = all.filter((m) => m.newTasks === max);
  if (lideres.length !== 1) return null;
  const m = lideres[0];
  const share = m.newTasks / totalNew;
  if (share < T.demandaPctNovas || m.newTasks < (totalNew / all.length) * T.demandaVsMedia)
    return null;

  const lidera = (get: (x: MemberSignals) => number) => {
    const vals = all.map(get);
    const mx = Math.max(...vals);
    const media = vals.reduce((a, b) => a + b, 0) / vals.length;
    return (
      mx > 0 &&
      get(m) === mx &&
      vals.filter((v) => v === mx).length === 1 &&
      mx >= media * T.demandadoVsMedia
    );
  };
  const outros: string[] = [];
  if (lidera((x) => x.openCount)) outros.push("tarefas abertas");
  if (lidera((x) => x.meetingsAttended)) outros.push("reuniões");
  if (lidera((x) => x.answered)) outros.push("demandas respondidas");
  const convergente = 1 + outros.length >= T.demandadoMinSinais;
  const lista =
    outros.length > 1
      ? `${outros.slice(0, -1).join(", ")} e ${outros[outros.length - 1]}`
      : outros[0];
  const base = `${m.name} recebeu ${m.newTasks} das ${totalNew} tarefas criadas neste mês (${pct(m.newTasks, totalNew)}%)`;
  return mk({
    ruleId: convergente ? "mais_demandado" : "maior_volume_demandas",
    topic: "demanda",
    rank: 2,
    label: convergente ? "Mais demandado" : "Maior demanda",
    category: "operacao",
    priority: 2,
    memberId: m.id,
    memberName: m.name,
    evidence: convergente
      ? `${base} e também lidera em ${lista}.`
      : `${base}, o maior volume do time.`,
    reading: convergente
      ? "Vários sinais convergem para esta pessoa; é volume de demanda — vale conferir se o ritmo está sustentável."
      : "É volume de demanda recebida, não sobrecarga: pode ser papel, especialidade ou decisão de distribuição.",
    caveat: CAVEAT_REATRIBUICAO,
    view: "tarefas",
    actionLabel: `Ver tarefas de ${first(m.name)}`,
    weight: share * 100 + outros.length * 5,
  });
}

/** Quem tem o maior número de tarefas abertas (descritivo, com comparação à média). */
export function ruleMaisAbertas(
  all: MemberSignals[],
  o?: Partial<InsightThresholds>,
): TeamInsightV2 | null {
  const T = th(o);
  if (all.length < T.cargaMinMembros) return null;
  const max = Math.max(...all.map((m) => m.openCount));
  const topo = all.filter((m) => m.openCount === max);
  if (topo.length !== 1) return null;
  const m = topo[0];
  const avg = all.reduce((s, x) => s + x.openCount, 0) / all.length;
  if (m.openCount < T.cargaMinAbertas || m.openCount < avg * T.cargaVsMedia) return null;
  if (m.overdueCount / m.openCount >= T.acumuloPctAbertas) return null; // é atraso, não volume
  return mk({
    ruleId: "mais_abertas",
    topic: "demanda",
    rank: 3,
    label: "Tarefas abertas",
    category: "operacao",
    priority: 2,
    memberId: m.id,
    memberName: m.name,
    evidence: `${m.name} tem o maior número de tarefas abertas do time: ${m.openCount}, contra ${avg.toFixed(1).replace(".", ",")} em média por pessoa.`,
    reading: "Descreve volume em andamento, sem concluir sobre capacidade.",
    view: "tarefas",
    actionLabel: `Ver tarefas de ${first(m.name)}`,
    weight: m.openCount,
  });
}

/** Atrasos concentrados em poucas pessoas (insight do time). */
export function ruleAtrasosConcentrados(
  all: MemberSignals[],
  o?: Partial<InsightThresholds>,
): TeamInsightV2 | null {
  const T = th(o);
  if (all.length < T.cargaMinMembros) return null;
  const total = all.reduce((s, m) => s + m.overdueCount, 0);
  if (total < T.atrasosConcentradosMin) return null;
  const ord = [...all].sort((a, b) => b.overdueCount - a.overdueCount);
  const top2 = ord[0].overdueCount + ord[1].overdueCount;
  if (top2 / total < T.atrasosConcentradosPct) return null;
  return mk({
    ruleId: "atrasos_concentrados",
    topic: "atrasos_time",
    rank: 7,
    label: "Atrasos",
    category: "atencao",
    priority: 1,
    evidence: `${pct(top2, total)}% das ${total} tarefas atrasadas do time estão com ${ord[0].name} e ${ord[1].name}.`,
    reading: "Os atrasos não estão espalhados: destravar essas duas frentes resolve a maior parte.",
    weight: top2,
  });
}

/** Resposta mais lenta / mais rápida em relação à média do time (com amostra). */
export function ruleRespostaRelativa(
  all: MemberSignals[],
  o?: Partial<InsightThresholds>,
): TeamInsightV2[] {
  const T = th(o);
  const com = all.filter((m) => m.responseAvg != null && m.answered >= T.respostaMinRespondidas);
  if (com.length < T.cargaMinMembros) return [];
  const resp = com.reduce((s, m) => s + m.answered, 0);
  const media = com.reduce((s, m) => s + m.responseAvg! * m.answered, 0) / resp;
  const out: TeamInsightV2[] = [];
  const lento = [...com].sort((a, b) => b.responseAvg! - a.responseAvg!)[0];
  if (lento.responseAvg! >= media * T.respostaLentaVsTime)
    out.push(
      mk({
        ruleId: "resposta_mais_lenta",
        topic: "resposta",
        rank: 5,
        label: "Comunicação",
        category: "atencao",
        priority: 1,
        memberId: lento.id,
        memberName: lento.name,
        evidence: `${lento.name} tem o maior tempo médio de resposta do time: ${formatResponseDuration(lento.responseAvg)}, contra ${formatResponseDuration(media)} do time.`,
        reading: "Vale ver em que tipo de conversa a demora aparece antes de tirar conclusões.",
        view: "comunicacao",
        actionLabel: `Ver comunicação de ${first(lento.name)}`,
        weight: lento.responseAvg! / media,
      }),
    );
  const rapido = [...com].sort((a, b) => a.responseAvg! - b.responseAvg!)[0];
  if (
    rapido.answered >= T.respostaRapidaMin &&
    rapido.responseAvg! <= media * T.respostaRapidaVsTime
  )
    out.push(
      mk({
        ruleId: "resposta_mais_rapida",
        topic: "resposta",
        rank: 12,
        label: "Destaque",
        category: "destaque",
        priority: 3,
        memberId: rapido.id,
        memberName: rapido.name,
        evidence: `${rapido.name} responde mais rápido que o time: ${formatResponseDuration(rapido.responseAvg)} em média, contra ${formatResponseDuration(media)}.`,
        reading: "Quem depende desta pessoa é atendido mais rápido — vale reconhecer.",
        view: "comunicacao",
        actionLabel: `Ver comunicação de ${first(rapido.name)}`,
        weight: media / Math.max(rapido.responseAvg!, 1),
      }),
    );
  return out;
}

export function ruleReplanejamento(
  m: MemberSignals,
  o?: Partial<InsightThresholds>,
): TeamInsightV2 | null {
  const T = th(o);
  const aumento = m.criticalReplans - m.criticalReplansPrev;
  if (aumento < T.replanejamentoAlta && m.repeatedReplans <= 0) return null;
  const evidence =
    aumento >= T.replanejamentoAlta
      ? `${m.name} replanejou ${plural(m.criticalReplans, "tarefa", "tarefas")} no dia ou após o vencimento neste mês (eram ${m.criticalReplansPrev} antes).`
      : `${m.name} alterou o prazo da mesma tarefa mais de uma vez, no dia ou após o vencimento.`;
  return mk({
    ruleId: "replanejamento",
    rank: 6,
    topic: "replan",
    category: "atencao",
    priority: 1,
    memberId: m.id,
    memberName: m.name,
    evidence,
    reading:
      "Prazos que se movem em cima da hora costumam indicar estimativa ou dependência mal resolvida; vale combinar o que está travando.",
    view: "desempenho",
    actionLabel: `Ver desempenho de ${first(m.name)}`,
    weight: aumento + m.repeatedReplans,
  });
}

export function ruleReunioes(
  m: MemberSignals,
  o?: Partial<InsightThresholds>,
): TeamInsightV2 | null {
  const T = th(o);
  const perdidas = m.meetingsExpected - m.meetingsAttended;
  if (m.meetingsExpected < T.reunioesPrevistasMin || perdidas < T.reunioesPerdidasMin) return null;
  return mk({
    ruleId: "reunioes_perdidas",
    rank: 1,
    topic: "reunioes",
    category: "atencao",
    priority: 0,
    memberId: m.id,
    memberName: m.name,
    evidence: `${m.name} perdeu ${perdidas} das ${m.meetingsExpected} reuniões consideradas no período.`,
    reading: "Vale confirmar se houve conflito de agenda ou falha de convite.",
    view: "jornada",
    actionLabel: `Ver jornada de ${first(m.name)}`,
    weight: perdidas,
  });
}

/** Tempo médio de resposta: piorou ou melhorou de forma relevante (com amostra nos dois períodos). */
export function ruleResposta(
  m: MemberSignals,
  o?: Partial<InsightThresholds>,
): TeamInsightV2 | null {
  const T = th(o);
  if (
    m.responseAvg == null ||
    m.responseAvgPrev == null ||
    m.responseAvgPrev <= 0 ||
    m.answered < T.respostaMinRespondidas ||
    m.answeredPrev < T.respostaMinRespondidas
  )
    return null;
  const change = Math.round(((m.responseAvg - m.responseAvgPrev) / m.responseAvgPrev) * 100);
  if (Math.abs(change) < T.respostaVariacaoPct) return null;
  const de = formatResponseDuration(m.responseAvgPrev);
  const para = formatResponseDuration(m.responseAvg);
  if (change > 0)
    return mk({
      ruleId: "resposta_piora",
      rank: 5,
      topic: "resposta",
      category: "atencao",
      priority: 1,
      memberId: m.id,
      memberName: m.name,
      evidence: `O tempo médio de resposta de ${m.name} subiu ${change}% (de ${de} para ${para}) em ${m.answered} demandas respondidas.`,
      reading:
        "Respostas mais lentas atrasam quem depende desta pessoa; vale ver em que tipo de conversa a demora aparece.",
      view: "comunicacao",
      actionLabel: `Ver comunicação de ${first(m.name)}`,
      weight: change,
    });
  return mk({
    ruleId: "resposta_melhora",
    rank: 9,
    topic: "resposta",
    category: "destaque",
    priority: 3,
    memberId: m.id,
    memberName: m.name,
    evidence: `O tempo médio de resposta de ${m.name} caiu de ${de} para ${para} em ${m.answered} demandas respondidas.`,
    reading: "Quem depende desta pessoa está sendo atendido mais rápido — vale reconhecer.",
    view: "comunicacao",
    actionLabel: `Ver comunicação de ${first(m.name)}`,
    weight: Math.abs(change),
  });
}

export function ruleDestaque(
  m: MemberSignals,
  o?: Partial<InsightThresholds>,
): TeamInsightV2 | null {
  const T = th(o);
  if (m.onTimeRate == null || m.onTimeSample < T.amostraPrevisibilidade) return null;
  if (m.onTimeRate >= T.previsibilidadePct && m.criticalReplans === 0 && m.overdueCount === 0) {
    return mk({
      ruleId: "previsibilidade",
      rank: 12,
      topic: "prazo",
      category: "destaque",
      priority: 3,
      memberId: m.id,
      memberName: m.name,
      evidence: `${m.name} concluiu ${Math.round(m.onTimeRate)}% das ${m.onTimeSample} tarefas no prazo, sem replanejamentos críticos e sem tarefas atrasadas.`,
      reading: "Entrega previsível — boa referência de ritmo para o time.",
      view: "desempenho",
      actionLabel: `Ver ${first(m.name)}`,
      weight: m.onTimeRate + m.onTimeSample / 10,
    });
  }
  if (
    m.onTimeRatePrev != null &&
    m.onTimeSamplePrev >= T.amostraMinima &&
    m.onTimeRate - m.onTimeRatePrev >= T.pontualidadeVariacaoPP
  ) {
    return mk({
      ruleId: "pontualidade_melhora",
      rank: 8,
      topic: "prazo",
      category: "destaque",
      priority: 3,
      memberId: m.id,
      memberName: m.name,
      evidence: `A conclusão no prazo de ${m.name} subiu de ${Math.round(m.onTimeRatePrev)}% para ${Math.round(m.onTimeRate)}%.`,
      reading: "Melhora consistente frente ao mês passado — vale reconhecer.",
      view: "desempenho",
      actionLabel: `Ver ${first(m.name)}`,
      weight: m.onTimeRate - m.onTimeRatePrev,
    });
  }
  return null;
}

/* ---------------- fluxo sem retrabalho (eficiência de aprovação) ---------------- */

const adjRate = (m: MemberSignals) =>
  m.flowEvaluated > 0 ? m.flowWithAdjustments / m.flowEvaluated : null;

/** Melhor índice do time: aprovou ≥ 90% das entregas sem ajustes (amostra mínima e time comparável). */
export function ruleFluxoEficiencia(
  all: MemberSignals[],
  o?: Partial<InsightThresholds>,
): TeamInsightV2 | null {
  const T = th(o);
  const base = all.filter((m) => m.flowEvaluated >= T.fluxoMinAvaliaveis);
  if (base.length < T.fluxoMinPessoasTime) return null;
  const clean = (m: MemberSignals) => (m.flowEvaluated - m.flowWithAdjustments) / m.flowEvaluated;
  const best = Math.max(...base.map(clean));
  const top = base.filter((m) => clean(m) === best);
  if (top.length !== 1 || best < T.fluxoMelhorPct) return null;
  const m = top[0];
  return mk({
    ruleId: "fluxo_eficiente",
    topic: "fluxo",
    rank: 12,
    label: "Destaque",
    category: "destaque",
    priority: 3,
    memberId: m.id,
    memberName: m.name,
    evidence: `${m.name} aprovou ${pct(m.flowEvaluated - m.flowWithAdjustments, m.flowEvaluated)}% das entregas sem ajustes (${m.flowEvaluated - m.flowWithAdjustments} de ${m.flowEvaluated}). Melhor índice do time no período.`,
    reading:
      "As entregas chegam à aprovação sem voltar para ajustes — fluxo de aprovação eficiente.",
    view: "desempenho",
    actionLabel: `Ver ${first(m.name)}`,
    weight: clean(m) * 100 + m.flowEvaluated,
  });
}

/** Alta taxa de ajustes: ≥ 40% das entregas e acima da média do time. Neutro: ajuste é parte do fluxo. */
export function ruleFluxoAjustes(
  m: MemberSignals,
  all: MemberSignals[],
  o?: Partial<InsightThresholds>,
): TeamInsightV2 | null {
  const T = th(o);
  const rate = adjRate(m);
  if (rate == null || m.flowEvaluated < T.fluxoMinAvaliaveis || rate < T.fluxoAjustesAltoPct)
    return null;
  const base = all.filter((x) => x.flowEvaluated >= T.fluxoMinAvaliaveis);
  if (base.length < T.fluxoMinPessoasTime) return null;
  const totEval = base.reduce((s, x) => s + x.flowEvaluated, 0);
  const totAdj = base.reduce((s, x) => s + x.flowWithAdjustments, 0);
  const teamRate = totEval > 0 ? totAdj / totEval : 0;
  if (rate < teamRate * T.fluxoAjustesVsTime) return null;
  return mk({
    ruleId: "fluxo_ajustes_altos",
    topic: "fluxo",
    rank: 6,
    label: "Ajustes",
    category: "atencao",
    priority: 1,
    memberId: m.id,
    memberName: m.name,
    evidence: `${m.name} teve ajustes em ${Math.round(rate * 100)}% das entregas (${m.flowWithAdjustments} de ${m.flowEvaluated}), acima da média do time (${Math.round(teamRate * 100)}%).`,
    reading:
      "Ajuste faz parte da aprovação; vale ver se o briefing e o alinhamento inicial chegam completos antes da produção.",
    view: "desempenho",
    actionLabel: `Ver desempenho de ${first(m.name)}`,
    weight: rate * 100,
  });
}

/** Cruza carga e execução: recebeu boa parte das novas demandas E manteve entregas sem retrabalho. */
export function ruleCargaBoaExecucao(
  all: MemberSignals[],
  o?: Partial<InsightThresholds>,
  newTasksTotal?: number,
): TeamInsightV2 | null {
  const T = th(o);
  const total = newTasksTotal ?? all.reduce((s, x) => s + x.newTasks, 0);
  if (total < T.cargaBoaExecDemandaMinNovas) return null;
  const candidatos = all
    .filter((m) => m.newTasks / total >= T.cargaBoaExecDemandaPct)
    .filter((m) => m.flowEvaluated >= T.fluxoMinAvaliaveis)
    .filter((m) => 1 - (adjRate(m) ?? 1) >= T.fluxoMelhorPct)
    .sort((a, b) => b.newTasks - a.newTasks);
  const m = candidatos[0];
  if (!m) return null;
  const limpas = m.flowEvaluated - m.flowWithAdjustments;
  return mk({
    ruleId: "carga_boa_execucao",
    topic: "demanda",
    rank: 2,
    label: "Carga e execução",
    category: "operacao",
    priority: 2,
    memberId: m.id,
    memberName: m.name,
    evidence: `${m.name} recebeu ${m.newTasks} das ${total} tarefas criadas neste mês (${pct(m.newTasks, total)}%) e manteve ${pct(limpas, m.flowEvaluated)}% das entregas sem retrabalho.`,
    reading:
      "Volume alto de demanda com aprovação sem ajustes: a carga, por si só, não aparece como problema de execução.",
    caveat: CAVEAT_REATRIBUICAO,
    view: "tarefas",
    actionLabel: `Ver tarefas de ${first(m.name)}`,
    weight: 1000 + pct(m.newTasks, total),
  });
}

/* ---------------- dependências (só relações formais) ---------------- */

export function ruleDependencias(
  input: Pick<TeamInsightsInput, "members" | "edges" | "tasks">,
  o?: Partial<InsightThresholds>,
): TeamInsightV2[] {
  const T = th(o);
  const nameOf = new Map(input.members.map((m) => [m.id, m.name]));
  const aguardando = input.edges.filter((e) => {
    const bloqueadora = input.tasks.get(e.blockingTaskId);
    const bloqueada = input.tasks.get(e.blockedTaskId);
    return !!bloqueadora?.open && !!bloqueada?.open;
  });
  const out: TeamInsightV2[] = [];

  // Gargalo: uma tarefa que segura várias outras.
  const porBloqueadora = new Map<string, Set<string>>();
  for (const e of aguardando)
    porBloqueadora.set(
      e.blockingTaskId,
      (porBloqueadora.get(e.blockingTaskId) ?? new Set()).add(e.blockedTaskId),
    );
  let gargalo: { id: string; n: number } | null = null;
  for (const [id, set] of porBloqueadora)
    if (set.size >= T.gargaloMin && (!gargalo || set.size > gargalo.n))
      gargalo = { id, n: set.size };
  if (gargalo) {
    const t = input.tasks.get(gargalo.id)!;
    const dono = t.memberIds.length === 1 ? nameOf.get(t.memberIds[0]) : undefined;
    out.push(
      mk({
        ruleId: "gargalo",
        rank: 1,
        topic: "dependencia",
        category: "atencao",
        priority: 0,
        memberId: dono ? t.memberIds[0] : undefined,
        memberName: dono,
        evidence: `A tarefa “${t.title}” está bloqueando ${gargalo.n} outras entregas${dono ? ` e está com ${dono}` : ""}.`,
        reading:
          "Destravar essa tarefa libera várias entregas de uma vez — é a ação de maior alavanca agora.",
        view: dono ? "dependencias" : undefined,
        actionLabel: dono ? `Ver dependências de ${first(dono)}` : undefined,
        weight: gargalo.n * 10,
      }),
    );
  }

  // Quem mais bloqueia (tarefas de OUTRAS pessoas aguardando entregas dela).
  const bloqueia = new Map<string, Set<string>>();
  const bloqueado = new Map<string, Set<string>>();
  for (const e of aguardando) {
    const a = input.tasks.get(e.blockingTaskId)!;
    const b = input.tasks.get(e.blockedTaskId)!;
    for (const dono of a.memberIds) {
      if (b.memberIds.includes(dono)) continue;
      bloqueia.set(dono, (bloqueia.get(dono) ?? new Set()).add(e.blockedTaskId));
    }
    for (const dono of b.memberIds) {
      if (a.memberIds.includes(dono)) continue;
      bloqueado.set(dono, (bloqueado.get(dono) ?? new Set()).add(e.blockedTaskId));
    }
  }
  const topo = (m: Map<string, Set<string>>) =>
    [...m.entries()]
      .filter(([id, s]) => nameOf.has(id) && s.size >= T.bloqueioMin)
      .sort((a, b) => b[1].size - a[1].size)[0];
  const b1 = topo(bloqueia);
  if (b1) {
    const name = nameOf.get(b1[0])!;
    out.push(
      mk({
        ruleId: "mais_bloqueia",
        rank: 1,
        topic: "dependencia",
        category: "atencao",
        priority: 1,
        memberId: b1[0],
        memberName: name,
        evidence: `${plural(b1[1].size, "tarefa do time está aguardando", "tarefas do time estão aguardando")} entregas de ${name}.`,
        reading:
          "O trabalho desta pessoa é pré-requisito de outras pessoas; priorizar o que destrava os demais acelera o time.",
        view: "dependencias",
        actionLabel: `Ver dependências de ${first(name)}`,
        weight: b1[1].size,
      }),
    );
  }
  const b2 = topo(bloqueado);
  if (b2) {
    const name = nameOf.get(b2[0])!;
    out.push(
      mk({
        ruleId: "mais_bloqueado",
        rank: 1,
        topic: "dependencia",
        category: "atencao",
        priority: 1,
        memberId: b2[0],
        memberName: name,
        evidence: `${name} tem ${plural(b2[1].size, "tarefa aguardando", "tarefas aguardando")} dependências de outras pessoas.`,
        reading:
          "O atraso aqui tende a vir de fora; cobrar quem bloqueia resolve mais do que cobrar quem espera.",
        view: "dependencias",
        actionLabel: `Ver dependências de ${first(name)}`,
        weight: b2[1].size,
      }),
    );
  }
  return out;
}

/* ---------------- tendências do time ---------------- */

export type TeamTrendsInput = {
  tasksCreated: { current: number; previous: number };
  replans: { current: number; previous: number };
  response: { current: number | null; previous: number | null; answered: number };
  /** Fluxo sem retrabalho do time (soma das pessoas) no período e no anterior. */
  flow?: {
    current: { evaluated: number; withAdjustments: number };
    previous: { evaluated: number; withAdjustments: number };
  };
};

export function ruleTendenciasTime(
  t: TeamTrendsInput,
  o?: Partial<InsightThresholds>,
): TeamInsightV2[] {
  const T = th(o);
  const out: TeamInsightV2[] = [];
  const rel = (c: number, p: number) => Math.round(((c - p) / p) * 100);

  if (t.tasksCreated.previous >= T.tendenciaMinBase) {
    const c = rel(t.tasksCreated.current, t.tasksCreated.previous);
    if (Math.abs(c) >= T.tendenciaTimePct)
      out.push(
        mk({
          ruleId: "tendencia_tarefas",
          rank: 11,
          category: "tendencia",
          priority: 2,
          evidence: `O time recebeu ${Math.abs(c)}% ${c > 0 ? "mais" : "menos"} tarefas neste mês (${t.tasksCreated.current} contra ${t.tasksCreated.previous}).`,
          reading:
            c > 0
              ? "A entrada de demanda cresceu; vale conferir se a capacidade acompanha."
              : "A entrada de demanda caiu; pode haver folga para redistribuir ou adiantar projetos.",
          weight: Math.abs(c),
        }),
      );
  }
  if (t.replans.previous >= T.tendenciaMinBase) {
    const c = rel(t.replans.current, t.replans.previous);
    if (Math.abs(c) >= T.tendenciaTimePct)
      out.push(
        mk({
          ruleId: "tendencia_replanejamentos",
          rank: 10,
          category: "tendencia",
          priority: 2,
          evidence: `Os replanejamentos do time ${c > 0 ? "aumentaram" : "diminuíram"} ${Math.abs(c)}% (${t.replans.current} contra ${t.replans.previous}).`,
          reading:
            c > 0
              ? "Mais prazos estão se movendo; vale olhar se é estimativa ou dependência."
              : "Os prazos estão mais estáveis que no período anterior.",
          weight: Math.abs(c),
        }),
      );
  }
  if (
    t.response.current != null &&
    t.response.previous != null &&
    t.response.previous > 0 &&
    t.response.answered >= T.respostaMinRespondidas
  ) {
    const c = rel(t.response.current, t.response.previous);
    if (Math.abs(c) >= T.tendenciaTimePct)
      out.push(
        mk({
          ruleId: "tendencia_resposta",
          rank: 10,
          category: "tendencia",
          priority: 2,
          evidence: `O tempo médio de resposta do time ${c > 0 ? "subiu" : "caiu"} de ${formatResponseDuration(t.response.previous)} para ${formatResponseDuration(t.response.current)}.`,
          reading:
            c > 0
              ? "A comunicação ficou mais lenta no geral; vale ver se há picos de demanda."
              : "O time está respondendo mais rápido que no período anterior.",
          view: undefined,
          weight: Math.abs(c),
        }),
      );
  }
  if (
    t.flow &&
    t.flow.current.evaluated >= T.fluxoTendenciaMinBase &&
    t.flow.previous.evaluated >= T.fluxoTendenciaMinBase
  ) {
    const cur = t.flow.current.withAdjustments / t.flow.current.evaluated;
    const prev = t.flow.previous.withAdjustments / t.flow.previous.evaluated;
    const dpp = Math.round((cur - prev) * 100);
    if (Math.abs(dpp) >= T.fluxoTendenciaPP)
      out.push(
        mk({
          ruleId: "tendencia_fluxo",
          category: "tendencia",
          priority: 2,
          rank: dpp > 0 ? 11 : 10,
          evidence: `A parcela de entregas com ajustes no time ${dpp > 0 ? "subiu" : "caiu"} de ${Math.round(prev * 100)}% para ${Math.round(cur * 100)}%.`,
          reading:
            dpp > 0
              ? "Mais entregas estão voltando para ajustes; vale olhar o alinhamento antes da produção."
              : "Mais entregas estão sendo aprovadas de primeira.",
          weight: Math.abs(dpp),
        }),
      );
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, T.maxTendenciasTime);
}

/* ---------------- geração + seleção ---------------- */

const JANELA: Record<string, string> = {
  atraso: "situação atual · prazo: este mês vs. mês passado",
  carga_acima: "situação atual · tarefas criadas neste mês",
  mais_demandado: "este mês",
  maior_volume_demandas: "este mês",
  mais_abertas: "situação atual",
  atrasos_concentrados: "situação atual",
  replanejamento: "este mês vs. mesmo período do mês passado",
  replanejamento_reducao: "este mês vs. mesmo período do mês passado",
  reunioes_perdidas: "este mês",
  resposta_piora: "este mês vs. mesmo período do mês passado",
  resposta_melhora: "este mês vs. mesmo período do mês passado",
  resposta_mais_lenta: "este mês",
  resposta_mais_rapida: "este mês",
  previsibilidade: "este mês",
  pontualidade_melhora: "este mês vs. mesmo período do mês passado",
  gargalo: "situação atual",
  mais_bloqueia: "situação atual",
  mais_bloqueado: "situação atual",
  tendencia_tarefas: "este mês vs. mesmo período do mês passado",
  tendencia_replanejamentos: "este mês vs. mesmo período do mês passado",
  tendencia_resposta: "este mês vs. mesmo período do mês passado",
  tendencia_fluxo: "este mês vs. mesmo período do mês passado",
  fluxo_eficiente: "este mês",
  fluxo_ajustes_altos: "este mês",
  carga_boa_execucao: "este mês",
};

/** Todos os candidatos, sem corte (útil para testes e para o detalhe do membro). */
export function ruleReplanReducao(
  m: MemberSignals,
  o?: Partial<InsightThresholds>,
): TeamInsightV2 | null {
  const T = th(o);
  const queda = m.criticalReplansPrev - m.criticalReplans;
  if (queda < T.replanejamentoAlta) return null;
  return mk({
    ruleId: "replanejamento_reducao",
    topic: "replan",
    rank: 9,
    label: "Destaque",
    category: "destaque",
    priority: 3,
    memberId: m.id,
    memberName: m.name,
    evidence: `${m.name} reduziu os replanejamentos no dia ou após o vencimento de ${m.criticalReplansPrev} para ${m.criticalReplans}.`,
    reading: "Os prazos estão se sustentando melhor do que no mês passado.",
    view: "desempenho",
    actionLabel: `Ver desempenho de ${first(m.name)}`,
    weight: queda,
  });
}

/** Todos os candidatos, sem corte (útil para testes e para o detalhe do membro). */
export function generateTeamInsights(
  input: TeamInsightsInput,
  trends: TeamTrendsInput | null,
  o?: Partial<InsightThresholds>,
): TeamInsightV2[] {
  const out: TeamInsightV2[] = [];
  for (const m of input.members) {
    for (const r of [
      ruleAtraso(m, o),
      ruleCarga(m, input.members, o, input.newTasksTotal),
      ruleReplanejamento(m, o),
      ruleReplanReducao(m, o),
      ruleFluxoAjustes(m, input.members, o),
      ruleReunioes(m, o),
      ruleResposta(m, o),
      ruleDestaque(m, o),
    ])
      if (r) out.push(r);
  }
  for (const r of [
    ruleDemanda(input.members, o, input.newTasksTotal),
    ruleMaisAbertas(input.members, o),
    ruleAtrasosConcentrados(input.members, o),
    ruleFluxoEficiencia(input.members, o),
    ruleCargaBoaExecucao(input.members, o, input.newTasksTotal),
  ])
    if (r) out.push(r);
  out.push(...ruleRespostaRelativa(input.members, o));
  out.push(...ruleDependencias(input, o));
  if (trends) out.push(...ruleTendenciasTime(trends, o));
  return out.map((i) => ({ ...i, window: i.window ?? JANELA[i.ruleId] }));
}

/** Ranking: P0 primeiro; depois a ordem editorial (`rank`: risco → demanda → queda → comunicação →
 * replanejamento → atrasos → melhora → tendências → reconhecimento) e, por fim, o peso do dado.
 * Elimina redundância (1 insight por pessoa e tema; no máximo `maxPorPessoa` por pessoa) e limita
 * reconhecimentos e o total (12) — nunca completa a lista à força. */
export function selectTeamInsights(
  all: TeamInsightV2[],
  o?: Partial<InsightThresholds>,
): TeamInsightV2[] {
  const T = th(o);
  const temas = new Set<string>();
  const porPessoa = new Map<string, number>();
  const out: TeamInsightV2[] = [];
  let destaques = 0;
  const ordem = (i: TeamInsightV2) => [i.priority === 0 ? 0 : 1, i.rank, -i.weight];
  const sorted = [...all].sort((a, b) => {
    const x = ordem(a);
    const y = ordem(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.priority - b.priority;
  });
  for (const i of sorted) {
    const tema = `${i.memberId ?? "time"}:${i.topic}`;
    if (temas.has(tema)) continue;
    if (i.memberId && (porPessoa.get(i.memberId) ?? 0) >= T.maxPorPessoa) continue;
    if (i.category === "destaque" && destaques >= T.maxDestaques) continue;
    temas.add(tema);
    if (i.memberId) porPessoa.set(i.memberId, (porPessoa.get(i.memberId) ?? 0) + 1);
    if (i.category === "destaque") destaques += 1;
    out.push(i);
    if (out.length >= T.maxInsights) break;
  }
  return out;
}
