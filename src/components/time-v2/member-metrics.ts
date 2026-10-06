/**
 * Métricas operacionais derivadas da aba Time (página e perfil central) —
 * funções puras, sem I/O, sobre dados que a plataforma JÁ guarda. Nada
 * aqui recalcula Score, atraso ou replanejamento: atraso vem do `bucket`
 * de `DashTask` (mesma regra do Score), conclusão no prazo e
 * replanejamento vêm do ledger/Score (`performance-engine.ts`). Este
 * módulo só combina e explica.
 *
 * DEFINIÇÕES (documentadas porque o pedido proíbe regra silenciosa):
 *  * Carga atual: só tarefas ABERTAS (`OPEN_STATUSES`). Atraso de tarefa
 *    BLOQUEADA nunca pesa na classificação — aparece como motivo à parte
 *    (uma tarefa bloqueada não é atraso de execução da pessoa).
 *  * Tempo médio de ciclo: da PRIMEIRA entrada em "Em andamento"
 *    (activity da tarefa) até a conclusão (`completedAt`), só pra tarefas
 *    concluídas dentro do período. Tarefas que nunca passaram por "Em
 *    andamento" ficam fora (a amostra é exibida). Complemento: "desde a
 *    criação" (criação → conclusão), pra quem não usa o status.
 *  * Dependências: bloqueio ATIVO (`blockedState`, gravado pelas RPCs de
 *    bloqueio) agrupado pelas categorias fechadas do questionário.
 */
import { OPEN_STATUSES } from "@/lib/score";
import { INSIGHT_THRESHOLDS } from "@/lib/insights-engine";
import type { TaskBlockCategory } from "@/lib/projetos";
import type { DashTask } from "@/lib/task-aggregation";
import { todayIsoInBrasilia } from "@/lib/timezone";
import { formatResponseDuration } from "@/lib/member-response-time";
import type { IsoRange, MemberTaskStats } from "./time-v2-utils";

/* ------------------------------------------------------------------ */
/* Dependências / bloqueios                                             */
/* ------------------------------------------------------------------ */

export type DependencyGroup = "cliente" | "aprovacao" | "externa" | "interna" | "outro";

export const DEPENDENCY_GROUPS: DependencyGroup[] = [
  "cliente",
  "aprovacao",
  "externa",
  "interna",
  "outro",
];

export const DEPENDENCY_GROUP_LABEL: Record<DependencyGroup, string> = {
  cliente: "Aguardando cliente",
  aprovacao: "Aguardando aprovação",
  externa: "Dependência externa",
  interna: "Dependência interna",
  outro: "Outros impedimentos",
};

const GROUP_OF: Record<TaskBlockCategory, DependencyGroup> = {
  aguardando_cliente: "cliente",
  aguardando_aprovacao: "aprovacao",
  aguardando_fornecedor: "externa",
  dependencia_tarefa: "interna",
  aguardando_time: "interna",
  problema_tecnico: "outro",
  falta_informacao: "outro",
  outro: "outro",
};

/** Bloqueio sem categoria (status "Bloqueada" legado, sem `blockedState`)
 * cai em "Outros impedimentos" — nunca some da contagem. */
export function dependencyGroupOf(t: Pick<DashTask, "blockCategory">): DependencyGroup {
  return t.blockCategory ? GROUP_OF[t.blockCategory] : "outro";
}

export function isBlocked(t: Pick<DashTask, "status" | "blockCategory">): boolean {
  return OPEN_STATUSES.has(t.status) && (!!t.blockCategory || t.status === "Bloqueada");
}

export type DependencySummary = {
  total: number;
  byGroup: Record<DependencyGroup, number>;
  /** Bloqueadas mais antigas primeiro. */
  tasks: DashTask[];
};

export function dependencySummary(tasks: DashTask[]): DependencySummary {
  const byGroup = Object.fromEntries(DEPENDENCY_GROUPS.map((g) => [g, 0])) as Record<
    DependencyGroup,
    number
  >;
  const blocked = tasks.filter(isBlocked);
  for (const t of blocked) byGroup[dependencyGroupOf(t)] += 1;
  blocked.sort((a, b) => (a.blockedSince ?? "").localeCompare(b.blockedSince ?? ""));
  return { total: blocked.length, byGroup, tasks: blocked };
}

