import type { Insight, MemberInsightBundle } from "@/lib/insights-engine";
import type { DashTask } from "@/lib/task-aggregation";
import { formatDateToIso } from "@/lib/utils";
import { cycleTimeStats } from "./member-metrics";
import { insightWindows } from "./team-metrics";
import type { ViewId } from "./MemberViews";

/** Regras puras da V2 da página Time (só leitura do que o motor e os hooks já entregam). */

/* ---------------- Insights: poucos, acionáveis, sem repetir a pessoa ---------------- */

export const MIN_INSIGHT_PRIORITY = 55;
export const MAX_INSIGHTS = 4;

/** Do que o motor gerou: só prioridade >= 55, no máximo 1 por pessoa (o de maior prioridade) e no
 * máximo 4 no total. Nunca completa a lista artificialmente. */
export function curateInsights(
  insights: Insight[],
  opts: { min?: number; max?: number } = {},
): Insight[] {
  const min = opts.min ?? MIN_INSIGHT_PRIORITY;
  const max = opts.max ?? MAX_INSIGHTS;
  const seen = new Set<string>();
  const out: Insight[] = [];
  for (const i of [...insights].sort((a, b) => b.priority - a.priority)) {
    if (i.priority < min || seen.has(i.memberId)) continue;
    seen.add(i.memberId);
    out.push(i);
    if (out.length >= max) break;
  }
  return out;
}

/** Para onde o clique num insight leva dentro do detalhe do membro. */
export function insightTargetView(ruleId: string): ViewId {
  if (
    ruleId.startsWith("atrasadas") ||
    ruleId.startsWith("volume") ||
    ruleId === "concentracao_carga" ||
    ruleId === "projetos_acima_media_time"
  )
    return "tarefas";
  if (ruleId === "inicio_dia_frequencia") return "jornada";
  return "desempenho";
}

/* ---------------- Desempenho do time (mesma janela dos insights: este mês x mesmo trecho do mês passado) ---------------- */

export type TeamPerformance = {
  onTime: { value: number | null; previous: number | null; sample: number };
  replans: { value: number; previous: number };
  cycle: { days: number | null; previousDays: number | null; sample: number };
};

const weighted = (pairs: { rate: number | null; sample: number }[]): number | null => {
  const ok = pairs.filter((p) => p.rate != null && p.sample > 0);
  const base = ok.reduce((s, p) => s + p.sample, 0);
  return base > 0 ? ok.reduce((s, p) => s + (p.rate as number) * p.sample, 0) / base : null;
};

/** Este mês (dia 1 até hoje) — a mesma janela dos insights (nome histórico). */
export function last30Range(todayIso: string): { from: string; to: string } {
  return insightWindows(todayIso).current;
}

export function teamPerformance(
  bundles: Pick<
    MemberInsightBundle,
    | "onTimeRateCurrent"
    | "onTimeRatePrevious"
    | "onTimeSampleCurrent"
    | "onTimeSamplePrevious"
    | "replansCurrent"
    | "replansPrevious"
  >[],
  tasks: DashTask[],
  todayIso: string,
): TeamPerformance {
  const cur = last30Range(todayIso);
  const prev = insightWindows(todayIso).previous;
  const cycleNow = cycleTimeStats(tasks, cur);
  const cyclePrev = cycleTimeStats(tasks, prev);
  return {
    onTime: {
      value: weighted(
        bundles.map((b) => ({ rate: b.onTimeRateCurrent, sample: b.onTimeSampleCurrent })),
      ),
      previous: weighted(
        bundles.map((b) => ({ rate: b.onTimeRatePrevious, sample: b.onTimeSamplePrevious })),
      ),
      sample: bundles.reduce((s, b) => s + b.onTimeSampleCurrent, 0),
    },
    replans: {
      value: bundles.reduce((s, b) => s + b.replansCurrent, 0),
      previous: bundles.reduce((s, b) => s + b.replansPrevious, 0),
    },
    cycle: {
      days: cycleNow.cycleDays,
      previousDays: cyclePrev.cycleDays,
      sample: cycleNow.cycleSample,
    },
  };
}

/** "↑ 8 pp", "↓ 3 pp" ou "estável" (pontos percentuais, com tolerância de 1). */
export function trendPP(cur: number | null, prev: number | null): string | null {
  if (cur == null || prev == null) return null;
  const d = Math.round(cur - prev);
  if (Math.abs(d) < 1) return "estável";
  return `${d > 0 ? "↑" : "↓"} ${Math.abs(d)} pp`;
}
