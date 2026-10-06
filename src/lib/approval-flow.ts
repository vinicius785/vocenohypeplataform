import { formatDateToIso } from "@/lib/utils";
import { getTaskAssignees, getTaskPrimaryAssignee } from "@/lib/projetos";

/**
 * "Fluxo sem retrabalho" (10 pts do Score Operacional v3): das tarefas que passaram por APROVAÇÃO e
 * foram resolvidas no período, quantas chegaram lá SEM voltar para "Em ajustes".
 *
 * Só conta TRANSIÇÃO REAL de status (atividade "mudou status para X" da própria tarefa) — nunca
 * texto, comentário ou outra atividade parecida. Não mede a qualidade de ninguém: mede a eficiência
 * do fluxo de aprovação. Uma tarefa conta UMA vez, não importa quantos ciclos de ajuste teve; os
 * ciclos ficam registrados à parte (insights e média).
 */

export const FLUXO_MAX_PONTOS = 10;
/** Amostra mínima de tarefas avaliáveis; abaixo disso a dimensão fica sem dados (peso redistribuído). */
export const FLUXO_MIN_AVALIAVEIS = 3;

const STATUS_RE = /^mudou status para (.+)$/;

export type ApprovalActivityLike = { action: string; createdAt: string };

export type TaskApproval = {
  /** Quando a tarefa foi resolvida (Aprovado ou Concluído) depois de entrar em aprovação. */
  resolvedAt: string;
  /** Quantas vezes entrou em "Em ajustes" ENTRE a primeira aprovação e a resolução. */
  cycles: number;
};

/** Avalia UMA tarefa pela sequência real de status. `null` = não avaliável (nunca passou por
 * "Em aprovação", ainda não foi resolvida, ou não tem registro de atividade). */
export function evaluateTaskApproval(
  activity: ApprovalActivityLike[] | undefined,
): TaskApproval | null {
  const transitions = (activity ?? [])
    .map((a) => ({ status: STATUS_RE.exec(a.action)?.[1]?.trim(), at: a.createdAt }))
    .filter((t): t is { status: string; at: string } => !!t.status)
    .sort((a, b) => a.at.localeCompare(b.at));
  const firstApproval = transitions.findIndex((t) => t.status === "Em aprovação");
  if (firstApproval < 0) return null;
  let cycles = 0;
  for (let i = firstApproval + 1; i < transitions.length; i++) {
    const s = transitions[i].status;
    if (s === "Em ajustes") cycles += 1;
    else if (s === "Aprovado" || s === "Concluído")
      return { resolvedAt: transitions[i].at, cycles };
  }
  return null;
}

export type ApprovalFlowSummary = {
  /** Tarefas avaliáveis (passaram por aprovação e foram resolvidas no período). */
  evaluated: number;
  /** Dessas, quantas passaram por "Em ajustes" ao menos uma vez. */
  withAdjustments: number;
  /** Soma dos ciclos de ajuste (para a média). */
  cycles: number;
};

export type FlowTaskNode = {
  id: string;
  activity?: ApprovalActivityLike[];
  assignee?: string;
  assignees?: string[];
  primaryAssignee?: string;
  subtasks?: FlowTaskNode[];
};

const inRange = (iso: string, range: { from?: string; to?: string }) => {
  const day = formatDateToIso(new Date(iso));
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
};

/** Resumo por pessoa (chave = nome do responsável) das tarefas resolvidas no período. Cada tarefa vai
 * para o responsável principal (ou para todos os responsáveis, quando não há principal) — a mesma
 * regra das conclusões do score. Subtarefas são avaliadas à parte, como as demais. */
export function approvalFlowByPerson(
  nodes: FlowTaskNode[],
  range: { from?: string; to?: string },
): Map<string, ApprovalFlowSummary> {
  const out = new Map<string, ApprovalFlowSummary>();
  const walk = (items: FlowTaskNode[]) => {
    for (const t of items) {
      const approval = evaluateTaskApproval(t.activity);
      if (approval && inRange(approval.resolvedAt, range)) {
        const primary = getTaskPrimaryAssignee(t as never);
        const owners = primary ? [primary] : getTaskAssignees(t as never);
        for (const name of owners) {
          const s = out.get(name) ?? { evaluated: 0, withAdjustments: 0, cycles: 0 };
          s.evaluated += 1;
          if (approval.cycles > 0) s.withAdjustments += 1;
          s.cycles += approval.cycles;
          out.set(name, s);
        }
      }
      if (t.subtasks?.length) walk(t.subtasks);
    }
  };
  walk(nodes);
  return out;
}

export type FluxoResult = {
  /** Pontos 0-10; `null` sem amostra mínima (a dimensão sai do cálculo e o peso é redistribuído). */
  value: number | null;
  /** Fração (0-1) das avaliáveis SEM ajustes; `null` sem nenhuma avaliável. */
  rate: number | null;
  evaluated: number;
  withAdjustments: number;
  clean: number;
  cycles: number;
  /** Média de ciclos por tarefa que teve ajuste; `null` se nenhuma teve. */
  avgCycles: number | null;
  /** Há tarefas avaliáveis, mas poucas para pontuar. */
  insufficient: boolean;
};

export function computeFluxo(summary: ApprovalFlowSummary | undefined): FluxoResult {
  const evaluated = summary?.evaluated ?? 0;
  const withAdjustments = Math.min(summary?.withAdjustments ?? 0, evaluated);
  const clean = evaluated - withAdjustments;
  const rate = evaluated > 0 ? clean / evaluated : null;
  const enough = evaluated >= FLUXO_MIN_AVALIAVEIS;
  return {
    value: enough && rate != null ? rate * FLUXO_MAX_PONTOS : null,
    rate,
    evaluated,
    withAdjustments,
    clean,
    cycles: summary?.cycles ?? 0,
    avgCycles: withAdjustments > 0 ? (summary?.cycles ?? 0) / withAdjustments : null,
    insufficient: evaluated > 0 && !enough,
  };
}
