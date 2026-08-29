import { parseIsoDateLocal, formatDateToIso } from "@/lib/utils";
import { OPEN_STATUSES, type DateRange } from "@/lib/score";

export type { DateRange };

/**
 * Score Operacional (0-100, gestão) + XP (gamificação, ranking mensal) —
 * as duas métricas coexistem mas medem coisas diferentes (ver
 * `Contexto` no plano). Funções puras, sem I/O — operam sobre um shape
 * estrutural mínimo (`PerformanceTaskLike`) em vez de importar o `Task`
 * concreto de nenhuma das 3 origens (projeto/campanha/marketing), no
 * mesmo espírito de `task-aggregation.ts`'s `CampanhaTaskLike`.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `getMe()`/perfil local podem devolver um id placeholder (ex. `"me"`)
 * antes do cache de sessão terminar de hidratar — nunca tentar gravar
 * isso como `actor_id`/`person_id` no ledger (a coluna é UUID e a RLS de
 * INSERT exige `auth.uid() = actor_id`; um id inválido só geraria erro
 * silencioso no console). */
export function isValidUuid(id: string | undefined | null): id is string {
  return !!id && UUID_RE.test(id);
}

export const DEADLINE_CUTOFF_HOUR = 19;

/** Regra central: toda tarefa vence às 19h (nunca 23:59) do dia do
 * prazo — fixo/global, não configurável (item 25 do pedido). */
export function deadlineCutoff(dueISO: string): Date {
  const d = parseIsoDateLocal(dueISO);
  d.setHours(DEADLINE_CUTOFF_HOUR, 0, 0, 0);
  return d;
}

/** Uma alteração de prazo é "crítica" quando acontece no mesmo dia local
 * do prazo anterior OU DEPOIS DELE — replanejamento normal (item 11) é
 * qualquer outra alteração, sempre ANTES do dia do vencimento. Antes só
 * comparava igualdade de data (`===`), o que tratava uma tarefa mudada
 * de prazo DIAS depois de já vencida como replanejamento "normal" —
 * `effectivePerformanceDueDate` então avançava a referência livremente
 * pro novo prazo, apagando o atraso já ocorrido. Comparar `>=` (strings
 * ISO `YYYY-MM-DD` ordenam cronologicamente) cobre os dois casos que já
 * eram considerados críticos na intenção original: mudar no próprio dia
 * do vencimento ("Replanejamento no dia") e mudar depois dele ("Prazo
 * alterado depois do atraso") — ambos continuam exigindo isenção pra
 * avançar a referência. */
export function isCriticalReplan(previousDueDate: string, changedAtISO: string): boolean {
  return formatDateToIso(new Date(changedAtISO)) >= previousDueDate;
}

export type DeadlineHistoryEntryLike = {
  to?: string;
  isCritical: boolean;
  exemptFromResponsibility: boolean;
  adminOverride?: { exempted: boolean };
};

/**
 * A referência usada pra medir cumprimento operacional. Replanejamento
 * NORMAL sempre avança a referência (não há o que "escapar" fora do dia
 * do vencimento). Replanejamento CRÍTICO só avança se a alteração for
 * isenta (motivo externo, ou corrigido depois por um Admin via
 * `adminOverride`) — senão a referência fica congelada no prazo
 * anterior, mesmo que o prazo "operacional" (o que o time vê) já tenha
 * mudado. Recalculável a qualquer momento a partir do histórico — nunca
 * uma mutação incremental espalhada, o que torna a correção do Admin
 * seguro (corrigir uma entrada + rodar esta função de novo sempre dá o
 * resultado certo).
 */
export function effectivePerformanceDueDate(
  originalDueDate: string | undefined,
  deadlineHistory: DeadlineHistoryEntryLike[] | undefined,
): string | undefined {
  let ref = originalDueDate;
  for (const entry of deadlineHistory ?? []) {
    const exempted = entry.adminOverride
      ? entry.adminOverride.exempted
      : entry.exemptFromResponsibility;
    if (!entry.isCritical || exempted) ref = entry.to;
    // crítico e não isento: ref permanece congelado no prazo anterior.
  }
  return ref;
}

