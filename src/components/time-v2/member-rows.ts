/**
 * Linhas da lista central do Time — montagem e ordenação puras. Cada
 * número vem de uma fonte já existente (tarefas: `memberTaskStats`;
 * prazo/replanejamento: ledger via `computeAggregateIndicators`; Score:
 * `computeMemberScoreV2`; horas: `time_entries`; resposta: RPC agregada).
 * Ordenação padrão é por nome — nunca um ranking automático.
 */
import type { ScoreOperacionalV2 } from "@/lib/performance-engine";
import type { DashTask } from "@/lib/task-aggregation";
import type { Member } from "@/components/TimeSection";
import { assessLoad, teamAverageOpen, type LoadAssessment } from "./member-metrics";
import { canSeeField, memberTaskStats, type MemberTaskStats } from "./time-v2-utils";

export type MemberRow = {
  member: Member;
  name: string;
  role: string;
  stats: MemberTaskStats;
  load: LoadAssessment;
  score: ScoreOperacionalV2 | undefined;
  onTimePct: number | null;
  completed: number;
  responseSeconds: number | null;
};

export type MemberSortKey = "nome" | "abertas" | "atrasadas" | "noPrazo" | "resposta" | "score";

export type MemberSort = { key: MemberSortKey; dir: "asc" | "desc" };

/** Direção inicial ao escolher um critério: nome A→Z; tempo de resposta do
 * menor pro maior; demais do maior pro menor. */
export const DEFAULT_SORT_DIR: Record<MemberSortKey, "asc" | "desc"> = {
  nome: "asc",
  abertas: "desc",
  atrasadas: "desc",
  noPrazo: "desc",
  resposta: "asc",
  score: "desc",
};

export type MemberRowSources = {
  viewer: { isAdmin: boolean; meId: string | null };
  tasksByMember: Map<string, DashTask[]>;
  scoreByMemberId: Map<string, ScoreOperacionalV2>;
  periodByMemberId: Map<string, { completed: number; pctNoPrazo: number | null }>;
  responseByMemberId: Map<string, { averageSeconds: number | null }> | null;
};

export function buildMemberRows(members: Member[], src: MemberRowSources): MemberRow[] {
  const statsList = members.map((m) => memberTaskStats(src.tasksByMember.get(m.name) ?? []));
  const teamAvg = teamAverageOpen(statsList);
  return members.map((m, i) => {
    const stats = statsList[i];
    const period = src.periodByMemberId.get(m.id);
    return {
      member: m,
      name: canSeeField(m, "name", src.viewer) ? m.name || "(sem nome)" : "Membro",
      role: canSeeField(m, "role", src.viewer) ? m.role : "",
      stats,
      load: assessLoad(stats, teamAvg),
      score: src.scoreByMemberId.get(m.id),
      onTimePct: period?.pctNoPrazo ?? null,
      completed: period?.completed ?? 0,
      responseSeconds: src.responseByMemberId?.get(m.id)?.averageSeconds ?? null,
    };
  });
}

function sortValue(r: MemberRow, key: MemberSortKey): number | null {
  switch (key) {
    case "abertas":
      return r.stats.abertas;
    case "atrasadas":
      return r.stats.atrasadas;
    case "noPrazo":
      return r.onTimePct;
    case "resposta":
      return r.responseSeconds;
    case "score":
      return r.score?.dataState === "sem_dados" ? null : (r.score?.score ?? null);
    default:
      return null;
  }
}

/** Sem dado vai SEMPRE pro fim (nas duas direções) — "sem amostra" nunca
 * aparece como o melhor nem o pior. Empate desempata por nome. */
export function sortMemberRows(rows: MemberRow[], sort: MemberSort): MemberRow[] {
  const mult = sort.dir === "asc" ? 1 : -1;
  const byName = (a: MemberRow, b: MemberRow) => a.name.localeCompare(b.name, "pt-BR");
  return [...rows].sort((a, b) => {
    if (sort.key === "nome") return byName(a, b) * mult;
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va == null && vb == null) return byName(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    return va === vb ? byName(a, b) : (va - vb) * mult;
  });
}

export type MemberFilter = "atencao" | "bloqueio";

export function matchesFilters(r: MemberRow, filters: Set<MemberFilter>): boolean {
  if (filters.has("atencao") && r.load.level === "normal") return false;
  if (filters.has("bloqueio") && r.stats.bloqueadas === 0) return false;
  return true;
}
