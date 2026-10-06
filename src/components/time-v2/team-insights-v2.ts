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
  maxInsights: 6,
  maxDestaques: 2,
  maxTendenciasTime: 2,
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
};

export type DependencyTask = { id: string; title: string; memberIds: string[]; open: boolean };
export type DependencyEdge = { blockingTaskId: string; blockedTaskId: string };

export type TeamInsightsInput = {
  members: MemberSignals[];
  edges: DependencyEdge[];
  tasks: Map<string, DependencyTask>;
};

const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const first = (name: string) => name.split(" ")[0];
const mk = (i: Omit<TeamInsightV2, "id" | "weight"> & { weight?: number }): TeamInsightV2 => ({
  ...i,
  id: `${i.ruleId}:${i.memberId ?? "time"}`,
  weight: i.weight ?? 0,
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
      : "O ritmo de entrega no prazo piorou frente aos 30 dias anteriores; vale entender o que mudou nas tarefas dela.";
  const p0 = altaPrioridade || m.overdueOld > 0 || drop >= T.pontualidadeQuedaForteP0;
  return mk({
    ruleId: "atraso",
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

/** Carga acima do esperado / concentração de demandas — NUNCA por volume sozinho. */
export function ruleCarga(
  m: MemberSignals,
  all: MemberSignals[],
  o?: Partial<InsightThresholds>,
): TeamInsightV2 | null {
  const T = th(o);
  if (all.length < T.cargaMinMembros) return null;
  const totalOpen = all.reduce((s, x) => s + x.openCount, 0);
  const totalNew = all.reduce((s, x) => s + x.newTasks, 0);
  const avgOpen = totalOpen / all.length;
  const openShare = totalOpen > 0 ? m.openCount / totalOpen : 0;
  const newShare = totalNew > 0 ? m.newTasks / totalNew : 0;
  const mostlyOverdue = m.openCount > 0 && m.overdueCount / m.openCount >= T.acumuloPctAbertas;

  const cargaAlta =
    !mostlyOverdue &&
    m.openCount >= T.cargaMinAbertas &&
    openShare >= T.cargaPctAbertas &&
    m.openCount >= avgOpen * T.cargaVsMedia &&
    newShare >= T.novasPctCarga;
  const concentracao = totalNew >= T.concentracaoMinNovas && newShare >= T.concentracaoNovasPct;
  if (!cargaAlta && !concentracao) return null;

  const partes: string[] = [];
  if (cargaAlta)
    partes.push(`${m.name} concentra ${pct(m.openCount, totalOpen)}% das tarefas abertas do time`);
  if (concentracao)
    partes.push(
      cargaAlta
        ? `e recebeu ${pct(m.newTasks, totalNew)}% das tarefas criadas nos últimos 30 dias`
        : `${pct(m.newTasks, totalNew)}% das tarefas criadas nos últimos 30 dias estão com ${m.name}`,
    );
  const reading = cargaAlta
    ? "Boa parte do que entra no time está sendo direcionada para uma pessoa; vale revisar a distribuição antes que vire gargalo."
    : "As novas demandas estão se concentrando numa pessoa só; vale checar se a distribuição é intencional.";
  return mk({
    ruleId: cargaAlta ? "carga_acima" : "concentracao_demandas",
    category: "operacao",
    priority: 1,
    memberId: m.id,
    memberName: m.name,
    evidence: `${partes.join(" ")}.`,
    reading,
    caveat:
      "Considera o responsável atual das tarefas; reatribuições podem distorcer a parcela de novas demandas.",
    view: "tarefas",
    actionLabel: `Ver tarefas de ${first(m.name)}`,
    weight: openShare * 100 + newShare * 100,
  });
}

/** Mais demandado: combinação de ≥ 3 sinais independentes (não é sobrecarga). */
export function ruleMaisDemandado(
  all: MemberSignals[],
  o?: Partial<InsightThresholds>,
): TeamInsightV2 | null {
  const T = th(o);
  if (all.length < T.cargaMinMembros) return null;
  const sinais: { label: string; get: (m: MemberSignals) => number }[] = [
    { label: "tarefas abertas", get: (m) => m.openCount },
    { label: "novas tarefas atribuídas", get: (m) => m.newTasks },
    { label: "reuniões", get: (m) => m.meetingsAttended },
    { label: "demandas respondidas", get: (m) => m.answered },
  ];
  const lideres = new Map<string, string[]>();
  for (const s of sinais) {
    const vals = all.map((m) => s.get(m));
    const max = Math.max(...vals);
    const media = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (max <= 0 || vals.filter((v) => v === max).length !== 1) continue;
    if (max < media * T.demandadoVsMedia) continue;
    const m = all[vals.indexOf(max)];
    lideres.set(m.id, [...(lideres.get(m.id) ?? []), s.label]);
  }
  let top: { id: string; labels: string[] } | null = null;
  for (const [id, labels] of lideres)
    if (labels.length >= T.demandadoMinSinais && (!top || labels.length > top.labels.length))
      top = { id, labels };
  if (!top) return null;
  const m = all.find((x) => x.id === top!.id)!;
  const lista =
    top.labels.length > 1
      ? `${top.labels.slice(0, -1).join(", ")} e ${top.labels[top.labels.length - 1]}`
      : top.labels[0];
  return mk({
    ruleId: "mais_demandado",
    category: "operacao",
    priority: 2,
    memberId: m.id,
    memberName: m.name,
    evidence: `${m.name} foi o mais demandado do período: lidera em ${lista}, acima dos demais membros.`,
    reading:
      "É uma leitura de volume de demandas (vários sinais juntos), não de sobrecarga — vale conferir se o ritmo está sustentável.",
    view: "visao",
    actionLabel: `Ver ${first(m.name)}`,
    weight: top.labels.length * 10,
  });
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
      ? `${m.name} replanejou ${plural(m.criticalReplans, "tarefa", "tarefas")} no dia ou após o vencimento nos últimos 30 dias (eram ${m.criticalReplansPrev} antes).`
      : `${m.name} alterou o prazo da mesma tarefa mais de uma vez, no dia ou após o vencimento.`;
  return mk({
    ruleId: "replanejamento",
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
      category: "destaque",
      priority: 3,
      memberId: m.id,
      memberName: m.name,
      evidence: `A conclusão no prazo de ${m.name} subiu de ${Math.round(m.onTimeRatePrev)}% para ${Math.round(m.onTimeRate)}%.`,
      reading: "Melhora consistente frente aos 30 dias anteriores — vale reconhecer.",
      view: "desempenho",
      actionLabel: `Ver ${first(m.name)}`,
      weight: m.onTimeRate - m.onTimeRatePrev,
    });
  }
  return null;
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
          category: "tendencia",
          priority: 2,
          evidence: `O time recebeu ${Math.abs(c)}% ${c > 0 ? "mais" : "menos"} tarefas nos últimos 30 dias (${t.tasksCreated.current} contra ${t.tasksCreated.previous}).`,
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
  return out.sort((a, b) => b.weight - a.weight).slice(0, T.maxTendenciasTime);
}

/* ---------------- geração + seleção ---------------- */

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
      ruleCarga(m, input.members, o),
      ruleReplanejamento(m, o),
      ruleReunioes(m, o),
      ruleResposta(m, o),
      ruleDestaque(m, o),
    ])
      if (r) out.push(r);
  }
  const demandado = ruleMaisDemandado(input.members, o);
  if (demandado) out.push(demandado);
  out.push(...ruleDependencias(input, o));
  if (trends) out.push(...ruleTendenciasTime(trends, o));
  return out;
}

/** Prioridade (P0→P3), depois peso. No máximo 1 por pessoa, `maxDestaques` reconhecimentos e
 * `maxInsights` no total — nunca completa a lista à força. */
export function selectTeamInsights(
  all: TeamInsightV2[],
  o?: Partial<InsightThresholds>,
): TeamInsightV2[] {
  const T = th(o);
  const seen = new Set<string>();
  const out: TeamInsightV2[] = [];
  let destaques = 0;
  for (const i of [...all].sort((a, b) => a.priority - b.priority || b.weight - a.weight)) {
    if (i.memberId && seen.has(i.memberId)) continue;
    if (i.category === "destaque" && destaques >= T.maxDestaques) continue;
    if (i.memberId) seen.add(i.memberId);
    if (i.category === "destaque") destaques += 1;
    out.push(i);
    if (out.length >= T.maxInsights) break;
  }
  return out;
}

/** Janela anterior de 30 dias (60→31 dias atrás), as mesmas usadas pelos insights de hoje. */
export function previous30Range(todayIso: string): { from: string; to: string } {
  const [y, m, d] = todayIso.split("-").map(Number);
  const f = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return { from: f(new Date(y, m - 1, d - 59)), to: f(new Date(y, m - 1, d - 30)) };
}