export type TaskOutcome = "on_time" | "early" | "late";

/** Compara o momento real de conclusão contra o corte de 19h da
 * referência de performance. "early" = concluída num dia local anterior
 * ao do prazo (não só antes das 19h do próprio dia — isso já é
 * "on_time"). `delayMinutes` só é relevante quando `outcome === "late"`. */
export function classifyOutcome(
  performanceDueDateUsed: string | undefined,
  completedAtISO: string,
): { outcome: TaskOutcome; delayMinutes: number } {
  if (!performanceDueDateUsed) return { outcome: "on_time", delayMinutes: 0 };
  const cutoff = deadlineCutoff(performanceDueDateUsed);
  const completedAt = new Date(completedAtISO);
  const diffMinutes = Math.round((completedAt.getTime() - cutoff.getTime()) / 60000);
  if (diffMinutes > 0) return { outcome: "late", delayMinutes: diffMinutes };
  const completedDateOnly = formatDateToIso(completedAt);
  return {
    outcome: completedDateOnly < performanceDueDateUsed ? "early" : "on_time",
    delayMinutes: 0,
  };
}

export type TaskDeadlineHealth =
  | "sem_prazo"
  | "no_prazo"
  | "vence_hoje"
  | "atrasada"
  | "concluida_no_prazo"
  | "concluida_com_atraso";

/** Paleta replicada (não importada) de `src/lib/metas-engine.ts`'s
 * `INDICADOR_SAUDE_TONE`/`DOT` — mesmo vocabulário emerald/amber/rose/
 * red, mas Metas e Tarefas são domínios diferentes; acoplar os dois só
 * por 4 strings de cor custaria mais do que duplicá-las. */
export const TASK_DEADLINE_HEALTH_TONE: Record<TaskDeadlineHealth, string> = {
  sem_prazo: "bg-muted text-muted-foreground",
  no_prazo: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  vence_hoje: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  atrasada: "bg-red-500/10 text-red-700 dark:text-red-400",
  concluida_no_prazo: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  concluida_com_atraso: "bg-red-500/10 text-red-700 dark:text-red-400",
};
export const TASK_DEADLINE_HEALTH_DOT: Record<TaskDeadlineHealth, string> = {
  sem_prazo: "bg-muted-foreground/40",
  no_prazo: "bg-emerald-500",
  vence_hoje: "bg-amber-500",
  atrasada: "bg-red-500",
  concluida_no_prazo: "bg-emerald-500",
  concluida_com_atraso: "bg-red-500",
};

export type TaskDeadlineHealthLike = {
  status: string;
  dueDate?: string;
  originalDueDate?: string;
  performanceDueDate?: string;
  deadlineHistory?: DeadlineHistoryEntryLike[];
  completedAt?: string;
};

/**
 * Saúde do prazo — DIMENSÃO SEPARADA do status operacional (item 7 do
 * pedido: nunca criar status novos tipo "Concluído atrasado"). "↪
 * Replanejada" é um fato ORTOGONAL a essa saúde (uma tarefa pode estar
 * "no prazo" e já ter sido replanejada uma vez pra uma data futura) —
 * exposto separadamente por `deadlineHistory.length > 0`, não como um
 * 7º estado aqui, pra não competir com o badge de saúde.
 */
