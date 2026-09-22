import { parseIsoDateLocal, formatDateToIso } from "@/lib/utils";
import type { DateRange, PerformanceOpenTask } from "@/lib/score";

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

export type OverdueTaskDetail = { daysOverdue: number; highPriority: boolean };

/** Detalhe (dias de atraso + prioridade alta?) de cada tarefa
 * ATUALMENTE atrasada — mantida como utilidade de baixo nível (usada
 * hoje só por `MemberProfileDialog.tsx` pra listar as atrasadas cruas).
 * O motor de score v2 (`computeEntrega`) calcula seu próprio detalhe,
 * mais rico (`CurrentHealthOverdueDetail`), direto sobre
 * `overdueOpenTasks` — não reaproveita esta função porque precisa de
 * campos que ela não carrega (id/título/bloqueio/peso de
 * responsabilidade). Única função
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
// Score Operacional v2 (`OPERATIONAL_SCORE_VERSION`) — REESCRITA COMPLETA
// (2026-09-21). O modelo anterior (guardrails + tetos + penalidade
// absoluta por atraso pontual) ainda produzia resultado injusto num caso
// real de produção: 92 tarefas elegíveis, 91 concluídas no prazo, 0
// atrasadas, só 1 tarefa ATUALMENTE atrasada (≤1 dia, não urgente, sem
// bloqueio) — e o score saía 75/100 ("Bom") quando o registro pedia
// "Excelente" na casa dos 90. A causa raiz não era um parâmetro mal
// calibrado: era a arquitetura inteira (guardrail "taxa abaixo de X%"
// disparando mesmo com só 1 tarefa fora da meta, mais o teto de
// penalidade combinando várias regras ao mesmo tempo). Este modelo troca
// tudo isso por PONTOS FIXOS E SOMÁVEIS (Entregas e prazo 50 + Previsi-
// bilidade 35 + Compromissos 15 = 100), sem teto/zeramento por regra,
// sem penalidade absoluta por uma única pendência, sem peso de
// complexidade de tarefa, sem bônus de cargo/tempo de casa/volume bruto
// e sem avaliação manual — só taxas e proporções sobre a base real de
// atividade da pessoa no período.
// ---------------------------------------------------------------------

/** v1 = a fórmula que existia antes desta constante existir (guardrails +
 * teto + penalidade absoluta, incluindo a correção intermediária de
 * "desconto proporcional" de 2026-09-20 — ambas eram v1 na prática, só
 * esta reescrita completa introduz o conceito de versão). Exibida como
 * rodapé discreto ("Fórmula v2") na composição do score, pra qualquer
 * pessoa revisando um score antigo saber que a régua mudou. */
export const OPERATIONAL_SCORE_VERSION = 2;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Distribui `target` (inteiro) entre `values` (frações reais) por
 * "maior resto": arredonda cada valor pra baixo, depois distribui as
 * unidades que faltam pra fechar `target` pras entradas com a maior
 * parte fracionária descartada — garante que a soma dos números
 * EXIBIDOS bate exatamente com o total exibido, nunca um "quase" (item
 * de arredondamento do pedido: 49+35+15 tem que somar exatamente ao
 * score inteiro exibido, nunca 98 ou 100 por causa de arredondamento
 * independente de cada dimensão). */