/** Bloqueio que depende de terceiros (fora do time). */
export function thirdPartyBlocked(byGroup: Record<DependencyGroup, number>): number {
  return byGroup.cliente + byGroup.aprovacao + byGroup.externa;
}

/** "2 aguardando cliente · 1 dependência interna" — só grupos com valor. */
export function dependencyBreakdownText(byGroup: Record<DependencyGroup, number>): string {
  return DEPENDENCY_GROUPS.filter((g) => byGroup[g] > 0)
    .map((g) => `${byGroup[g]} ${DEPENDENCY_GROUP_LABEL[g].toLowerCase()}`)
    .join(" · ");
}

/* ------------------------------------------------------------------ */
/* Carga atual                                                          */
/* ------------------------------------------------------------------ */

export type LoadLevel = "normal" | "atencao" | "alta";

export const LOAD_LEVEL_LABEL: Record<LoadLevel, string> = {
  normal: "Normal",
  atencao: "Atenção",
  alta: "Alta",
};

/** Limiares centralizados da classificação de carga. `atrasadasAlta`
 * reaproveita o mesmo corte do motor de insights (`atrasadasMin`). A
 * comparação com a média do time só vale com volume mínimo, pra nunca
 * marcar "acima da média" alguém com 3 tarefas num time com média 2. */
export const LOAD_THRESHOLDS = {
  atrasadasAlta: INSIGHT_THRESHOLDS.atrasadasMin,
  vencemHojeAtencao: 3,
  abertasAcimaDaMediaPct: 0.5,
  abertasMinimasParaComparar: 5,
} as const;