export function taskDeadlineHealth(
  t: TaskDeadlineHealthLike,
  now: Date = new Date(),
): { health: TaskDeadlineHealth; label: string; tone: string; dot: string; delayDays?: number } {
  const build = (health: TaskDeadlineHealth, label: string, delayDays?: number) => ({
    health,
    label,
    tone: TASK_DEADLINE_HEALTH_TONE[health],
    dot: TASK_DEADLINE_HEALTH_DOT[health],
    delayDays,
  });

  if (t.status === "Concluído") {
    // Sem `completedAt` (tarefa legada, concluída antes desse campo
    // existir, ou criada já como "Concluído" sem log de atividade pra
    // derivar quando) não dá pra saber se foi no prazo ou atrasada — mas
    // uma coisa é certa: NUNCA é "Atrasada" (esse rótulo é pra tarefa
    // ainda aberta e vencida). Cair no ramo ao vivo abaixo mostraria uma
    // tarefa já concluída como se ainda estivesse em aberto e vencida.
    if (!t.completedAt) return build("concluida_no_prazo", "Concluída");
    const ref = effectivePerformanceDueDate(t.originalDueDate ?? t.dueDate, t.deadlineHistory);
    const { outcome, delayMinutes } = classifyOutcome(ref, t.completedAt);
    if (outcome === "late") {
      const delayDays = Math.max(1, Math.ceil(delayMinutes / (24 * 60)));
      return build("concluida_com_atraso", `Concluída com atraso · +${delayDays}d`, delayDays);
    }
    return build("concluida_no_prazo", "Concluída no prazo");
  }

  const ref = t.performanceDueDate ?? t.dueDate;
  if (!ref) return build("sem_prazo", "Sem prazo");

  const diffMs = now.getTime() - deadlineCutoff(ref).getTime();
  if (diffMs > 0) {
    const delayDays = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    return build("atrasada", `Atrasada · ${delayDays}d`, delayDays);
  }
  if (formatDateToIso(now) === ref) return build("vence_hoje", "Vence hoje");
  return build("no_prazo", "No prazo");
}

/** Crédito de Execução por tarefa concluída: 1.0 se no prazo/antecipada;
 * se atrasada, crédito parcial decrescente com o atraso (nunca zero
 * plano, nunca pontuação cheia — "não dar pontos positivos por concluir
 * atrasada" aplicado ao Score, item 4). */
export function executionCredit(outcome: TaskOutcome, delayMinutes: number): number {
  if (outcome !== "late") return 1;
  const delayDays = delayMinutes / (24 * 60);
  return Math.max(0, 1 - delayDays / 10) * 0.5;
}

export type ExecucaoResult = {
  value: number | null;
  count: number;
  onTimeCount: number;
  lateCount: number;
  earlyCount: number;
};

/** Execução (50% do Score) — TAXA de tarefas concluídas no prazo no
 * período, não soma de pontos: quem tem poucas tarefas 100% no prazo e
 * quem tem muitas 100% no prazo tiram a mesma nota (item 2: "não
 * beneficiar quem recebe mais tarefas"). `null` sem nenhuma conclusão no
 * período (sinaliza pra renormalização de pesos, nunca vira 0). */
export function computeExecucao(
  completions: { outcome: TaskOutcome; delayMinutes: number }[],
): ExecucaoResult {
  if (completions.length === 0) {
    return { value: null, count: 0, onTimeCount: 0, lateCount: 0, earlyCount: 0 };
  }
  let creditSum = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let earlyCount = 0;
  for (const c of completions) {
    creditSum += executionCredit(c.outcome, c.delayMinutes);
    if (c.outcome === "late") lateCount += 1;
    else if (c.outcome === "early") earlyCount += 1;
    else onTimeCount += 1;
  }
  const value = Math.max(0, Math.min(100, (100 * creditSum) / completions.length));
  return { value, count: completions.length, onTimeCount, lateCount, earlyCount };
}

export type PerformanceTaskLike = { status: string; dueDate?: string; performanceDueDate?: string };

/** Tarefas abertas ATUALMENTE atrasadas — mesma regra exata que
 * `computePendencias` usa internamente (`performanceDueDate ?? dueDate`
 * + corte de 19h), extraída pra função própria pra que a lista clicável
 * de "Atenção" na ficha do membro NUNCA divirja do número que o Score
 * mostra (diferente de `DashTask.bucket === "atrasada"`, que compara só
 * o dia, sempre contra `dueDate`, nunca `performanceDueDate`). */
