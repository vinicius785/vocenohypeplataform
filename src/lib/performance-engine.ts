import { parseIsoDateLocal, formatDateToIso } from "@/lib/utils";
import type { DateRange } from "@/lib/score";

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

/** Valor de fábrica — usado como default sempre que uma chamada não
 * repassa o horário configurado (`PerformanceSettings.deadlineCutoffHour`),
 * nunca mais hardcoded/fixo (era assim até uma rodada anterior desta
 * sessão; agora é configurável em Configurações → Score operacional →
 * Regras de prazo). Manter como parâmetro opcional com este default
 * garante que nenhum call-site quebra ao não repassar o valor
 * configurado explicitamente. */
export const DEADLINE_CUTOFF_HOUR = 19;

/** Regra central: toda tarefa vence às `cutoffHour`h (nunca 23:59) do
 * dia do prazo. */
export function deadlineCutoff(dueISO: string, cutoffHour: number = DEADLINE_CUTOFF_HOUR): Date {
  const d = parseIsoDateLocal(dueISO);
  d.setHours(cutoffHour, 0, 0, 0);
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

/** Só exige justificativa quando a tarefa vence hoje/já está atrasada
 * (`isCriticalReplan`) E o novo prazo está sendo ADIADO — `isCriticalReplan`
 * sozinha não sabe a direção da mudança (uma tarefa atrasada movida pra
 * uma data ainda mais cedo continuaria "crítica" por ela, mesmo sem
 * fazer sentido pedir motivo pra quem está antecipando). Antecipar
 * prazo, ou mudar uma tarefa com prazo futuro, nunca interrompe o
 * fluxo — sempre salva silenciosamente. */
export function isCriticalDeadlineMove(
  previousDueDate: string,
  nextDueDate: string,
  nowISO: string,
): boolean {
  return (
    !!nextDueDate && nextDueDate > previousDueDate && isCriticalReplan(previousDueDate, nowISO)
  );
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
  cutoffHour: number = DEADLINE_CUTOFF_HOUR,
): { outcome: TaskOutcome; delayMinutes: number } {
  if (!performanceDueDateUsed) return { outcome: "on_time", delayMinutes: 0 };
  const cutoff = deadlineCutoff(performanceDueDateUsed, cutoffHour);
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
  cutoffHour: number = DEADLINE_CUTOFF_HOUR,
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
    const { outcome, delayMinutes } = classifyOutcome(ref, t.completedAt, cutoffHour);
    if (outcome === "late") {
      const delayDays = Math.max(1, Math.ceil(delayMinutes / (24 * 60)));
      return build("concluida_com_atraso", `Concluída com atraso · +${delayDays}d`, delayDays);
    }
    return build("concluida_no_prazo", "Concluída no prazo");
  }

  const ref = t.performanceDueDate ?? t.dueDate;
  if (!ref) return build("sem_prazo", "Sem prazo");

  const diffMs = now.getTime() - deadlineCutoff(ref, cutoffHour).getTime();
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
  cutoffHour: number = DEADLINE_CUTOFF_HOUR,
): T[] {
  return openTasksNow.filter((t) => {
    const ref = t.performanceDueDate ?? t.dueDate;
    return !!ref && now.getTime() - deadlineCutoff(ref, cutoffHour).getTime() > 0;
  });
}

export type PerformanceOpenTaskWithPriority = PerformanceTaskLike & { priority?: string };

/** Detalhe (dias de atraso + prioridade alta?) de cada tarefa
 * ATUALMENTE atrasada — usado por `computeEntrega`/`computeScoreGuardrails`
 * pras penalidades graduadas e salvaguardas de coerência. Única função
 * que soma "quantos dias" a partir do mesmo corte (`deadlineCutoff`) que
 * `overdueOpenTasks` já usa pra decidir SE está atrasada, pra nunca
 * divergir entre "está atrasada" e "há quantos dias". `Math.ceil` (não
 * `Math.floor`) pra uma tarefa vencida há poucas horas já contar como
 * "1 dia de atraso", nunca "0 dias" (0 pareceria "não atrasada" nas
 * penalidades graduadas). */