export type LoadAssessment = { level: LoadLevel; reasons: string[] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Classificação VISUAL da carga — sempre com o motivo, nunca um
 * julgamento sobre a pessoa. Atraso de tarefa bloqueada não conta. */
export function assessLoad(stats: MemberTaskStats, teamAvgOpen: number | null): LoadAssessment {
  const reasons: string[] = [];
  const overdue = stats.atrasadas - stats.atrasadasBloqueadas;
  let level: LoadLevel = "normal";
  const raise = (l: LoadLevel) => {
    if (l === "alta" || (l === "atencao" && level === "normal")) level = l;
  };

  if (overdue >= LOAD_THRESHOLDS.atrasadasAlta) {
    raise("alta");
    reasons.push(plural(overdue, "tarefa atrasada", "tarefas atrasadas"));
  } else if (overdue > 0) {
    raise("atencao");
    reasons.push(plural(overdue, "tarefa atrasada", "tarefas atrasadas"));
  }
  if (stats.vencemHoje >= LOAD_THRESHOLDS.vencemHojeAtencao) {
    raise("atencao");
    reasons.push(plural(stats.vencemHoje, "vence hoje", "vencem hoje"));
  }
  if (
    teamAvgOpen != null &&
    teamAvgOpen > 0 &&
    stats.abertas >= LOAD_THRESHOLDS.abertasMinimasParaComparar &&
    stats.abertas > teamAvgOpen * (1 + LOAD_THRESHOLDS.abertasAcimaDaMediaPct)
  ) {
    raise("atencao");
    reasons.push(
      `${stats.abertas} abertas (média do time: ${teamAvgOpen.toLocaleString("pt-BR", { maximumFractionDigits: 1 })})`,
    );
  }
  if (stats.atrasadasBloqueadas > 0) {
    reasons.push(
      `${plural(stats.atrasadasBloqueadas, "atrasada está bloqueada", "atrasadas estão bloqueadas")} (não pesa na carga)`,
    );
  }
  if (reasons.length === 0) {
    reasons.push(stats.abertas === 0 ? "Nenhuma tarefa aberta" : "Sem atrasos nem picos de prazo");
  }
  return { level, reasons };
}

/** Média de tarefas abertas por pessoa (só quem tem ao menos uma — quem
 * está sem tarefa não puxa a média pra baixo artificialmente). */
export function teamAverageOpen(statsList: MemberTaskStats[]): number | null {
  const withWork = statsList.filter((s) => s.abertas > 0);
  if (withWork.length === 0) return null;
  return withWork.reduce((s, x) => s + x.abertas, 0) / withWork.length;
}

/* ------------------------------------------------------------------ */
/* Tempo médio de ciclo                                                 */
/* ------------------------------------------------------------------ */

export type CycleTimeStats = {
  completedInRange: number;
  /** Média em dias (início operacional → conclusão). */
  cycleDays: number | null;
  cycleSample: number;
  /** Média em dias (criação → conclusão). */
  leadDays: number | null;
  leadSample: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function avgDays(pairs: [string, string][]): number | null {
  const spans = pairs
    .map(([a, b]) => new Date(b).getTime() - new Date(a).getTime())
    .filter((ms) => Number.isFinite(ms) && ms >= 0);
  if (spans.length === 0) return null;
  return spans.reduce((s, x) => s + x, 0) / spans.length / DAY_MS;
}

export function cycleTimeStats(tasks: DashTask[], range: IsoRange): CycleTimeStats {
  const seen = new Set<string>();
  const done = tasks.filter((t) => {
    if (t.status !== "Concluído" || !t.completedAt || seen.has(t.id)) return false;
    const day = todayIsoInBrasilia(new Date(t.completedAt));
    if (day < range.from || day > range.to) return false;
    seen.add(t.id);
    return true;
  });
  const cyclePairs = done
    .filter((t) => t.startedAt && t.startedAt <= t.completedAt!)
    .map((t) => [t.startedAt!, t.completedAt!] as [string, string]);
  const leadPairs = done
    .filter((t) => t.createdAt && t.createdAt <= t.completedAt!)
    .map((t) => [t.createdAt!, t.completedAt!] as [string, string]);
  return {
    completedInRange: done.length,
    cycleDays: avgDays(cyclePairs),
    cycleSample: cyclePairs.length,
    leadDays: avgDays(leadPairs),
    leadSample: leadPairs.length,
  };
}

/** "2,4 dias", "5 h" (menos de 1 dia), "—" sem dado. */
export function formatDays(days: number | null): string {
  if (days == null) return "—";
  if (days < 1) {
    const h = Math.max(1, Math.round(days * 24));
    return `${h} h`;
  }
  return `${days.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${days < 1.05 ? "dia" : "dias"}`;
}

/* ------------------------------------------------------------------ */
/* Tendência                                                            */
/* ------------------------------------------------------------------ */

/** Variação relativa em % (`null` sem base de comparação). */
export function relativeChangePct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** "↓ 12% vs período anterior" / "= vs período anterior" / null. */
export function formatRelativeChange(pct: number | null): string | null {
  if (pct == null) return null;
  const r = Math.round(pct);
  if (r === 0) return "= vs período anterior";
  return `${r > 0 ? "↑" : "↓"} ${Math.abs(r)}% vs período anterior`;
}

/** Sequência de períodos (mais antigo → atual), ex.: "78% → 84% → 90%".
 * Períodos sem amostra aparecem como "—" pra nunca fingir continuidade. */
export function formatSeries(values: (number | null)[], fmt: (v: number) => string): string {
  return values.map((v) => (v == null ? "—" : fmt(v))).join(" → ");
}

/* ------------------------------------------------------------------ */
/* Insights do membro                                                   */
/* ------------------------------------------------------------------ */

export type MemberInsightKind = "atencao" | "tendencia" | "operacao" | "dependencia";

export const MEMBER_INSIGHT_LABEL: Record<MemberInsightKind, string> = {
  atencao: "Atenção",
  tendencia: "Tendência",
  operacao: "Operação",
  dependencia: "Dependência",
};

export type MemberInsight = { kind: MemberInsightKind; text: string };

export type MemberInsightInput = {
  overdueUnblocked: number;
  dueToday: number;
  onTimePct: number | null;
  onTimeSample: number;
  onTimePctPrevious: number | null;
  onTimeSamplePrevious: number;
  responseAvgSeconds: number | null;
  responseAvgSecondsPrevious: number | null;
  /** Resposta por tipo de conversa (opcional): DM x menção. */
  responseDirect?: { avg: number | null; answered: number };
  responseMention?: { avg: number | null; answered: number };
  replans: number;
  replansPrevious: number;
  dependencies: Record<DependencyGroup, number>;
};

/** Frases objetivas a partir de dados reais do período do perfil — sem
 * texto genérico. Cada regra só dispara com amostra mínima
 * (`INSIGHT_THRESHOLDS`, os mesmos cortes do motor de insights do time). */
export function memberProfileInsights(i: MemberInsightInput): MemberInsight[] {
  const out: MemberInsight[] = [];
  const min = INSIGHT_THRESHOLDS.amostraMinima;

  if (i.overdueUnblocked > 0) {
    out.push({
      kind: "atencao",
      text: `${plural(i.overdueUnblocked, "tarefa está atrasada", "tarefas estão atrasadas")}.`,
    });
  }
  if (i.dueToday > 0) {
    out.push({
      kind: "atencao",
      text: `${plural(i.dueToday, "tarefa vence hoje", "tarefas vencem hoje")}.`,
    });
  }

  if (
    i.onTimePct != null &&
    i.onTimePctPrevious != null &&
    i.onTimeSample >= min &&
    i.onTimeSamplePrevious >= min &&
    Math.abs(i.onTimePct - i.onTimePctPrevious) >= INSIGHT_THRESHOLDS.pontualidadeVariacaoPP
  ) {
    out.push({
      kind: "tendencia",
      text: `Conclusão no prazo ${i.onTimePct > i.onTimePctPrevious ? "subiu" : "caiu"} de ${Math.round(i.onTimePctPrevious)}% para ${Math.round(i.onTimePct)}%.`,
    });
  } else if (i.onTimePct != null && i.onTimeSample >= min) {
    out.push({
      kind: "operacao",
      text: `${Math.round(i.onTimePct)}% das tarefas foram concluídas no prazo.`,
    });
  }

  const rtChange = relativeChangePct(i.responseAvgSeconds, i.responseAvgSecondsPrevious);
  if (rtChange != null && Math.abs(rtChange) >= 20) {
    out.push({
      kind: "tendencia",
      text: `Tempo médio de resposta ${rtChange < 0 ? "caiu" : "subiu"} de ${formatResponseDuration(i.responseAvgSecondsPrevious)} para ${formatResponseDuration(i.responseAvgSeconds)}.`,
    });
  }

  const d = i.responseDirect;
  const m = i.responseMention;
  if (
    d?.avg != null &&
    m?.avg != null &&
    d.answered >= 5 &&
    m.answered >= 5 &&
    Math.max(d.avg, m.avg) >= Math.min(d.avg, m.avg) * 1.5
  ) {
    const dmMais = d.avg > m.avg;
    out.push({
      kind: "tendencia",
      text: `Responde mais devagar ${dmMais ? "em mensagens diretas" : "em menções"} (${formatResponseDuration(dmMais ? d.avg : m.avg)}) do que ${dmMais ? "em menções" : "em mensagens diretas"} (${formatResponseDuration(dmMais ? m.avg : d.avg)}).`,
    });
  }

  if (Math.abs(i.replans - i.replansPrevious) >= INSIGHT_THRESHOLDS.replanejamentosVariacaoMin) {
    out.push({
      kind: "tendencia",
      text: `Replanejamentos ${i.replans > i.replansPrevious ? "aumentaram" : "diminuíram"} de ${i.replansPrevious} para ${i.replans}.`,
    });
  }

  const third = thirdPartyBlocked(i.dependencies);
  if (third > 0) {
    out.push({
      kind: "dependencia",
      text: `${plural(third, "tarefa aguarda terceiros", "tarefas aguardam terceiros")} (cliente, aprovação ou parceiro).`,
    });
  }
  if (i.dependencies.interna > 0) {
    out.push({
      kind: "dependencia",
      text: `${plural(i.dependencies.interna, "tarefa depende", "tarefas dependem")} de outra tarefa ou de alguém do time.`,
    });
  }
  return out;
}