export function overdueOpenTasks<T extends PerformanceTaskLike>(
  openTasksNow: T[],
  now: Date = new Date(),
): T[] {
  return openTasksNow.filter((t) => {
    const ref = t.performanceDueDate ?? t.dueDate;
    return !!ref && now.getTime() - deadlineCutoff(ref).getTime() > 0;
  });
}

export type PendenciasResult = {
  value: number;
  overdueCount: number;
  openCount: number;
  avgDaysOverdue: number;
};

/** Pendências (30% do Score) — SEMPRE estado atual (live), nunca
 * filtrado por período ("quantidade ATUALMENTE atrasadas", item 2).
 * `overdueRatio` é proporcional ao total de tarefas abertas da pessoa
 * (não ao total histórico), e o tempo de atraso pesa com um teto — uma
 * única tarefa muito atrasada não pode destruir o score sozinha (item
 * 17). Sem tarefa aberta = 100 (sem pendência nenhuma). */
export function computePendencias(
  openTasksNow: PerformanceTaskLike[],
  diasTeto: number,
  now: Date = new Date(),
): PendenciasResult {
  const openCount = openTasksNow.length;
  if (openCount === 0) return { value: 100, overdueCount: 0, openCount: 0, avgDaysOverdue: 0 };
  const overdue = overdueOpenTasks(openTasksNow, now);
  const overdueCount = overdue.length;
  const totalDaysOverdue = overdue.reduce((sum, t) => {
    const ref = t.performanceDueDate ?? t.dueDate;
    return sum + (now.getTime() - deadlineCutoff(ref!).getTime()) / (24 * 60 * 60 * 1000);
  }, 0);
  const overdueRatio = overdueCount / openCount;
  const avgDaysOverdue = overdueCount > 0 ? totalDaysOverdue / overdueCount : 0;
  const severity = Math.min(1, avgDaysOverdue / diasTeto);
  const value = Math.max(0, Math.min(100, 100 - 100 * overdueRatio * (0.4 + 0.6 * severity)));
  return { value, overdueCount, openCount, avgDaysOverdue };
}

export type CompromissosResult = { value: number | null; attended: number; expected: number };

/** Compromissos (20% do Score) — comparecidas/esperadas no período,
 * NUNCA quantidade absoluta (item 2). `null` sem nenhuma reunião
 * esperada no período. */
export function computeCompromissos(attendance: { attended: boolean }[]): CompromissosResult {
  const expected = attendance.length;
  if (expected === 0) return { value: null, attended: 0, expected: 0 };
  const attended = attendance.filter((a) => a.attended).length;
  return { value: Math.max(0, Math.min(100, (100 * attended) / expected)), attended, expected };
}

export type ScoreOperacionalResult = {
  score: number | null;
  execucao: ExecucaoResult;
  pendencias: PendenciasResult;
  compromissos: CompromissosResult;
  weightsUsed: { execucao: number; pendencias: number; compromissos: number };
};

export type PerformanceWeights = { execucao: number; pendencias: number; compromissos: number };

/** Combina os 3 componentes com renormalização: um componente sem dado
 * no período (Execução sem conclusão, Compromissos sem reunião
 * esperada) é excluído, e os pesos dos restantes são redistribuídos
 * proporcionalmente. Pendências só entra se a pessoa tiver ao menos 1
 * tarefa aberta OU 1 concluída no período (evita "sem tarefa nenhuma no
 * período" inflar o Score sozinho via Pendências=100). Se nenhum
 * componente tiver dado, o Score é `null` (nunca 0 — 0 pareceria "score
 * ruim" quando é "sem atividade"). */
