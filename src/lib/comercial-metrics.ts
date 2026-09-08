import type { Lead } from "./comercial";
import {
  legacyStage,
  deriveOpportunityNextStep,
  isOpportunityStale,
  daysSinceLastStageChange,
  type OpportunityStage,
} from "./comercial-engine";

/**
 * Agregações puras do Comercial (KPIs, agrupamentos, listas de "precisa
 * agir") — separado de `comercial-engine.ts` (que é sobre TRANSIÇÃO de
 * estado) porque isto aqui é só LEITURA/relatório, sem nenhum patch. Regra
 * central deste arquivo: nunca inventar um número quando o dado não
 * sustenta — quem não tem base pra ser calculado devolve `null`/lista
 * vazia, nunca `0` disfarçado de "sem risco"/"sem pendência".
 */

export type ComercialPeriodMode = "semana" | "mes" | "trimestre" | "ano";

export const COMERCIAL_PERIOD_OPTIONS: { value: ComercialPeriodMode; label: string }[] = [
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mês" },
  { value: "trimestre", label: "Trimestre" },
  { value: "ano", label: "Este ano" },
];

export type DateRange = { from: string; to: string };

export function rangeForComercialPeriod(
  mode: ComercialPeriodMode,
  now: Date = new Date(),
): DateRange {
  const to = now.toISOString();
  const from = new Date(now);
  if (mode === "semana") {
    const day = from.getDay();
    from.setDate(from.getDate() - ((day + 6) % 7));
    from.setHours(0, 0, 0, 0);
  } else if (mode === "trimestre") {
    from.setMonth(from.getMonth() - 3);
  } else if (mode === "ano") {
    from.setMonth(0, 1);
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  }
  return { from: from.toISOString(), to };
}

function isoWithinRange(iso: string | undefined, range: DateRange): boolean {
  if (!iso) return false;
  return iso >= range.from && iso <= range.to;
}

export type ComercialKpis = {
  pipelineTotal: number;
  /** Sempre `null` — não existe probabilidade de fechamento configurada
   * por etapa/lead hoje (ver `comercial-engine.ts`). Nunca inventar um
   * peso; o dia que essa regra existir, este cálculo entra aqui. */
  forecastPonderado: null;
  /** Soma de `value` dos leads GANHO cujo `wonAt` cai dentro do período. */
  valorGanhoNoPeriodo: number;
  /** Quantos negócios GANHO no período (mesmo `wonAt`) — para não
   * confundir "ganhou pouco valor" com "ganhou pouco volume". */
  negociosGanhosNoPeriodo: number;
  /** Negócios GANHO que existem mas não têm `wonAt` (ganhos antes desta
   * métrica existir) — ficam fora de `valorGanhoNoPeriodo`. A UI deve
   * mostrar isso como uma ressalva visível, nunca escondido. */
  ganhosSemDataRegistrada: number;
  oportunidadesAbertas: number;
  /** Etapas abertas sem ação sugerida pelo motor — hoje só
   * `PROPOSTA_ENVIADA` (aguardando retorno do cliente), única condição
   * real e não-terminal com `action === null`. */
  oportunidadesSemProximaAcao: number;
  oportunidadesParadas: number;
  /** Só as com `nextMeeting` já vencido — único prazo estruturado que
   * existe hoje em qualquer etapa. Não cobre "próxima ação" em geral
   * (essas não têm prazo — ver `LeadFiltersBar`/aba Atividades). */
  atividadesVencidas: number;
};

export function computeComercialKpis(leads: Lead[], range: DateRange): ComercialKpis {
  let pipelineTotal = 0;
  let valorGanhoNoPeriodo = 0;
  let negociosGanhosNoPeriodo = 0;
  let ganhosSemDataRegistrada = 0;
  let oportunidadesAbertas = 0;
  let oportunidadesSemProximaAcao = 0;
  let oportunidadesParadas = 0;
  let atividadesVencidas = 0;
  const now = Date.now();

  for (const lead of leads) {
    const stage = legacyStage(lead.stage);
    pipelineTotal += lead.value || 0;

    if (stage === "GANHO") {
      if (!lead.wonAt) ganhosSemDataRegistrada += 1;
      else if (isoWithinRange(lead.wonAt, range)) {
        valorGanhoNoPeriodo += lead.value || 0;
        negociosGanhosNoPeriodo += 1;
      }
    }

    if (stage !== "GANHO" && stage !== "PERDIDO") {
      oportunidadesAbertas += 1;
      const step = deriveOpportunityNextStep(lead);
      if (step.action === null) oportunidadesSemProximaAcao += 1;
      if (isOpportunityStale(lead)) oportunidadesParadas += 1;
    }

    if (lead.nextMeeting && new Date(lead.nextMeeting).getTime() < now) {
      atividadesVencidas += 1;
    }
  }

  return {
    pipelineTotal,
    forecastPonderado: null,
    valorGanhoNoPeriodo,
    negociosGanhosNoPeriodo,
    ganhosSemDataRegistrada,
    oportunidadesAbertas,
    oportunidadesSemProximaAcao,
    oportunidadesParadas,
    atividadesVencidas,
  };
}

export type StageBucket = { stage: OpportunityStage; count: number; value: number };

export function groupPipelineByStage(
  leads: Lead[],
  stages: readonly OpportunityStage[],
): StageBucket[] {
  const map = new Map<OpportunityStage, StageBucket>(
    stages.map((s) => [s, { stage: s, count: 0, value: 0 }]),
  );
  for (const lead of leads) {
    const stage = legacyStage(lead.stage);
    const bucket = map.get(stage);
    if (!bucket) continue;
    bucket.count += 1;
    bucket.value += lead.value || 0;
  }
  return stages.map((s) => map.get(s)!);
}

