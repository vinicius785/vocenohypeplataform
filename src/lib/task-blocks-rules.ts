import { parseIsoDateLocal, formatDateToIso } from "@/lib/utils";
import { DEADLINE_CUTOFF_HOUR } from "@/lib/performance-engine";
import type { TaskBlockCategory } from "@/lib/projetos";

/**
 * Regras puras do bloqueio de tarefa ("Bloqueada") — funções sem I/O,
 * testadas isoladamente (`task-blocks-rules.test.ts`), consumidas tanto
 * pelo server function (`task-blocks.functions.ts`, fonte de verdade)
 * quanto pelo composer da Activity (só pra prévia do "resumo de
 * impacto" — a decisão final sempre vem do backend).
 */

export const TASK_BLOCK_CATEGORIES: TaskBlockCategory[] = [
  "dependencia_tarefa",
  "aguardando_time",
  "aguardando_cliente",
  "aguardando_fornecedor",
  "aguardando_aprovacao",
  "problema_tecnico",
  "falta_informacao",
  "outro",
];

export const TASK_BLOCK_CATEGORY_LABEL: Record<TaskBlockCategory, string> = {
  dependencia_tarefa: "Dependência de outra tarefa",
  aguardando_time: "Aguardando alguém do time",
  aguardando_cliente: "Aguardando cliente",
  aguardando_fornecedor: "Aguardando fornecedor ou parceiro",
  aguardando_aprovacao: "Aguardando aprovação",
  problema_tecnico: "Problema técnico ou sistema",
  falta_informacao: "Falta de informação",
  outro: "Outro impedimento",
};

export function isValidTaskBlockCategory(value: unknown): value is TaskBlockCategory {
  return (TASK_BLOCK_CATEGORIES as string[]).includes(value as string);
}

/** Motivo não pode ser vazio, só espaços, nem curto demais pra ser um
 * impedimento real (protege contra bloqueio usado só pra "sumir" a
 * tarefa da fila sem explicação — Seção 16, "proteção contra abuso"). */
export function isValidBlockReason(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= 10;
}

/**
 * Decide se a categoria pausa o prazo por padrão (Seção 7 do pedido).
 * Nunca é uma escolha livre do usuário — só líder/admin pode
 * sobrescrever via `pauseOverride`, e só com justificativa.
 */
export function decidesPausesDeadlineByCategory(category: TaskBlockCategory): boolean {
  switch (category) {
    case "dependencia_tarefa":
    case "aguardando_time":
    case "aguardando_cliente":
    case "aguardando_fornecedor":
    case "aguardando_aprovacao":
    case "problema_tecnico":
    case "falta_informacao":
      return true;
    case "outro":
      // "Outro impedimento" é genérico demais pra presumir causa externa —
      // só pausa com override explícito de líder/admin (nunca por padrão).
      return false;
  }
}

export type PauseOverride = { approvedByUserId: string; reason: string };

/** Resolve a decisão final de pausa: regra da categoria, a menos que um
 * override válido (aprovador + justificativa não vazia) seja informado —
 * e isso só é aceito quando `canOverride` (permissão de líder/admin) é
 * verdadeiro. Escrita assim pra ficar óbvio no call site que um
 * `pauseOverride` de quem não tem permissão nunca muda o resultado. */
export function resolvePausesDeadline(
  category: TaskBlockCategory,
  canOverride: boolean,
  override?: PauseOverride,
): boolean {
  const byDefault = decidesPausesDeadlineByCategory(category);
  if (!canOverride || !override) return byDefault;
  if (!override.reason.trim()) return byDefault;
  return !byDefault ? true : byDefault; // override só pode LIGAR a pausa, nunca desligar uma pausa devida por categoria
}

export type EligibleBlockInterval = {
  pausesDeadline: boolean;
  blockedAt: string;
  unblockedAt?: string;
};

/**
 * Soma a duração (ms) dos intervalos com `pausesDeadline = true`, cada
 * um começando em `blockedAt` (nunca antes) e terminando em
 * `unblockedAt` (ou `now` se ainda ativo). Funde intervalos sobrepostos
 * antes de somar — nunca conta o mesmo instante duas vezes mesmo que
 * existam bloqueios simultâneos (múltiplos períodos na Seção 6 do
 * pedido).
 */
export function computeEligibleBlockDurationMs(
  intervals: EligibleBlockInterval[],
  nowISO: string,
): number {
  const now = new Date(nowISO).getTime();
  const merged: Array<[number, number]> = intervals
    .filter((i) => i.pausesDeadline)
    .map((i): [number, number] => {
      const start = new Date(i.blockedAt).getTime();
      const end = i.unblockedAt ? new Date(i.unblockedAt).getTime() : now;
      return [start, Math.max(start, end)];
    })
    .sort((a, b) => a[0] - b[0]);

  const unioned: Array<[number, number]> = [];
  for (const [start, end] of merged) {
    const last = unioned[unioned.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      unioned.push([start, end]);
    }
  }
  return unioned.reduce((total, [start, end]) => total + (end - start), 0);
}

/**
 * Prazo efetivo = prazo original/de replanejamento + duração elegível
 * dos bloqueios, em dias corridos (mesmo calendário do Score
 * Operacional — sem dias úteis, sem feriados, ver `performance-engine.ts`).
 * `baseDueDateISO` já deve vir com qualquer ajuste de replanejamento
 * aplicado (`effectivePerformanceDueDate`) — esta função só soma o
 * tempo bloqueado por cima, nunca substitui essa lógica.
 */
export function computeEffectivePerformanceDueDate(
  baseDueDateISO: string | undefined,
  eligibleDurationMs: number,
): string | undefined {
  if (!baseDueDateISO) return baseDueDateISO;
  if (eligibleDurationMs <= 0) return baseDueDateISO;
  const days = Math.ceil(eligibleDurationMs / 86_400_000);
  const d = parseIsoDateLocal(baseDueDateISO);
  d.setDate(d.getDate() + days);
  return formatDateToIso(d);
}

export { DEADLINE_CUTOFF_HOUR };