export function computeScoreOperacional(
  execucao: ExecucaoResult,
  pendencias: PendenciasResult,
  compromissos: CompromissosResult,
  weights: PerformanceWeights,
): ScoreOperacionalResult {
  const hasPendenciasSignal = pendencias.openCount > 0 || execucao.count > 0;
  const components: { value: number; weight: number; key: keyof PerformanceWeights }[] = [];
  if (execucao.value != null)
    components.push({ value: execucao.value, weight: weights.execucao, key: "execucao" });
  if (hasPendenciasSignal)
    components.push({ value: pendencias.value, weight: weights.pendencias, key: "pendencias" });
  if (compromissos.value != null)
    components.push({
      value: compromissos.value,
      weight: weights.compromissos,
      key: "compromissos",
    });

  const weightsUsed: PerformanceWeights = { execucao: 0, pendencias: 0, compromissos: 0 };
  if (components.length === 0) {
    return { score: null, execucao, pendencias, compromissos, weightsUsed };
  }
  const totalWeight = components.reduce((s, c) => s + c.weight, 0) || 1;
  let score = 0;
  for (const c of components) {
    const effectiveWeight = c.weight / totalWeight;
    weightsUsed[c.key] = effectiveWeight;
    score += c.value * effectiveWeight;
  }
  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    execucao,
    pendencias,
    compromissos,
    weightsUsed,
  };
}

// ---------------------------------------------------------------------
// XP — gamificação, separado do Score (item 1). Congelado (`xpDelta`) no
// momento de cada evento com as regras vigentes naquele instante — mudar
// as regras depois nunca reescreve XP de meses passados.
// ---------------------------------------------------------------------

export const DEADLINE_CHANGE_MOTIVO_EXEMPTS_BY_DEFAULT: Record<string, boolean> = {
  dependencia_cliente: true,
  mudanca_escopo: true,
  prioridade_lideranca: true,
  dependencia_interna: true,
  replanejamento_operacional: false,
  atraso_responsavel: false,
  outro: false,
};

export type PerformanceSettings = {
  weightExecucao: number;
  weightPendencias: number;
  weightCompromissos: number;
  pendenciasDiasTeto: number;
  xpTaskOnTime: number;
  xpTaskEarlyBonus: number;
  xpMeetingAttended: number;
  xpMeetingMissed: number;
  xpOverdueDiasTeto: number;
  motivoIsencaoDefault: Record<string, boolean>;
};

export const DEFAULT_PERFORMANCE_SETTINGS: PerformanceSettings = {
  weightExecucao: 0.5,
  weightPendencias: 0.3,
  weightCompromissos: 0.2,
  pendenciasDiasTeto: 10,
  xpTaskOnTime: 10,
  xpTaskEarlyBonus: 2,
  xpMeetingAttended: 2,
  xpMeetingMissed: -5,
  xpOverdueDiasTeto: 10,
  motivoIsencaoDefault: DEADLINE_CHANGE_MOTIVO_EXEMPTS_BY_DEFAULT,
};

/** XP de conclusão de tarefa: +10 no prazo, +2 de bônus se antecipada, 0
 * se atrasada (NUNCA pontos positivos por concluir atrasada, item 4).
 * Dividido igualmente entre os responsáveis quando a tarefa tem 2+
 * assignees — crédito cheio pra todos seria um vetor de "farming" de XP
 * (soma absoluta) que a Execução/Pendências, sendo taxas, não têm (item
 * 24: evitar incentivo de acumular responsáveis/tarefas artificialmente). */
export function xpForCompletion(
  outcome: TaskOutcome,
  settings: PerformanceSettings,
  assigneesCount: number,
): number {
  const base =
    outcome === "late"
      ? 0
      : settings.xpTaskOnTime + (outcome === "early" ? settings.xpTaskEarlyBonus : 0);
  const divisor = Math.max(1, assigneesCount);
  return Math.round(base / divisor);
}

/** Penalização progressiva de XP pra tarefa aberta e atualmente
 * atrasada, com teto (item 4/17 — uma tarefa não pode destruir o XP do
 * mês sozinha). */
export function xpPenaltyForOverdueTask(
  daysOverdue: number,
  settings: PerformanceSettings,
): number {
  const maxPenalty = settings.xpOverdueDiasTeto * 2;
  return -Math.min(maxPenalty, Math.round(2 * Math.max(0, daysOverdue)));
}