export type NamedBucket = { name: string; count: number; value: number; won: number };

const SEM_RESPONSAVEL = "(sem responsável)";
const SEM_ORIGEM = "(sem origem)";

/** Agrupa por responsável — leads sem `responsible` caem no bucket
 * explícito "(sem responsável)", nunca somados silenciosamente em outro
 * grupo nem descartados. */
export function groupByResponsible(leads: Lead[]): NamedBucket[] {
  return groupByField(leads, (l) => l.responsible?.trim() || SEM_RESPONSAVEL);
}

/** Mesma regra para origem — bucket explícito "(sem origem)". */
export function groupByOrigin(leads: Lead[]): NamedBucket[] {
  return groupByField(leads, (l) => l.source?.trim() || SEM_ORIGEM);
}

function groupByField(leads: Lead[], keyOf: (l: Lead) => string): NamedBucket[] {
  const map = new Map<string, NamedBucket>();
  for (const lead of leads) {
    const key = keyOf(lead);
    const bucket = map.get(key) ?? { name: key, count: 0, value: 0, won: 0 };
    bucket.count += 1;
    bucket.value += lead.value || 0;
    if (legacyStage(lead.stage) === "GANHO") bucket.won += 1;
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export type LossReasonBucket = { reason: string; count: number };

/** `lossReason` é texto livre (com sugestões via datalist, não enum) — o
 * agrupamento é por string exata; motivos digitados de formas diferentes
 * aparecem como buckets distintos (é o dado real, não normalizo por
 * conta própria). */
export function lossReasonBreakdown(leads: Lead[]): LossReasonBucket[] {
  const map = new Map<string, number>();
  for (const lead of leads) {
    if (legacyStage(lead.stage) !== "PERDIDO") continue;
    const reason = lead.lossReason?.trim() || "(sem motivo registrado)";
    map.set(reason, (map.get(reason) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

/** Oportunidades onde a próxima ação é do time (não do cliente, não
 * terminal) — ordenadas pelas mais paradas primeiro, pra priorizar quem
 * já devia ter sido tocado há mais tempo. */
export function leadsNeedingActionToday(leads: Lead[]): Lead[] {
  return leads
    .filter((l) => deriveOpportunityNextStep(l).actor === "HYPE")
    .sort((a, b) => daysSinceLastStageChange(b) - daysSinceLastStageChange(a));
}

/** "Em risco" — parada (sem progredir de etapa há dias) OU com reunião já
 * vencida sem registro. As duas condições são reais e verificáveis; não
 * há um terceiro critério de risco inventado aqui. */
export function leadsAtRisk(leads: Lead[]): Lead[] {
  const now = Date.now();
  return leads.filter((l) => {
    const stage = legacyStage(l.stage);
    if (stage === "GANHO" || stage === "PERDIDO") return false;
    const meetingOverdue = !!l.nextMeeting && new Date(l.nextMeeting).getTime() < now;
    return isOpportunityStale(l) || meetingOverdue;
  });
}

/** "Mais próximas de fechar" — proxy honesto por AVANÇO NO FUNIL (etapas
 * finais antes do desfecho), nunca uma probabilidade inventada. Rotular
 * na UI como "mais avançadas no funil", não como "% de chance". */
export function leadsClosestToClosing(leads: Lead[]): Lead[] {
  return leads
    .filter((l) => {
      const stage = legacyStage(l.stage);
      return stage === "NEGOCIACAO" || stage === "PROPOSTA_ENVIADA";
    })
    .sort((a, b) => (b.value || 0) - (a.value || 0));
}

export type ActivityBucketKey = "atrasadas" | "hoje" | "proximas" | "concluidas";

/** Atividades do Comercial hoje se reduzem à "próxima ação" derivada do
 * motor + `nextMeeting` (único prazo estruturado que existe). Não existe
 * uma entidade de atividade própria com data em todos os casos — ver nota
 * de limitação exibida pela aba Atividades. Leads GANHO/PERDIDO entram só
 * em "concluídas" (a "atividade" foi o próprio desfecho). */
export function bucketActivities(
  leads: Lead[],
  now: Date = new Date(),
): Record<ActivityBucketKey, Lead[]> {
  const todayIso = now.toISOString().slice(0, 10);
  const result: Record<ActivityBucketKey, Lead[]> = {
    atrasadas: [],
    hoje: [],
    proximas: [],
    concluidas: [],
  };
  for (const lead of leads) {
    const stage = legacyStage(lead.stage);
    if (stage === "GANHO" || stage === "PERDIDO") {
      result.concluidas.push(lead);
      continue;
    }
    if (lead.nextMeeting) {
      const meetingDay = lead.nextMeeting.slice(0, 10);
      if (meetingDay < todayIso) result.atrasadas.push(lead);
      else if (meetingDay === todayIso) result.hoje.push(lead);
      else result.proximas.push(lead);
      continue;
    }
    // Sem `nextMeeting`: a próxima ação (motor) não tem prazo — entra em
    // "próximas" só se houver ação real do time, pra não desaparecer da
    // visão operacional; sem ação nenhuma (aguardando cliente) não é uma
    // atividade pendente do time.
    const step = deriveOpportunityNextStep(lead);
    if (step.actor === "HYPE" && step.action) result.proximas.push(lead);
  }
  return result;
}