function largestRemainderRound(values: number[], target: number): number[] {
  const floors = values.map((v) => Math.floor(Math.max(0, v)));
  const flooredSum = floors.reduce((s, v) => s + v, 0);
  let remainder = Math.round(target) - flooredSum;
  const order = values
    .map((v, i) => ({ i, frac: Math.max(0, v) - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
    result[order[k].i] += 1;
  }
  // `remainder` negativo (target menor que a soma arredondada pra baixo)
  // não deveria acontecer (target sempre >= soma dos floors), mas por
  // segurança nunca deixamos resultado negativo.
  return result.map((v) => Math.max(0, v));
}

/** Prioridades tratadas como "alta" pra fins de agravamento do Score —
 * mesmos valores de `TaskPriority` em `projetos.ts`, replicados aqui (não
 * importados) pra este motor continuar sem depender do shape concreto de
 * `Task` (mesmo espírito do restante do arquivo, ver `Contexto` no topo). */
const HIGH_PRIORITY_VALUES = new Set(["Urgente", "Alta"]);

export function isHighPriority(priority: string | undefined): boolean {
  return !!priority && HIGH_PRIORITY_VALUES.has(priority);
}

export const ENTREGA_MAX_PONTOS = 50;
export const CONCLUSOES_NO_PRAZO_MAX_PONTOS = 40;
export const SAUDE_ATUAL_MAX_PONTOS = 10;
export const PREVISIBILIDADE_MAX_PONTOS = 35;
export const COMPROMISSOS_MAX_PONTOS = 15;

/** Categorias de bloqueio tratadas como DEPENDÊNCIA EXTERNA — uma tarefa
 * atualmente atrasada e bloqueada por uma dessas isenta a penalidade de
 * saúde atual dos prazos (mas continua aparecendo, rotulada, na
 * composição — nunca escondida). Qualquer outra categoria de
 * `TaskBlockCategory` (`projetos.ts`) é bloqueio INTERNO: continua
 * contando pra penalidade normalmente, só rotulado "bloqueada
 * internamente" na composição. */
const EXTERNAL_BLOCK_CATEGORIES = new Set(["aguardando_cliente", "aguardando_fornecedor"]);

/** 4 níveis de confiança amostral — substitui o corte binário antigo
 * (`MIN_TASK_SAMPLE`). Volume de tarefas NUNCA soma pontos ao score (uma
 * pessoa com 92 tarefas 100% no prazo e outra com 12 tarefas 100% no
 * prazo têm a mesma nota) — o nível de confiança só comunica quão sólida
 * é a amostra, pra nunca comparar um score de 8 tarefas com um de 92
 * como se fossem equivalentes. */
export type SampleConfidence = "sem_dados" | "insuficiente" | "baixa" | "media" | "alta";

export const SAMPLE_CONFIDENCE_LABEL: Record<SampleConfidence, string> = {
  sem_dados: "Sem dados",
  insuficiente: "Amostra insuficiente",
  baixa: "Confiança baixa",
  media: "Confiança média",
  alta: "Confiança alta",
};

export function sampleConfidence(periodTaskBase: number): SampleConfidence {
  if (periodTaskBase <= 0) return "sem_dados";
  if (periodTaskBase < 10) return "insuficiente";
  if (periodTaskBase < 20) return "baixa";
  if (periodTaskBase < 40) return "media";
  return "alta";
}

/** Uma tarefa completada no período, pro cálculo de "Conclusões no
 * prazo" — `hasDeadline` é o sinal exato gravado no ledger
 * (`task_completed`'s `data.performanceDueDateUsed !== null`), NUNCA
 * rederivado aqui (ver `TaskBoard.tsx`'s `recordTaskLedgerEventsOnStatusChange`). */
export type EntregaCompletionLike = { outcome: TaskOutcome; hasDeadline: boolean };

/** Uma tarefa ATUALMENTE aberta (qualquer status de `OPEN_STATUSES`) COM
 * prazo definido — o universo que alimenta "Saúde atual dos prazos"
 * (10 pontos). Inclui tanto as ainda dentro do prazo quanto as vencidas
 * (a função separa as duas internamente via `overdueOpenTasks`, mantido
 * intocado). `penaltyWeight` (0 a 1) vem de `score.ts`'s
 * `loadOpenTasksByMemberId` — 1 se esta pessoa é a responsável principal
 * da tarefa (ou não há principal definido e ela é a única/parte
 * proporcional dos colaboradores), 0 se há um principal definido e é
 * outra pessoa (correção de bug: antes, um colaborador secundário levava
 * a MESMA penalidade cheia que o responsável principal por uma tarefa
 * atrasada). `blockedState` alimenta a isenção/rotulagem de dependência
 * externa vs. bloqueio interno. */
export type OpenTaskForHealth = PerformanceTaskLike & {
  id?: string;
  title?: string;
  priority?: string;
  penaltyWeight?: number;
  blockedState?: { category: string } | null;
};

export type CurrentHealthOverdueDetail = {
  id?: string;
  title?: string;
  daysOverdue: number;
  highPriority: boolean;
  /** Peso de severidade (1 a 1.75) ANTES do `penaltyWeight` de
   * responsabilidade — ver regra de dias/prioridade abaixo. */
  severityWeight: number;
  /** Fração de responsabilidade desta pessoa por esta tarefa (0 a 1). */
  penaltyWeight: number;
  /** `severityWeight * penaltyWeight`, ou 0 se `externallyBlocked`. É o
   * que de fato soma em `weightedCurrentOverdue`. */
  weightedContribution: number;
  /** Bloqueio ativo por dependência externa (`aguardando_cliente`/
   * `aguardando_fornecedor`) — EXCLUÍDA da penalidade, mas listada aqui
   * (nunca escondida silenciosamente). */
  externallyBlocked: boolean;
  /** Bloqueio ativo por qualquer outra categoria — continua penalizando
   * normalmente, só rotulada "bloqueada internamente" na composição. */
  internallyBlocked: boolean;
};

/** "Saúde atual dos prazos" (10 dos 50 pontos de Entregas e prazo) —
 * pega o backlog aberto com prazo (`openTasksWithDeadlineNow`, já
 * filtrado pelo chamador pra só tarefas com `dueDate`/`performanceDueDate`)
 * e calcula o peso ponderado das ATUALMENTE atrasadas (`overdueOpenTasks`,
 * mantida intocada). Retorna as peças cruas — `computeEntrega` combina
 * com a base de conclusões pra achar `periodTaskBase` e os pontos finais,
 * porque "saúde atual" sozinha não sabe quantas tarefas foram concluídas
 * no período (as duas juntas formam o denominador da taxa, ver
 * `periodTaskBase` no pedido). */
function computeSaudeAtualParts(
  openTasksWithDeadlineNow: OpenTaskForHealth[],
  now: Date,
  cutoffHour: number,
): {
  base: number;
  overdueCount: number;
  weightedOverdue: number;
  details: CurrentHealthOverdueDetail[];
} {
  const base = openTasksWithDeadlineNow.length;
  const overdue = overdueOpenTasks(openTasksWithDeadlineNow, now, cutoffHour);
  let weightedOverdue = 0;
  const details: CurrentHealthOverdueDetail[] = overdue.map((t) => {
    const ref = (t.performanceDueDate ?? t.dueDate)!;
    const daysOverdue = Math.max(
      1,
      Math.ceil(
        (now.getTime() - deadlineCutoff(ref, cutoffHour).getTime()) / (24 * 60 * 60 * 1000),
      ),
    );
    const highPriority = isHighPriority(t.priority);
    let severityWeight = daysOverdue <= 1 ? 1 : daysOverdue <= 5 ? 1.25 : 1.5;
    if (highPriority) severityWeight = Math.min(1.75, severityWeight + 0.25);
    const category = t.blockedState?.category;
    const externallyBlocked = !!category && EXTERNAL_BLOCK_CATEGORIES.has(category);
    const internallyBlocked = !!category && !externallyBlocked;
    const penaltyWeight = t.penaltyWeight ?? 1;
    const weightedContribution = externallyBlocked ? 0 : severityWeight * penaltyWeight;
    weightedOverdue += weightedContribution;
    return {
      id: t.id,
      title: t.title,
      daysOverdue,
      highPriority,
      severityWeight,
      penaltyWeight,
      weightedContribution,
      externallyBlocked,
      internallyBlocked,
    };
  });
  return { base, overdueCount: overdue.length, weightedOverdue, details };
}

export type EntregaResult = {
  /** Pontos 0-50 (Entregas e prazo). `null` só quando NENHUMA das duas
   * subpartes tem dado (nenhuma conclusão com prazo no período E nenhuma
   * tarefa aberta com prazo) — ausência de dado nunca vira pontuação,
   * positiva ou negativa. */
  value: number | null;
  /** Subparte 1 — "Conclusões no prazo" (0-40). `null` quando não houve
   * NENHUMA conclusão com prazo no período (tarefas "Sem prazo" não
   * contam pra essa subparte nem pra cima nem pra baixo). */
  onTimePoints: number | null;
  /** Subparte 2 — "Saúde atual dos prazos" (0-10). `null` só quando
   * `periodTaskBase === 0`. */
  healthPoints: number | null;
  completedTasksWithDeadline: number;
  completedOnTime: number;
  completedLate: number;
  /** Tarefas concluídas no período SEM prazo — excluídas da taxa,
   * mostradas separadamente (nunca contam a favor nem contra). */
  semPrazoCount: number;
  onTimeRate: number | null;
  openTasksWithDeadlineInPeriod: number;
  /** `completedTasksWithDeadline + openTasksWithDeadlineInPeriod` —
   * "Baseado em N tarefas" da interface, e a base de elegibilidade
   * compartilhada com Previsibilidade. */
  periodTaskBase: number;
  overdueCount: number;
  weightedCurrentOverdue: number;
  currentHealthRate: number | null;
  overdueDetails: CurrentHealthOverdueDetail[];
  /** @deprecated alias de `completedTasksWithDeadline + completedLate +
   * completedOnTime + semPrazoCount` (todas as conclusões do período,
   * com ou sem prazo) — mantido só pra telas que ainda leem esse nome. */
  concluidas: number;
  /** @deprecated alias de `completedOnTime`. */
  noPrazo: number;
  /** @deprecated alias de `completedLate`. */
  comAtraso: number;
  /** @deprecated alias de `overdueCount`. */
  atualmenteAtrasadas: number;
  /** @deprecated alias de `periodTaskBase`. */
  tarefasElegiveis: number;
  /** @deprecated use `sampleConfidence(periodTaskBase) === "insuficiente"`. */
  amostraReduzida: boolean;
};

/**
 * "Entregas e prazo" (50 pontos) — duas subpartes independentes,
 * redistribuídas entre si quando uma não tem dado (mesmo princípio do
 * redistribuição entre as 3 dimensões do score inteiro, só que em escala
 * menor: nunca "zera" uma subparte sem dado, realoca o peso pra que
 * ainda houver):
 *
 * 1. Conclusões no prazo (até 40 pts) = taxa de conclusões no prazo entre
 *    as que TINHAM prazo (tarefas "Sem prazo" ficam de fora da conta,
 *    mostradas à parte).
 * 2. Saúde atual dos prazos (até 10 pts) = 1 menos a fração PONDERADA de
 *    tarefas atualmente atrasadas sobre TODO o backlog aberto com prazo
 *    (não só as atrasadas) — por isso uma pessoa com 92 tarefas na base e
 *    só 1 atrasada leve perde uma fração mínima dos 10 pontos (o caso
 *    real corrigido: antes, qualquer atraso citava uma regra de "taxa
 *    abaixo de X%" e um teto fixo; agora o peso de uma única tarefa
 *    pequena se dilui no denominador inteiro).
 *
 * `openTasksWithDeadlineNow` é sempre o estado ATUAL (não filtrado por
 * período) — mesma convenção de `overdueOpenTasks`/`overdueTaskDetails`
 * (mantidas intocadas) usada aqui por baixo.
 */
export function computeEntrega(
  completions: EntregaCompletionLike[],
  openTasksWithDeadlineNow: OpenTaskForHealth[],
  now: Date = new Date(),
  cutoffHour: number = DEADLINE_CUTOFF_HOUR,
): EntregaResult {
  const withDeadline = completions.filter((c) => c.hasDeadline);
  const completedTasksWithDeadline = withDeadline.length;
  const completedOnTime = withDeadline.filter(
    (c) => c.outcome === "on_time" || c.outcome === "early",
  ).length;
  const completedLate = withDeadline.filter((c) => c.outcome === "late").length;
  const semPrazoCount = completions.length - completedTasksWithDeadline;
  const onTimeRate =
    completedTasksWithDeadline > 0 ? completedOnTime / completedTasksWithDeadline : null;
  const onTimePoints = onTimeRate != null ? onTimeRate * CONCLUSOES_NO_PRAZO_MAX_PONTOS : null;

  const saude = computeSaudeAtualParts(openTasksWithDeadlineNow, now, cutoffHour);
  const openTasksWithDeadlineInPeriod = saude.base;
  const periodTaskBase = completedTasksWithDeadline + openTasksWithDeadlineInPeriod;
  const currentHealthRate =
    periodTaskBase > 0 ? clamp(1 - saude.weightedOverdue / periodTaskBase, 0, 1) : null;
  const healthPoints =
    currentHealthRate != null ? currentHealthRate * SAUDE_ATUAL_MAX_PONTOS : null;

  const availableSubWeight =
    (onTimePoints != null ? CONCLUSOES_NO_PRAZO_MAX_PONTOS : 0) +
    (healthPoints != null ? SAUDE_ATUAL_MAX_PONTOS : 0);
  const value =
    availableSubWeight === 0
      ? null
      : clamp(
          ((onTimePoints ?? 0) + (healthPoints ?? 0)) * (ENTREGA_MAX_PONTOS / availableSubWeight),
          0,
          ENTREGA_MAX_PONTOS,
        );

  return {
    value,
    onTimePoints,
    healthPoints,
    completedTasksWithDeadline,
    completedOnTime,
    completedLate,
    semPrazoCount,
    onTimeRate,
    openTasksWithDeadlineInPeriod,
    periodTaskBase,
    overdueCount: saude.overdueCount,
    weightedCurrentOverdue: saude.weightedOverdue,
    currentHealthRate,
    overdueDetails: saude.details,
    concluidas: completions.length,
    noPrazo: completedOnTime,
    comAtraso: completedLate,
    atualmenteAtrasadas: saude.overdueCount,
    tarefasElegiveis: periodTaskBase,
    amostraReduzida: sampleConfidence(periodTaskBase) === "insuficiente",
  };
}

export type ReplanTiming = "antecipado" | "proximo" | "no_dia" | "apos_vencimento";

export const REPLAN_TIMING_LABEL: Record<ReplanTiming, string> = {
  antecipado: "Antecipado",
  proximo: "Próximo do prazo",
  no_dia: "No dia",
  apos_vencimento: "Após vencimento",
};

/** Classifica UMA alteração de prazo pela distância entre o momento da
 * mudança e o prazo ANTERIOR (`from`) — mais de 2 dias completos antes =
 * antecipado (nenhuma penalidade); 1-2 dias antes = próximo do prazo
 * (ainda "antecipado" pro novo modelo — ver `computePrevisibilidade`);
 * mesmo dia = "no dia"; depois de já vencida = "após vencimento". Usa a
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

/** Evento de alteração de prazo, do jeito que o ledger grava —
 * `exemptFromResponsibility` é o valor JÁ CONGELADO no evento no momento
 * do registro (`TaskBoard.tsx`'s `data.exemptFromResponsibility`, vindo
 * de `DEADLINE_CHANGE_MOTIVO_EXEMPTS_BY_DEFAULT`/isenção manual). Uma
 * correção de Admin feita DEPOIS (via `adminOverride` no histórico da
 * própria tarefa) não reescreve eventos antigos do ledger — mesma regra
 * já documentada em `effectivePerformanceDueDate`/`isCriticalReplan`:
 * isenção registrada só depois do prazo já vencido não remove a
 * penalidade retroativamente. */
export type PrevisibilidadeReplanEventLike = {
  taskId: string | null;
  from?: string;
  occurredAt: string;
  exemptFromResponsibility?: boolean;
};

export type PrevisibilidadeResult = {
  /** Pontos 0-35; `null` só quando `periodTaskBase === 0` (mesma base de
   * `EntregaResult`, nunca calculado isoladamente). */
  value: number | null;
  sameDayReplans: number;
  lateReplans: number;
  earlyReplans: number;
  /** Alterações extras (além da 1ª) na MESMA tarefa, contadas só entre as
   * não-isentas de "no dia"/"após vencimento" — a 1ª alteração antecipada
   * de uma tarefa nunca conta como "strike" de recorrência. */
  repeatedProblematicReplans: number;
  /** Quantas alterações críticas (no dia/após vencimento) foram isentas
   * por dependência externa registrada A TEMPO (antes do prazo vencer). */
  exemptedCount: number;
  eligibleTaskBase: number;
  predictabilityLoss: number;
  /** Contagem de EVENTOS (não tarefas) por classificação — inclui as 4
   * categorias originais de `classifyReplanTiming` (não as 3 do novo
   * modelo) pra não perder granularidade na composição exibida. */
  porTiming: Record<ReplanTiming, number>;
  /** @deprecated alias de `sameDayReplans + lateReplans + earlyReplans`
   * contadas por TAREFA única (não por evento) — mantido só pra telas
   * que ainda leem esse nome. */
  tarefasReplanejadas: number;
  /** @deprecated alias de `eligibleTaskBase`. */
  tarefasElegiveis: number;
  /** @deprecated alias de `tarefasReplanejadas / periodTaskBase`. */
  taxaReplanejamento: number | null;
  /** @deprecated use `sampleConfidence`. */
  amostraReduzida: boolean;
};

/**
 * Previsibilidade (35 pontos) — parte de 35 e desconta proporcionalmente
 * por classificação de severidade (antecipado = 0, no dia = leve, após
 * vencimento = pesado), mais um pequeno desconto adicional por
 * alterações REPETIDAS (no dia/após vencimento) na MESMA tarefa. Uma
 * dependência externa registrada a tempo (`exemptFromResponsibility`, no
 * evento já congelado) some do numerador — mas nunca reescreve uma
 * isenção tardia (ver comentário de `PrevisibilidadeReplanEventLike`).
 * `periodTaskBase` é SEMPRE a mesma base de `EntregaResult.periodTaskBase`
 * do mesmo período — as duas dimensões só concordam sobre "há dado
 * suficiente" olhando pro mesmo número. */
export function computePrevisibilidade(
  deadlineChanges: PrevisibilidadeReplanEventLike[],
  periodTaskBase: number,
  cutoffHour: number = DEADLINE_CUTOFF_HOUR,
): PrevisibilidadeResult {
  const porTiming: Record<ReplanTiming, number> = {
    antecipado: 0,
    proximo: 0,
    no_dia: 0,
    apos_vencimento: 0,
  };
  const porTarefaTiming = new Map<string, ReplanTiming[]>();
  const strikesPorTarefa = new Map<string, number>();
  let sameDayReplans = 0;
  let lateReplans = 0;
  let earlyReplans = 0;
  let exemptedCount = 0;

  for (const d of deadlineChanges) {
    if (!d.taskId || !d.from) continue;
    const timing = classifyReplanTiming(d.from, d.occurredAt, cutoffHour);
    porTiming[timing] += 1;
    const arr = porTarefaTiming.get(d.taskId) ?? [];
    arr.push(timing);
    porTarefaTiming.set(d.taskId, arr);

    if (timing === "antecipado" || timing === "proximo") {
      earlyReplans += 1;
      continue;
    }
    const exempted = !!d.exemptFromResponsibility;
    if (exempted) {
      exemptedCount += 1;
      continue;
    }
    if (timing === "no_dia") sameDayReplans += 1;
    else lateReplans += 1;
    strikesPorTarefa.set(d.taskId, (strikesPorTarefa.get(d.taskId) ?? 0) + 1);
  }

  let repeatedProblematicReplans = 0;
  for (const count of strikesPorTarefa.values()) {
    if (count > 1) repeatedProblematicReplans += count - 1;
  }

  const tarefasReplanejadas = porTarefaTiming.size;

  if (periodTaskBase === 0) {
    return {
      value: null,
      sameDayReplans,
      lateReplans,
      earlyReplans,
      repeatedProblematicReplans,
      exemptedCount,
      eligibleTaskBase: 0,
      predictabilityLoss: 0,
      porTiming,
      tarefasReplanejadas,
      tarefasElegiveis: 0,
      taxaReplanejamento: null,
      amostraReduzida: false,
    };
  }

  const eligibleTaskBase = Math.max(periodTaskBase, 1);
  const sameDayRate = clamp(sameDayReplans / eligibleTaskBase, 0, 1);
  const lateReplanRate = clamp(lateReplans / eligibleTaskBase, 0, 1);
  const repeatedReplanRate = clamp(repeatedProblematicReplans / eligibleTaskBase, 0, 1);
  const predictabilityLoss = Math.min(
    PREVISIBILIDADE_MAX_PONTOS,
    sameDayRate * 5 + lateReplanRate * 20 + repeatedReplanRate * 10,
  );
  const value = PREVISIBILIDADE_MAX_PONTOS - predictabilityLoss;

  return {
    value,
    sameDayReplans,
    lateReplans,
    earlyReplans,
    repeatedProblematicReplans,
    exemptedCount,
    eligibleTaskBase,
    predictabilityLoss,
    porTiming,
    tarefasReplanejadas,
    tarefasElegiveis: periodTaskBase,
    taxaReplanejamento: periodTaskBase > 0 ? tarefasReplanejadas / periodTaskBase : null,
    amostraReduzida: sampleConfidence(periodTaskBase) === "insuficiente",
  };
}

/** Classificação final — 5 faixas (a antiga tinha 4: 90/75/60/0). "Bom"
 * (70-79) usa um tom NEUTRO-POSITIVO, nunca vermelho — é a diferença
 * chave desta reescrita: um "quase excelente" não pode parecer um
 * "crítico" na paleta de cores. */
const SCORE_CLASSIFICACAO: { min: number; label: string }[] = [
  { min: 90, label: "Excelente" },
  { min: 80, label: "Muito bom" },
  { min: 70, label: "Bom" },
  { min: 60, label: "Atenção" },
  { min: 0, label: "Crítico" },
];

export function classificacaoDoScore(score: number): string {
  return SCORE_CLASSIFICACAO.find((c) => score >= c.min)!.label;
}

/** Tom (classe Tailwind) por classificação — "Excelente" verde, "Muito
 * bom" o token de marca do app (`--brand`), "Bom" um neutro-positivo
 * (nunca vermelho), "Atenção" âmbar, "Crítico" vermelho, "Sem avaliação"
 * cinza (amostra zero/insuficiente, sem classificação definitiva ainda). */
export const SCORE_CLASSIFICACAO_TONE: Record<string, string> = {
  Excelente: "text-emerald-600 dark:text-emerald-400",
  "Muito bom": "text-brand",
  Bom: "text-foreground",
  Atenção: "text-amber-600 dark:text-amber-400",
  Crítico: "text-destructive",
  "Sem avaliação": "text-text-secondary",
};

/** Estado de disponibilidade de dado do Score — controla o que a
 * interface pode mostrar (nunca um número OU classificação quando não
 * há base pra isso):
 * - `sem_dados`: NENHUMA das 3 dimensões tem dado (nem tarefa concluída
 *   com prazo, nem tarefa aberta com prazo, nem reunião esperada) — não
 *   existe score (nem 0, nem 100 "de fábrica"). Mostra "Sem dados
 *   suficientes", nunca um número.
 * - `provisorio`: há score calculado, mas a confiança amostral
 *   (`sampleConfidence`) é "sem_dados" ou "insuficiente" (0 a 9 tarefas
 *   na base do período) — mostrado com o valor calculado, marcado
 *   "Provisório", excluído de rankings/comparações, sem classificação
 *   definitiva (Excelente/Muito bom/Bom/Atenção/Crítico não se aplicam
 *   ainda).
 * - `definitivo`: 10+ tarefas na base do período — score e classificação
 *   definitivos (o rótulo de confiança — baixa/média/alta — continua
 *   sendo mostrado à parte, volume nunca soma ponto). */
export type ScoreDataState = "sem_dados" | "provisorio" | "definitivo";

export type ScoreOperacionalV2 = {
  /** Inteiro 0-100; `null` só em `dataState === "sem_dados"`. */
  score: number | null;
  dataState: ScoreDataState;
  /** = `entrega.periodTaskBase` — "Baseado em N tarefas" na interface. */
  amostra: number;
  confidence: SampleConfidence;
  entrega: EntregaResult;
  /** 0-50, exibição — arredondado por "maior resto" junto com as outras
   * 2 dimensões quando as 3 estão aplicáveis, pra sempre somar
   * exatamente ao `score` inteiro exibido (ver `largestRemainderRound`). */
  entregaPontos: number | null;
  previsibilidade: PrevisibilidadeResult;
  previsibilidadePontos: number | null; // 0-35
  compromissos: CompromissosResult;
  compromissosPontos: number | null; // 0-15; null quando `!compromissosAplicavel`
  /** `false` quando não havia nenhuma reunião esperada no período — a
   * dimensão é "Não aplicável" (não pontua 15 de fábrica, não penaliza,
   * e o peso dela é redistribuído entre as dimensões com dado). */
  compromissosAplicavel: boolean;
  classificacao: string | null; // null fora de `dataState === "definitivo"`
  /** Fórmula usada nesta versão (`OPERATIONAL_SCORE_VERSION`) — exposta
   * pra "Ver composição do score" mostrar "Fórmula v2". */
  version: number;
  /** @deprecated modelo de guardrails removido nesta reescrita (não há
   * mais penalidade fora das 3 dimensões somáveis) — sempre `[]`, mantido
   * só pra não quebrar leitura antiga em um único ciclo de revisão de UI. */
  guardrails: never[];
  /** @deprecated use `confidence === "insuficiente"` ou `dataState`. */
  amostraReduzida: boolean;
};

const SEM_DADOS_RESULT_BASE = {
  score: null,
  dataState: "sem_dados" as ScoreDataState,
  amostra: 0,
  confidence: "sem_dados" as SampleConfidence,
  classificacao: null,
  version: OPERATIONAL_SCORE_VERSION,
  guardrails: [] as never[],
  amostraReduzida: false,
};

/**
 * Combina as 3 dimensões (Entregas e prazo 50 + Previsibilidade 35 +
 * Compromissos 15 = 100 pontos) com REDISTRIBUIÇÃO DE PESO (nunca
 * silenciosamente zera uma dimensão sem dado): uma dimensão sem dado no
 * período é excluída do denominador (`availableWeight`), e o score final
 * é escalado de volta pra 0-100 sobre o que sobrou. Só existe "Sem dados
 * suficientes" quando LITERALMENTE NENHUMA das 3 tem dado — com qualquer
 * uma tendo dado, sempre existe um score real (mesmo que "Provisório").
 * Nenhuma regra aqui zera uma dimensão inteira, aplica penalidade
 * absoluta por 1 evento isolado, pesa complexidade de tarefa, dá bônus
 * de cargo/tempo de casa/volume, nem existe avaliação manual — só as 3
 * taxas somadas.
 */
export function combineScoreV2(
  entrega: EntregaResult,
  previsibilidade: PrevisibilidadeResult,
  compromissos: CompromissosResult,
): ScoreOperacionalV2 {
  const compromissosAplicavel = compromissos.value != null;

  const dims: { points: number; weight: number }[] = [];
  if (entrega.value != null) dims.push({ points: entrega.value, weight: ENTREGA_MAX_PONTOS });
  if (previsibilidade.value != null) {
    dims.push({ points: previsibilidade.value, weight: PREVISIBILIDADE_MAX_PONTOS });
  }
  const compromissosPontosRaw = compromissosAplicavel
    ? (compromissos.value! / 100) * COMPROMISSOS_MAX_PONTOS
    : 0;
  if (compromissosAplicavel) {
    dims.push({ points: compromissosPontosRaw, weight: COMPROMISSOS_MAX_PONTOS });
  }

  if (dims.length === 0) {
    return {
      ...SEM_DADOS_RESULT_BASE,
      entrega,
      entregaPontos: null,
      previsibilidade,
      previsibilidadePontos: null,
      compromissos,
      compromissosPontos: null,
      compromissosAplicavel,
    };
  }

  const availableWeight = dims.reduce((s, d) => s + d.weight, 0);
  const pontosObtidos = dims.reduce((s, d) => s + d.points, 0);
  const scoreExact = clamp((pontosObtidos / availableWeight) * 100, 0, 100);
  const score = Math.round(scoreExact);

  const amostra = entrega.periodTaskBase;
  const confidence = sampleConfidence(amostra);
  const dataState: ScoreDataState =
    confidence === "sem_dados" || confidence === "insuficiente" ? "provisorio" : "definitivo";

  // Quando as 3 dimensões estão aplicáveis (nenhuma redistribuição), os 3
  // pontos exibidos são arredondados por "maior resto" pra somar
  // EXATAMENTE ao `score` inteiro — ver `largestRemainderRound`. Quando
  // alguma dimensão está ausente, cada ponto exibido é só o
  // arredondamento simples do valor daquela dimensão na sua própria
  // escala nativa (a ficha explica os dois números separadamente, nunca
  // finge que um é o outro — mesma filosofia da versão anterior).
  let entregaPontos: number | null = entrega.value != null ? Math.round(entrega.value) : null;
  let previsibilidadePontos: number | null =
    previsibilidade.value != null ? Math.round(previsibilidade.value) : null;
  let compromissosPontos: number | null = compromissosAplicavel
    ? Math.round(compromissosPontosRaw)
    : null;

  if (entrega.value != null && previsibilidade.value != null && compromissosAplicavel) {
    const [e, p, c] = largestRemainderRound(
      [entrega.value, previsibilidade.value, compromissosPontosRaw],
      score,
    );
    entregaPontos = e;
    previsibilidadePontos = p;
    compromissosPontos = c;
  }

  return {
    score,
    dataState,
    amostra,
    confidence,
    entrega,
    entregaPontos,
    previsibilidade,
    previsibilidadePontos,
    compromissos,
    compromissosPontos,
    compromissosAplicavel,
    classificacao: dataState === "definitivo" ? classificacaoDoScore(score) : null,
    version: OPERATIONAL_SCORE_VERSION,
    guardrails: [],
    amostraReduzida: confidence === "insuficiente",
  };
}

// ---------------------------------------------------------------------
// Ponto único de montagem do Score v2 a partir do ledger cru — extraído
// pra evitar reimplementar a mesma transformação evento->input em 3
// call-sites (`TimeSection.tsx`'s lista + `MemberProfileDialog.tsx`'s
// período atual/anterior), o que já tinha causado divergência sutil
// entre eles na versão anterior deste arquivo.
// ---------------------------------------------------------------------

/** Constrói o Score Operacional v2 de UMA pessoa a partir dos eventos do
 * ledger já filtrados pro período/pessoa (`usePerformanceEvents`) e do
 * backlog aberto ATUAL dela (`score.ts`'s `loadOpenTasksByMemberId`,
 * SEMPRE estado ao vivo, nunca filtrado por período). Único lugar que
 * sabe extrair `hasDeadline`/`exemptFromResponsibility` do shape cru do
 * evento — qualquer tela que precise do score de alguém deve chamar
 * esta função, nunca remontar os inputs de `computeEntrega`/
 * `computePrevisibilidade` na mão. */
export function computeMemberScoreV2(
  personEvents: PerformanceEventLike[],
  openTasksNow: PerformanceOpenTask[],
  cutoffHour: number = DEADLINE_CUTOFF_HOUR,
  now: Date = new Date(),
): ScoreOperacionalV2 {
  const completions: EntregaCompletionLike[] = personEvents
    .filter((e) => e.eventType === "task_completed")
    .map((e) => ({
      outcome: e.data.outcome as TaskOutcome,
      hasDeadline: e.data.performanceDueDateUsed != null,
    }));
  const deadlineChanges: PrevisibilidadeReplanEventLike[] = personEvents
    .filter((e) => e.eventType === "task_deadline_changed")
    .map((e) => ({
      taskId: e.taskId,
      from: (e.data.from as string) ?? undefined,
      occurredAt: e.occurredAt,
      exemptFromResponsibility: !!e.data.exemptFromResponsibility,
    }));
  const attendance = dedupAttendanceEvents(
    personEvents.filter((e) => e.eventType === "meeting_attendance_recorded"),
  ).map((e) => ({ attended: !!e.data.attended }));

  const openTasksWithDeadline: OpenTaskForHealth[] = openTasksNow.filter(
    (t) => !!(t.performanceDueDate ?? t.dueDate),
  );

  const entrega = computeEntrega(completions, openTasksWithDeadline, now, cutoffHour);
  const previsibilidade = computePrevisibilidade(
    deadlineChanges,
    entrega.periodTaskBase,
    cutoffHour,
  );
  const compromissos = computeCompromissos(attendance);
  return combineScoreV2(entrega, previsibilidade, compromissos);
}