export function overdueTaskDetails<T extends PerformanceOpenTaskWithPriority>(
  openTasksNow: T[],
  now: Date = new Date(),
  cutoffHour: number = DEADLINE_CUTOFF_HOUR,
): OverdueTaskDetail[] {
  return overdueOpenTasks(openTasksNow, now, cutoffHour).map((t) => {
    const ref = (t.performanceDueDate ?? t.dueDate)!;
    const daysOverdue = Math.max(
      1,
      Math.ceil(
        (now.getTime() - deadlineCutoff(ref, cutoffHour).getTime()) / (24 * 60 * 60 * 1000),
      ),
    );
    return { daysOverdue, highPriority: isHighPriority(t.priority) };
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
  cutoffHour: number = DEADLINE_CUTOFF_HOUR,
): PendenciasResult {
  const openCount = openTasksNow.length;
  if (openCount === 0) return { value: 100, overdueCount: 0, openCount: 0, avgDaysOverdue: 0 };
  const overdue = overdueOpenTasks(openTasksNow, now, cutoffHour);
  const overdueCount = overdue.length;
  const totalDaysOverdue = overdue.reduce((sum, t) => {
    const ref = t.performanceDueDate ?? t.dueDate;
    return (
      sum + (now.getTime() - deadlineCutoff(ref!, cutoffHour).getTime()) / (24 * 60 * 60 * 1000)
    );
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
  xpTaskOnTime: number;
  xpTaskEarlyBonus: number;
  xpMeetingAttended: number;
  xpMeetingMissed: number;
  xpOverdueDiasTeto: number;
  motivoIsencaoDefault: Record<string, boolean>;
  /** Horário (0-23) em que uma tarefa com só DATA de vencimento (sem
   * horário específico) é considerada vencida naquele dia — antes fixo
   * em 19h (`DEADLINE_CUTOFF_HOUR`), agora configurável em
   * Configurações → Score operacional → Regras de prazo. */
  deadlineCutoffHour: number;
};

export const DEFAULT_PERFORMANCE_SETTINGS: PerformanceSettings = {
  xpTaskOnTime: 10,
  xpTaskEarlyBonus: 2,
  xpMeetingAttended: 2,
  xpMeetingMissed: -5,
  xpOverdueDiasTeto: 10,
  motivoIsencaoDefault: DEADLINE_CHANGE_MOTIVO_EXEMPTS_BY_DEFAULT,
  deadlineCutoffHour: DEADLINE_CUTOFF_HOUR,
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

/** Janela de mesma duração imediatamente anterior a `range` — mesmo
 * princípio de `previousPeriodRange` em `useFinanceiroFilteredEntries.ts`
 * (não importado de lá: camadas diferentes do app), usado pra "vs.
 * período anterior" do Score Operacional. */
export function previousEquivalentRange(range: DateRange): DateRange {
  if (!range.from || !range.to) return { from: undefined, to: undefined };
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return { from: formatDateToIso(prevFrom), to: formatDateToIso(prevTo) };
}

// ---------------------------------------------------------------------
// Score Operacional v2 — Entrega (50) + Previsibilidade (35) +
// Compromissos (15), pontos fixos e somáveis (não mais taxas 0-100
// combinadas por peso configurável). Ver `Contexto` no plano: o modelo
// antigo (`computeScoreOperacional` acima, PRESERVADO — ainda usado por
// nada além deste arquivo agora, mas não removido) dava crédito parcial
// a conclusão atrasada e nunca penalizava replanejamento de verdade, o
// que produzia scores altos (ex. 92/100) mesmo com baixíssima
// previsibilidade de planejamento (muitos prazos alterados em cima da
// hora). Funções novas, paralelas — nenhuma função/tipo acima é alterado
// (`computeAggregateIndicators` continua intocada, ainda usada por
// `TeamIndicators.tsx`).
// ---------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Amostra mínima pra uma classificação DEFINITIVA (Excelente/Bom/Atenção/
 * Crítico) — abaixo disso o score ainda é calculado e mostrado, mas
 * marcado "Provisório" (nunca definitivo), pra uma avaliação baseada em
 * poucos dados nunca parecer conclusiva (item de "amostra insuficiente"
 * do pedido). Centralizado aqui — nenhum outro lugar deve hardcodar esse
 * limiar. */
export const MIN_TASK_SAMPLE = 5;

/** Dias de atraso a partir dos quais uma tarefa atualmente vencida entra
 * na penalidade agravada de "atraso longo" (independente de prioridade). */
export const ATRASO_LONGO_DIAS = 5;
/** Prioridades tratadas como "alta" pra fins de agravamento do Score —
 * mesmos valores de `TaskPriority` em `projetos.ts`, replicados aqui (não
 * importados) pra este motor continuar sem depender do shape concreto de
 * `Task` (mesmo espírito do restante do arquivo, ver `Contexto` no topo). */
const HIGH_PRIORITY_VALUES = new Set(["Urgente", "Alta"]);

export function isHighPriority(priority: string | undefined): boolean {
  return !!priority && HIGH_PRIORITY_VALUES.has(priority);
}

export const ENTREGA_MAX_PONTOS = 50;
export const PREVISIBILIDADE_MAX_PONTOS = 35;
export const COMPROMISSOS_MAX_PONTOS = 15;

/** Pontos subtraídos da Entrega por CADA tarefa atualmente atrasada há
 * mais de `ATRASO_LONGO_DIAS` dias. */
export const PENALIDADE_ATRASO_LONGO = 8;
/** Pontos subtraídos da Entrega por CADA tarefa atualmente atrasada de
 * prioridade alta/urgente. Somável com a penalidade de atraso longo — uma
 * mesma tarefa atrasada há muito tempo E de prioridade alta deve pesar
 * pelos dois motivos (não é "dupla contagem do mesmo evento", são dois
 * fatores de gravidade distintos sobre o mesmo atraso). */
export const PENALIDADE_PRIORIDADE_ALTA = 6;

export type EntregaResult = {
  value: number | null; // pontos 0-50; null só quando não há NENHUM dado (nem conclusão nem tarefa aberta atrasada)
  concluidas: number;
  noPrazo: number;
  comAtraso: number;
  atualmenteAtrasadas: number;
  /** `concluidas + atualmenteAtrasadas` — universo de tarefas que de fato
   * entram na conta de Entrega/Previsibilidade neste período (base da
   * taxa E da checagem de amostra insuficiente). Tarefa aberta mas ainda
   * dentro do prazo NÃO entra aqui — não é "atividade" pra fins de score,
   * só "trabalho em andamento". */
  tarefasElegiveis: number;
  /** Quantas das atualmente atrasadas passam de `ATRASO_LONGO_DIAS` dias. */
  atrasoLongoCount: number;
  /** Quantas das atualmente atrasadas são de prioridade alta/urgente. */
  prioridadeAltaCount: number;
  /** Quantas das atualmente atrasadas são AO MESMO TEMPO de prioridade
   * alta/urgente E atraso longo — a condição exata da salvaguarda de
   * coerência "tarefa de prioridade alta atrasada há mais de 5 dias". */
  prioridadeAltaAtrasoLongoCount: number;
  amostraReduzida: boolean;
};

export type OverdueTaskDetail = { daysOverdue: number; highPriority: boolean };

/** Entrega (50 pontos) — taxa de conclusão no prazo (SEM crédito parcial
 * pra atraso, diferente de `executionCredit`/`computeExecucao`: aqui é
 * só no_prazo/atrasada, binário, como pedido), com penalidades graduadas
 * por severidade do backlog de tarefas ATUALMENTE atrasadas (atraso
 * longo, prioridade alta) — nunca deixa o resultado abaixo de 0 nem
 * pontua a mais que 50 (`clamp`). `null` só quando não há NENHUM dado
 * (nem conclusão no período, nem tarefa aberta e vencida agora) — ausência
 * de dado nunca deve virar pontuação, positiva ou negativa (é o bug
 * original: 0 conclusões dava base 50 "de fábrica"). O acúmulo de
 * atrasadas já é penalizado pela própria taxa (cada atrasada aumenta o
 * denominador sem aumentar o numerador) — não há uma penalidade "de
 * acúmulo" redundante aqui; o teto duro pra 5+ atrasadas vive nas
 * salvaguardas de coerência (`computeScoreGuardrails`), não nesta função. */
export function computeEntrega(
  completions: { outcome: TaskOutcome }[],
  overdueTasks: OverdueTaskDetail[],
): EntregaResult {
  const concluidas = completions.length;
  const noPrazo = completions.filter((c) => c.outcome !== "late").length;
  const comAtraso = concluidas - noPrazo;
  const atualmenteAtrasadas = overdueTasks.length;
  const tarefasElegiveis = concluidas + atualmenteAtrasadas;

  const atrasoLongo = overdueTasks.filter((t) => t.daysOverdue > ATRASO_LONGO_DIAS);
  const prioridadeAlta = overdueTasks.filter((t) => t.highPriority);
  const prioridadeAltaAtrasoLongo = overdueTasks.filter(
    (t) => t.highPriority && t.daysOverdue > ATRASO_LONGO_DIAS,
  );

  if (tarefasElegiveis === 0) {
    return {
      value: null,
      concluidas: 0,
      noPrazo: 0,
      comAtraso: 0,
      atualmenteAtrasadas: 0,
      tarefasElegiveis: 0,
      atrasoLongoCount: 0,
      prioridadeAltaCount: 0,
      prioridadeAltaAtrasoLongoCount: 0,
      amostraReduzida: false,
    };
  }

  const taxaEntregaNoPrazo = noPrazo / tarefasElegiveis;
  const pontosEntregaBase = taxaEntregaNoPrazo * ENTREGA_MAX_PONTOS;
  const penalidade =
    atrasoLongo.length * PENALIDADE_ATRASO_LONGO +
    prioridadeAlta.length * PENALIDADE_PRIORIDADE_ALTA;

  return {
    value: clamp(pontosEntregaBase - penalidade, 0, ENTREGA_MAX_PONTOS),
    concluidas,
    noPrazo,
    comAtraso,
    atualmenteAtrasadas,
    tarefasElegiveis,
    atrasoLongoCount: atrasoLongo.length,
    prioridadeAltaCount: prioridadeAlta.length,
    prioridadeAltaAtrasoLongoCount: prioridadeAltaAtrasoLongo.length,
    amostraReduzida: tarefasElegiveis < MIN_TASK_SAMPLE,
  };
}

export type ReplanTiming = "antecipado" | "proximo" | "no_dia" | "apos_vencimento";

export const REPLAN_TIMING_LABEL: Record<ReplanTiming, string> = {
  antecipado: "Antecipado",
  proximo: "Próximo do prazo",
  no_dia: "No dia",
  apos_vencimento: "Após vencimento",
};

const REPLAN_TIMING_WEIGHT: Record<ReplanTiming, number> = {
  antecipado: 0.05,
  proximo: 0.35,
  no_dia: 0.7,
  apos_vencimento: 1,
};

/** Classifica UMA alteração de prazo pela distância entre o momento da
 * mudança e o prazo ANTERIOR (`from`) — mais de 2 dias completos antes =
 * antecipado (penalidade mínima); 1-2 dias antes = próximo do prazo
 * (moderada); mesmo dia = alta; depois de já vencida = muito alta. Usa a
 * mesma referência de corte (`deadlineCutoff`) que já decide se uma
 * conclusão é "atrasada", pra manter as duas classificações consistentes
 * entre si. */
export function classifyReplanTiming(
  previousDueDate: string,
  changedAtISO: string,
  cutoffHour: number = DEADLINE_CUTOFF_HOUR,
): ReplanTiming {
  const limite = deadlineCutoff(previousDueDate, cutoffHour).getTime();
  const mudou = new Date(changedAtISO).getTime();
  const diasAntes = (limite - mudou) / (24 * 60 * 60 * 1000);
  if (diasAntes < 0) return "apos_vencimento";
  if (diasAntes < 1) return "no_dia";
  if (diasAntes <= 2) return "proximo";
  return "antecipado";
}

export type PrevisibilidadeResult = {
  value: number | null; // pontos 0-35; null quando não há tarefa elegível no período ("Sem dados", NUNCA 35/35 de fábrica)
  tarefasReplanejadas: number; // tarefas ÚNICAS com >=1 alteração no período
  tarefasElegiveis: number; // mesmo universo de `EntregaResult.tarefasElegiveis` (item: nunca calcular sem essa base)
  taxaReplanejamento: number | null; // tarefasReplanejadas / tarefasElegiveis
  porTiming: Record<ReplanTiming, number>; // contagem de EVENTOS (não tarefas) por classificação
  amostraReduzida: boolean;
};

/** Previsibilidade (35 pontos, antes exibida só como "Regularidade"
 * diagnóstica, agora parte do cálculo) — mede replanejamento por TAXA de
 * tarefas únicas afetadas (uma tarefa alterada 3x conta 1x pra taxa), com
 * peso por severidade (`classifyReplanTiming`) sobre a PIOR alteração de
 * cada tarefa, mais uma pequena penalidade adicional (capada) por
 * alterações repetidas na mesma tarefa — sem duplicar a penalização
 * principal (item 8: evitar dupla penalização excessiva do mesmo
 * evento). `tarefasElegiveis` é SEMPRE a mesma base de `computeEntrega`
 * (passar `entrega.tarefasElegiveis` do mesmo período) — só assim as duas
 * dimensões concordam sobre "quando há dado suficiente pra calcular".
 * Sem tarefa elegível, `value` é `null` ("Sem dados"), nunca 35 de
 * fábrica — esse era o bug original (ausência de tarefa sendo tratada
 * como previsibilidade perfeita). */
export function computePrevisibilidade(
  deadlineChanges: { taskId: string | null; from?: string; occurredAt: string }[],
  tarefasElegiveis: number,
  cutoffHour: number = DEADLINE_CUTOFF_HOUR,
): PrevisibilidadeResult {
  const porTiming: Record<ReplanTiming, number> = {
    antecipado: 0,
    proximo: 0,
    no_dia: 0,
    apos_vencimento: 0,
  };
  const porTarefa = new Map<string, ReplanTiming[]>();
  for (const d of deadlineChanges) {
    if (!d.taskId || !d.from) continue;
    const timing = classifyReplanTiming(d.from, d.occurredAt, cutoffHour);
    porTiming[timing] += 1;
    const arr = porTarefa.get(d.taskId) ?? [];
    arr.push(timing);
    porTarefa.set(d.taskId, arr);
  }

  const tarefasReplanejadas = porTarefa.size;

  if (tarefasElegiveis === 0) {
    return {
      value: null,
      tarefasReplanejadas,
      tarefasElegiveis: 0,
      taxaReplanejamento: null,
      porTiming,
      amostraReduzida: false,
    };
  }

  const taxaReplanejamento = tarefasReplanejadas / tarefasElegiveis;
  let somaSeveridade = 0;
  let somaRepetidas = 0;
  for (const timings of porTarefa.values()) {
    const pior = timings.reduce(
      (max, t) => (REPLAN_TIMING_WEIGHT[t] > REPLAN_TIMING_WEIGHT[max] ? t : max),
      timings[0],
    );
    somaSeveridade += REPLAN_TIMING_WEIGHT[pior];
    somaRepetidas += Math.max(0, timings.length - 1);
  }
  const penalidadeBase = somaSeveridade / tarefasElegiveis;
  const penalidadeRepeticao = Math.min(0.05, 0.01 * somaRepetidas);
  const value = clamp(
    (1 - penalidadeBase - penalidadeRepeticao) * PREVISIBILIDADE_MAX_PONTOS,
    0,
    PREVISIBILIDADE_MAX_PONTOS,
  );

  return {
    value,
    tarefasReplanejadas,
    tarefasElegiveis,
    taxaReplanejamento,
    porTiming,
    amostraReduzida: tarefasElegiveis < MIN_TASK_SAMPLE,
  };
}

const SCORE_CLASSIFICACAO: { min: number; label: string }[] = [
  { min: 90, label: "Excelente" },
  { min: 75, label: "Bom" },
  { min: 60, label: "Atenção" },
  { min: 0, label: "Crítico" },
];

export function classificacaoDoScore(score: number): string {
  return SCORE_CLASSIFICACAO.find((c) => score >= c.min)!.label;
}

/** Estado de disponibilidade de dado do Score — controla o que a
 * interface pode mostrar (nunca um número OU classificação quando não
 * há base pra isso):
 * - `sem_dados`: nenhuma tarefa elegível no período E nenhuma atualmente
 *   atrasada — não existe score (nem 0, nem 35 "de fábrica"). A ficha
 *   mostra "—"/"Sem dados", nunca um número.
 * - `provisorio`: há score calculado, mas com menos de `MIN_TASK_SAMPLE`
 *   tarefas elegíveis — mostrado com o valor calculado, marcado
 *   "Provisório", sem classificação definitiva (Excelente/Bom/Atenção/
 *   Crítico não se aplicam ainda).
 * - `definitivo`: `MIN_TASK_SAMPLE` ou mais tarefas elegíveis — score e
 *   classificação definitivos. */
export type ScoreDataState = "sem_dados" | "provisorio" | "definitivo";

/** Um motivo pelo qual o score final foi reduzido abaixo do que a média
 * ponderada das 3 dimensões sugeriria — "salvaguarda de coerência" no
 * pedido: nenhum resultado bom secundário pode mascarar um problema grave
 * de entrega. `penalty` é quantos pontos ESSE motivo, isoladamente,
 * desconta do score renormalizado — escalado pela gravidade (quantas
 * tarefas, há quantos dias), NUNCA um teto fixo idêntico pra qualquer
 * gravidade (ver nota de correção abaixo).
 *
 * CORREÇÃO (2026-09-20): até aqui, cada motivo carregava um `cap` — um
 * teto FIXO (ex.: 49) que sobrescrevia o score inteiro via
 * `Math.min(scoreRenormalizado, capEfetivo)`. Na prática isso jogava
 * fora todo o sinal real: uma única tarefa de prioridade alta atrasada
 * há 6 dias travava o score em exatamente 49, idêntico ao de outra
 * pessoa com a mesma tarefa mas 21 tarefas atrasadas no total — mesmo
 * quando a primeira tinha ~100 entregas no prazo naquele mês. Duas
 * pessoas com desempenhos radicalmente diferentes acabavam com o MESMO
 * número só por terem disparado a mesma regra, sem relação com a
 * gravidade real. Substituído por desconto proporcional: penaliza mais
 * quem acumula mais/há mais tempo, sem apagar um histórico bom por uma
 * única pendência pontual. */
export type GuardrailReason = { key: string; label: string; penalty: number };

/** Quantos pontos cada regra desconta, no pior caso — usado só pra
 * documentar/testar o teto de cada uma; o desconto real escala entre 0 e
 * esse valor conforme a gravidade (ver corpo de `computeScoreGuardrails`). */
export const GUARDRAIL_PENALTY_MAX_TAXA_ABAIXO_35 = 30;
export const GUARDRAIL_PENALTY_MAX_TAXA_ABAIXO_50 = 15;
export const GUARDRAIL_PENALTY_PRIORIDADE_ALTA_BASE = 10;
export const GUARDRAIL_PENALTY_PRIORIDADE_ALTA_POR_DIA_EXTRA = 2;
export const GUARDRAIL_PENALTY_PRIORIDADE_ALTA_MAX_POR_TAREFA = 25;
export const GUARDRAIL_PENALTY_ACUMULO_BASE = 10;
export const GUARDRAIL_PENALTY_ACUMULO_POR_TAREFA_EXTRA = 3;
export const GUARDRAIL_PENALTY_ACUMULO_MAX = 40;
export const GUARDRAIL_PENALTY_ENTREGA_ZERO = 15;
/** Nenhuma combinação de salvaguardas pode descontar mais que isto do
 * score renormalizado — evita empilhamento absurdo quando várias regras
 * disparam ao mesmo tempo pra uma pessoa genuinamente com problemas
 * graves (o objetivo é diferenciar gravidade, não zerar ninguém). */
export const GUARDRAIL_PENALTY_MAX_TOTAL = 60;
/** A partir de quantas tarefas atualmente atrasadas a penalidade de
 * acúmulo entra em vigor. */
export const GUARDRAIL_ACUMULO_LIMIAR = 5;

/**
 * Salvaguardas de coerência (item explícito do pedido) — função central,
 * única, testável isoladamente: nenhuma tela lê essas regras "espalhadas"
 * pela UI, todas vivem aqui. Cada regra dispara de forma independente e
 * desconta pontos proporcionais à gravidade — nunca um teto fixo (ver nota
 * de correção no tipo `GuardrailReason` acima).
 */
export function computeScoreGuardrails(entrega: EntregaResult): GuardrailReason[] {
  const reasons: GuardrailReason[] = [];
  const taxaNoPrazo =
    entrega.tarefasElegiveis > 0 ? entrega.noPrazo / entrega.tarefasElegiveis : null;

  if (taxaNoPrazo != null && taxaNoPrazo < 0.35) {
    // taxa=0 -> desconto máximo (30); taxa perto de 35% -> quase 0.
    const penalty = Math.round(GUARDRAIL_PENALTY_MAX_TAXA_ABAIXO_35 * (1 - taxaNoPrazo / 0.35));
    reasons.push({
      key: "taxa_no_prazo_abaixo_35",
      label: "Taxa de entrega no prazo abaixo de 35%",
      penalty,
    });
  } else if (taxaNoPrazo != null && taxaNoPrazo < 0.5) {
    const penalty = Math.round(
      GUARDRAIL_PENALTY_MAX_TAXA_ABAIXO_50 * (1 - (taxaNoPrazo - 0.35) / 0.15),
    );
    reasons.push({
      key: "taxa_no_prazo_abaixo_50",
      label: "Taxa de entrega no prazo abaixo de 50%",
      penalty,
    });
  }
  if (entrega.prioridadeAltaAtrasoLongoCount > 0) {
    // Desconto escala pela QUANTIDADE de tarefas que dispararam a regra —
    // uma só pesa o mínimo (`BASE`); cada tarefa extra soma mais, com um
    // teto por tarefa pra nunca destruir sozinho um score bom por causa de
    // um único item pontual (o defeito corrigido aqui: antes, 1 tarefa e
    // 10 tarefas nessa condição travavam no MESMO teto fixo de 49).
    const penalty = Math.min(
      GUARDRAIL_PENALTY_PRIORIDADE_ALTA_BASE * entrega.prioridadeAltaAtrasoLongoCount,
      GUARDRAIL_PENALTY_PRIORIDADE_ALTA_MAX_POR_TAREFA,
    );
    reasons.push({
      key: "prioridade_alta_atraso_longo",
      label: `${entrega.prioridadeAltaAtrasoLongoCount} tarefa(s) de prioridade alta atrasada(s) há mais de ${ATRASO_LONGO_DIAS} dias`,
      penalty,
    });
  }
  if (entrega.atualmenteAtrasadas >= GUARDRAIL_ACUMULO_LIMIAR) {
    const excedente = entrega.atualmenteAtrasadas - GUARDRAIL_ACUMULO_LIMIAR;
    const penalty = Math.min(
      GUARDRAIL_PENALTY_ACUMULO_BASE + excedente * GUARDRAIL_PENALTY_ACUMULO_POR_TAREFA_EXTRA,
      GUARDRAIL_PENALTY_ACUMULO_MAX,
    );
    reasons.push({
      key: "acumulo_atrasadas",
      label: `${entrega.atualmenteAtrasadas} tarefas atualmente atrasadas`,
      penalty,
    });
  }
  if (entrega.tarefasElegiveis > 0 && entrega.value === 0) {
    reasons.push({
      key: "entrega_zero",
      label: "Zero pontos na dimensão Entrega",
      penalty: GUARDRAIL_PENALTY_ENTREGA_ZERO,
    });
  }
  return reasons;
}

export type ScoreOperacionalV2 = {
  score: number | null; // inteiro 0-100; null só em `dataState === "sem_dados"`
  dataState: ScoreDataState;
  /** = `entrega.tarefasElegiveis` — "Baseado em N tarefas" na interface. */
  amostra: number;
  entrega: EntregaResult;
  entregaPontos: number | null; // 0-50, exibição (não redistribuído — ver nota em `combineScoreV2`)
  previsibilidade: PrevisibilidadeResult;
  previsibilidadePontos: number | null; // 0-35
  compromissos: CompromissosResult;
  compromissosPontos: number | null; // 0-15; null quando `!compromissosAplicavel`
  /** `false` quando não havia nenhuma reunião esperada no período — a
   * dimensão é "Não aplicável" (não pontua 15 de fábrica, não penaliza,
   * e o Score final é renormalizado só sobre Entrega+Previsibilidade). */
  compromissosAplicavel: boolean;
  classificacao: string | null; // null fora de `dataState === "definitivo"`
  guardrails: GuardrailReason[];
  /** @deprecated use `dataState === "provisorio"` — mantido só pra não
   * quebrar leitura antiga em um único ciclo de revisão de UI. */
  amostraReduzida: boolean;
};

/** Combina os 3 pilares com renormalização de pesos (item explícito do
 * pedido): Entrega (50) e Previsibilidade (35) SEMPRE entram juntas —
 * elas compartilham a mesma base de elegibilidade (`entrega.value` só é
 * `null` quando a base é 0, e nesse caso Previsibilidade também é `null`
 * pela mesma razão), então "ter dado" é uma decisão única, não 2. Já
 * Compromissos só entra quando havia reunião esperada no período
 * (`compromissos.value != null`) — sem isso, a dimensão é excluída do
 * denominador (`pontosPossiveis`) em vez de contar como 0/15, e o
 * resultado é escalado de volta pra 0-100 sobre o que sobrou. Essa
 * renormalização só roda quando já existe o mínimo de dado operacional
 * (Entrega/Previsibilidade não-nulas) — nunca deixa "zero reunião" virar
 * sozinha um bom score (é exatamente o caso "sem_dados" abaixo, que
 * retorna ANTES de qualquer conta). Os pontos por dimensão exibidos
 * (`entregaPontos`/`previsibilidadePontos`/`compromissosPontos`) são só
 * arredondamento simples do valor de CADA dimensão dentro do seu próprio
 * teto (50/35/15) — propositalmente NÃO somam ao `score` final quando
 * Compromissos é inaplicável (score é renormalizado sobre 85, os pontos
 * de dimensão continuam na escala cheia de 100/50/35/15 pra comparação
 * direta entre pessoas) — a ficha explica os dois números separadamente,
 * nunca finge que um é o outro. Depois de combinar, aplica as
 * salvaguardas de coerência (`computeScoreGuardrails`) — nenhum resultado
 * bom nas outras dimensões pode mascarar um problema grave de Entrega. */
export function combineScoreV2(
  entrega: EntregaResult,
  previsibilidade: PrevisibilidadeResult,
  compromissos: CompromissosResult,
): ScoreOperacionalV2 {
  const compromissosAplicavel = compromissos.value != null;

  if (entrega.value == null) {
    return {
      score: null,
      dataState: "sem_dados",
      amostra: 0,
      entrega,
      entregaPontos: null,
      previsibilidade,
      previsibilidadePontos: null,
      compromissos,
      compromissosPontos: null,
      compromissosAplicavel,
      classificacao: null,
      guardrails: [],
      amostraReduzida: false,
    };
  }

  const previsibilidadePontosRaw = previsibilidade.value ?? 0;
  const compromissosPontosRaw = compromissosAplicavel
    ? (compromissos.value! / 100) * COMPROMISSOS_MAX_PONTOS
    : 0;

  const pontosPossiveis =
    ENTREGA_MAX_PONTOS +
    PREVISIBILIDADE_MAX_PONTOS +
    (compromissosAplicavel ? COMPROMISSOS_MAX_PONTOS : 0);
  const pontosObtidos = entrega.value + previsibilidadePontosRaw + compromissosPontosRaw;
  const scoreRenormalizado = clamp((pontosObtidos / pontosPossiveis) * 100, 0, 100);

  const guardrails = computeScoreGuardrails(entrega);
  const penalidadeTotal = Math.min(
    guardrails.reduce((soma, g) => soma + g.penalty, 0),
    GUARDRAIL_PENALTY_MAX_TOTAL,
  );
  const score = clamp(Math.round(scoreRenormalizado) - penalidadeTotal, 0, 100);

  const amostra = entrega.tarefasElegiveis;
  const amostraReduzida = amostra < MIN_TASK_SAMPLE;
  const dataState: ScoreDataState = amostraReduzida ? "provisorio" : "definitivo";

  return {
    score,
    dataState,
    amostra,
    entrega,
    entregaPontos: Math.round(entrega.value),
    previsibilidade,
    previsibilidadePontos: previsibilidade.value != null ? Math.round(previsibilidade.value) : null,
    compromissos,
    compromissosPontos: compromissosAplicavel ? Math.round(compromissosPontosRaw) : null,
    compromissosAplicavel,
    classificacao: dataState === "definitivo" ? classificacaoDoScore(score) : null,
    guardrails,
    amostraReduzida,
  };
}