export function xpForMeeting(attended: boolean, settings: PerformanceSettings): number {
  return attended ? settings.xpMeetingAttended : settings.xpMeetingMissed;
}

/** Soma o `data.xpDelta` já congelado de cada evento do ledger no
 * período (normalmente um mês) — nunca recalcula com regras atuais,
 * pra XP de meses passados nunca mudar. */
export function sumXpForPeriod(events: { data?: Record<string, unknown> }[]): number {
  return events.reduce((sum, e) => {
    const delta = e.data && typeof e.data.xpDelta === "number" ? (e.data.xpDelta as number) : 0;
    return sum + delta;
  }, 0);
}

// ---------------------------------------------------------------------
// Indicadores agregados (item 20) — uma única passada sobre eventos do
// ledger já filtrados ao período + contagem de tarefas atualmente
// atrasadas (fornecida pelo chamador, mesma fonte que Pendências usa).
// ---------------------------------------------------------------------

export type CompletionEventLike = {
  outcome: TaskOutcome;
  delayMinutes: number;
  taskId: string | null;
};
export type DeadlineChangeEventLike = {
  taskId: string | null;
  isCritical: boolean;
  motivo?: string;
  exemptFromResponsibility: boolean;
};

export type AggregateIndicators = {
  pctNoPrazo: number | null;
  pctComAtraso: number | null;
  atualmenteAtrasadas: number;
  tempoMedioAtrasoDias: number | null;
  qtdReplanejamentos: number;
  qtdReplanejamentosNoDia: number;
  pctComPrazoAlterado: number | null;
  motivosMaisComuns: { motivo: string; count: number }[];
  pctDependenciaExterna: number | null;
};

export function computeAggregateIndicators(
  completions: CompletionEventLike[],
  deadlineChanges: DeadlineChangeEventLike[],
  currentlyOverdueCount: number,
): AggregateIndicators {
  const total = completions.length;
  const late = completions.filter((c) => c.outcome === "late");
  const pctNoPrazo = total > 0 ? (100 * (total - late.length)) / total : null;
  const pctComAtraso = total > 0 ? (100 * late.length) / total : null;
  const tempoMedioAtrasoDias =
    late.length > 0 ? late.reduce((s, c) => s + c.delayMinutes, 0) / late.length / (24 * 60) : null;

  const qtdReplanejamentos = deadlineChanges.length;
  const qtdReplanejamentosNoDia = deadlineChanges.filter((d) => d.isCritical).length;
  const externos = deadlineChanges.filter((d) => d.exemptFromResponsibility).length;
  const pctDependenciaExterna =
    qtdReplanejamentos > 0 ? (100 * externos) / qtdReplanejamentos : null;

  const changedTaskIds = new Set(
    deadlineChanges.map((d) => d.taskId).filter((id): id is string => !!id),
  );
  const completedTaskIds = new Set(
    completions.map((c) => c.taskId).filter((id): id is string => !!id),
  );
  const allTaskIds = new Set([...changedTaskIds, ...completedTaskIds]);
  const pctComPrazoAlterado =
    allTaskIds.size > 0 ? (100 * changedTaskIds.size) / allTaskIds.size : null;

  const motivoCounts = new Map<string, number>();
  for (const d of deadlineChanges) {
    if (!d.motivo) continue;
    motivoCounts.set(d.motivo, (motivoCounts.get(d.motivo) ?? 0) + 1);
  }
  const motivosMaisComuns = [...motivoCounts.entries()]
    .map(([motivo, count]) => ({ motivo, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    pctNoPrazo,
    pctComAtraso,
    atualmenteAtrasadas: currentlyOverdueCount,
    tempoMedioAtrasoDias,
    qtdReplanejamentos,
    qtdReplanejamentosNoDia,
    pctComPrazoAlterado,
    motivosMaisComuns,
    pctDependenciaExterna,
  };
}

// ---------------------------------------------------------------------
// Agrupamento de eventos do ledger — shape mínimo estrutural (não
// importa `PerformanceEvent` de `performance-events-store.ts` de
// propósito, pra não criar import circular entre o motor puro e a
// camada de I/O que já importa deste arquivo).
// ---------------------------------------------------------------------

export type PerformanceEventLike = {
  eventType: string;
  personId: string | null;
  personName: string;
  taskId: string | null;
  taskTitle: string | null;
  meetingId: string | null;
  occurredAt: string;
  data: Record<string, unknown>;
};

/** Agrupa eventos por pessoa — chave preferencial `personId`; cai pro
 * nome quando o id não foi resolvido no momento da gravação (ver risco
 * documentado: assignee é nome, não id, hoje — dívida pré-existente). */
export function groupEventsByPerson(
  events: PerformanceEventLike[],
): Map<string, PerformanceEventLike[]> {
  const map = new Map<string, PerformanceEventLike[]>();
  for (const e of events) {
    const key = e.personId ?? `name:${e.personName}`;
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  return map;
}

/** A presença de uma reunião pode ser gravada mais de uma vez (botão
 * "Editar presença") — o ledger não permite corrigir/apagar o evento
 * antigo, então dedup aqui na leitura: o de maior `occurredAt` vence
 * por par (reunião, pessoa). */
export function dedupAttendanceEvents(events: PerformanceEventLike[]): PerformanceEventLike[] {
  const latest = new Map<string, PerformanceEventLike>();
  for (const e of events) {
    const key = `${e.meetingId}:${e.personId ?? e.personName}`;
    const prev = latest.get(key);
    if (!prev || e.occurredAt > prev.occurredAt) latest.set(key, e);
  }
  return [...latest.values()];
}

// ---------------------------------------------------------------------
// Seletor de período do Score (item 3) — mesmo shape `DateRange` que
// `score.ts` já usa, reaproveitado (reexportado no topo deste arquivo).
// ---------------------------------------------------------------------

export type ScorePeriodMode = "semana" | "mes" | "30dias" | "trimestre";

export const SCORE_PERIOD_OPTIONS: { value: ScorePeriodMode; label: string }[] = [
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mês" },
  { value: "30dias", label: "Últimos 30 dias" },
  { value: "trimestre", label: "Trimestre" },
];

export function rangeForScorePeriod(mode: ScorePeriodMode, now: Date = new Date()): DateRange {
  const to = formatDateToIso(now);
  if (mode === "semana") {
    const day = now.getDay(); // 0 = domingo
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    return { from: formatDateToIso(monday), to };
  }
  if (mode === "30dias") {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from: formatDateToIso(from), to };
  }
  if (mode === "trimestre") {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 3);
    return { from: formatDateToIso(from), to };
  }
  // "mes" (default)
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: formatDateToIso(from), to };
}

// ---------------------------------------------------------------------
// Seletor de período da FICHA do membro — opções deliberadamente
// diferentes de `ScorePeriodMode` (que é o seletor da página Time):
// a ficha precisa de "Mês anterior" (comparação de gestão individual),
// que não faz sentido no contexto de time inteiro. Estado independente,
// desacoplado do `scorePeriod` da página.
// ---------------------------------------------------------------------

export type ProfilePeriodMode = "semana" | "mes" | "mes_anterior" | "90dias";

export const PROFILE_PERIOD_OPTIONS: { value: ProfilePeriodMode; label: string }[] = [
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mês" },
  { value: "mes_anterior", label: "Mês anterior" },
  { value: "90dias", label: "Últimos 90 dias" },
];

export function rangeForProfilePeriod(mode: ProfilePeriodMode, now: Date = new Date()): DateRange {
  if (mode === "mes_anterior") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0); // dia 0 = último dia do mês anterior
    return { from: formatDateToIso(from), to: formatDateToIso(to) };
  }
  if (mode === "90dias") {
    const to = formatDateToIso(now);
    const from = new Date(now);
    from.setDate(from.getDate() - 90);
    return { from: formatDateToIso(from), to };
  }
  return rangeForScorePeriod(mode === "semana" ? "semana" : "mes", now);
}
