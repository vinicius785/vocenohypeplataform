import type { Project, Task } from "./projetos";
import { getTaskAssignees, ACTIVITY_STATUS_COMPLETED_ACTION } from "./projetos";
import type { Meeting } from "./reunioes-store";
import type { ChatMember } from "./chat-store";
import { todayISO } from "./financeiro-entries";
import { parseIsoDateLocal, formatDateToIso } from "./utils";
import { startOfWeekIsoBrasilia } from "./timezone";

/**
 * Score do time (aba Gestão) — pontuação derivada inteiramente de dados que
 * já existem (tarefas de projetos + reuniões), sem tabela nova. Os critérios
 * abaixo são a definição "oficial" da pontuação; mudar pontos/adicionar
 * critérios é só editar esta lista.
 *
 * Deliberadamente NÃO pontua horas rastreadas pelo timer — isso incentivaria
 * deixar o timer ligado à toa. Horas viram só uma métrica informativa.
 */
export type ScoreRuleKey =
  | "task_on_time"
  | "task_late_done"
  | "task_overdue_open"
  | "meeting_attended"
  | "meeting_missed";

export type ScoreRule = { key: ScoreRuleKey; label: string; points: number };

export const SCORE_RULES: ScoreRule[] = [
  { key: "task_on_time", label: "Tarefa entregue no prazo", points: 15 },
  { key: "task_late_done", label: "Tarefa entregue atrasada", points: 5 },
  { key: "task_overdue_open", label: "Tarefa atrasada (aberta, prazo vencido)", points: -10 },
  { key: "meeting_attended", label: "Participação em reunião", points: 5 },
  { key: "meeting_missed", label: "Reunião perdida (convidado, mas não participou)", points: -5 },
];

export const OPEN_STATUSES = new Set([
  "Aberto",
  "Em andamento",
  "Em aprovação",
  "Em ajustes",
  "Aprovado",
]);

export type DateRange = { from?: string; to?: string };

function inRange(date: string | null | undefined, range?: DateRange): boolean {
  if (!date) return false;
  if (range?.from && date < range.from) return false;
  if (range?.to && date > range.to) return false;
  return true;
}

export type MemberScore = {
  member: ChatMember;
  score: number;
  tasksOnTime: number;
  tasksLate: number;
  tasksOverdue: number;
  /** Tarefas abertas neste momento (não é filtrado pelo `range` — é sempre
   * o estado atual, diferente de tasksOnTime/tasksLate/tasksOverdue que
   * refletem o período selecionado). */
  openTasks: number;
  meetingsAttended: number;
  meetingsMissed: number;
  hoursTracked: number;
  /** Média de dias de atraso (positivo) ou antecedência (negativo) nas
   * tarefas concluídas dentro do `range` que tinham prazo definido.
   * `null` quando não há nenhuma tarefa concluída com prazo pra calcular. */
  avgDelayDays: number | null;
  breakdown: (ScoreRule & { count: number; total: number })[];
};

type MemberScoreAcc = MemberScore & { delaySumDays: number; delayCount: number };

function toLocalDateISO(iso: string): string {
  // Mesmo cuidado de `todayISO()`: pegar a data em UTC (slice direto do ISO)
  // faz uma conclusão feita à noite no Brasil (UTC-3) contar como o dia
  // seguinte, marcando entregas no prazo como atrasadas por engano.
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function taskCompletionDate(t: Task): string | null {
  const entries = (t.activity ?? []).filter((a) => a.action === ACTIVITY_STATUS_COMPLETED_ACTION);
  if (entries.length === 0) return null;
  return toLocalDateISO(entries[entries.length - 1].createdAt);
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(`${toISO}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function taskHours(t: Task): number {
  const own = (t.timeEntries ?? []).reduce((s, e) => s + e.seconds, 0);
  const sub = (t.subtasks ?? []).reduce((s, st) => s + taskHours(st) * 3600, 0);
  return (own + sub) / 3600;
}

function flatten(tasks: Task[]): Task[] {
  return tasks.flatMap((t) => [t, ...flatten(t.subtasks ?? [])]);
}

/** Grupo genérico de tarefas com dono (projeto OU campanha) — deixa
 * `computeMemberScores`/`collectTaskItems` tratar os dois tipos de tarefa
 * igual, sem duplicar a lógica de pontuação para cada origem. */
export type TaskGroup = { id: string; name: string; tasks: Task[] };

function projetosAsGroups(projetos: Project[]): TaskGroup[] {
  return projetos.map((p) => ({ id: p.id, name: p.name, tasks: p.tasks ?? [] }));
}

export type PerformanceOpenTask = {
  id: string;
  title: string;
  status: string;
  dueDate?: string;
  performanceDueDate?: string;
};

/** Tarefas ATUALMENTE abertas de cada pessoa (status ∈ `OPEN_STATUSES`),
 * com os campos crus que a Pendências do Score Operacional precisa
 * (`dueDate`/`performanceDueDate`, pra aplicar o corte de 19h) — não dá
 * pra reaproveitar `DashTask` (`task-aggregation.ts`) porque lá `due` já
 * vem formatado como texto ("Hoje"/"Atrasada 2d"), sem a data crua.
 * `id`/`title` viajam junto pra permitir drill-down ("quais tarefas são
 * essas 2 atrasadas?") sem precisar de uma segunda consulta. Mesma
 * travessia de `computeMemberScores`, só devolvendo os objetos em vez de
 * somar pontos. */
export function loadOpenTasksByMemberId(
  projetos: Project[],
  members: ChatMember[],
  campanhaGroups: TaskGroup[] = [],
): Map<string, PerformanceOpenTask[]> {
  const byId = new Map<string, PerformanceOpenTask[]>();
  const byName = new Map(members.map((m) => [m.name, m]));
  for (const p of [...projetosAsGroups(projetos), ...campanhaGroups]) {
    for (const t of flatten(p.tasks ?? [])) {
      if (!OPEN_STATUSES.has(t.status)) continue;
      for (const name of getTaskAssignees(t)) {
        const member = byName.get(name);
        if (!member) continue;
        const arr = byId.get(member.id) ?? [];
        arr.push({
          id: t.id,
          title: t.title,
          status: t.status,
          dueDate: t.dueDate,
          performanceDueDate: t.performanceDueDate,
        });
        byId.set(member.id, arr);
      }
    }
  }
  return byId;
}

export function computeMemberScores(
  projetos: Project[],
  meetings: Meeting[],
  members: ChatMember[],
  range?: DateRange,
  campanhaGroups: TaskGroup[] = [],
): MemberScore[] {
  const today = todayISO();
  const byId = new Map<string, MemberScoreAcc>();
  const byName = new Map(members.map((m) => [m.name, m]));

  const ensure = (member: ChatMember): MemberScoreAcc => {
    const existing = byId.get(member.id);
    if (existing) return existing;
    const created: MemberScoreAcc = {
      member,
      score: 0,
      tasksOnTime: 0,
      tasksLate: 0,
      tasksOverdue: 0,
      openTasks: 0,
      meetingsAttended: 0,
      meetingsMissed: 0,
      hoursTracked: 0,
      avgDelayDays: null,
      delaySumDays: 0,
      delayCount: 0,
      breakdown: SCORE_RULES.map((r) => ({ ...r, count: 0, total: 0 })),
    };
    byId.set(member.id, created);
    return created;
  };

  const add = (stat: MemberScore, key: ScoreRuleKey) => {
    const rule = SCORE_RULES.find((r) => r.key === key)!;
    stat.score += rule.points;
    const b = stat.breakdown.find((b) => b.key === key)!;
    b.count += 1;
    b.total += rule.points;
  };

  for (const m of members) ensure(m);

  for (const p of [...projetosAsGroups(projetos), ...campanhaGroups]) {
    for (const t of flatten(p.tasks ?? [])) {
      // Cada responsável ganha a pontuação cheia (não dividida entre eles).
      for (const name of getTaskAssignees(t)) {
        const member = byName.get(name);
        if (!member) continue;
        const stat = ensure(member);
        stat.hoursTracked += taskHours(t);
        if (OPEN_STATUSES.has(t.status)) stat.openTasks += 1;
        if (t.status === "Concluído") {
          const completedAt = taskCompletionDate(t);
          if (!inRange(completedAt, range)) continue;
          if (t.dueDate && completedAt) {
            stat.delaySumDays += daysBetween(t.dueDate, completedAt);
            stat.delayCount += 1;
          }
          const late = !!(t.dueDate && completedAt && completedAt > t.dueDate);
          if (late) {
            stat.tasksLate += 1;
            add(stat, "task_late_done");
          } else {
            stat.tasksOnTime += 1;
            add(stat, "task_on_time");
          }
        } else if (t.status !== "Arquivado" && t.dueDate && t.dueDate < today) {
          if (!inRange(t.dueDate, range)) continue;
          stat.tasksOverdue += 1;
          add(stat, "task_overdue_open");
        }
      }
    }
  }

  for (const mt of meetings) {
    // Só pontua depois que o criador confirma quem de fato participou —
    // antes disso (call ainda não aconteceu, ou aconteceu mas ninguém
    // registrou presença ainda) não pontua nem penaliza ninguém.
    if (mt.status === "Cancelada" || !mt.attendanceRecorded) continue;
    for (const pid of mt.participanteIds ?? []) {
      const member = members.find((m) => m.id === pid);
      if (!member) continue;
      if (!inRange(mt.data, range)) continue;
      const stat = ensure(member);
      if (mt.attendedBy?.includes(pid)) {
        stat.meetingsAttended += 1;
        add(stat, "meeting_attended");
      } else {
        stat.meetingsMissed += 1;
        add(stat, "meeting_missed");
      }
    }
  }

  return Array.from(byId.values())
    .map(({ delaySumDays, delayCount, ...rest }) => ({
      ...rest,
      avgDelayDays: delayCount > 0 ? delaySumDays / delayCount : null,
    }))
    .sort((a, b) => b.score - a.score);
}

/* ============================================================
 * Listas cruas de tarefas (todo mundo) — para os painéis "Tarefas de
 * hoje" e "Tarefas atrasadas" da aba Gestão, independentes do score.
 * ============================================================ */
export type TaskItem = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  assignee?: string;
  dueDate?: string;
  status: string;
};

export function collectTaskItems(
  projetos: Project[],
  campanhaGroups: TaskGroup[] = [],
): TaskItem[] {
  const out: TaskItem[] = [];
  for (const p of [...projetosAsGroups(projetos), ...campanhaGroups]) {
    for (const t of flatten(p.tasks ?? [])) {
      out.push({
        id: t.id,
        title: t.title,
        projectId: p.id,
        projectName: p.name,
        assignee: getTaskAssignees(t)[0],
        dueDate: t.dueDate,
        status: t.status,
      });
    }
  }
  return out;
}

export function tasksDueToday(items: TaskItem[], today = todayISO()): TaskItem[] {
  return items.filter((t) => t.dueDate === today && OPEN_STATUSES.has(t.status));
}

export function tasksOverdue(items: TaskItem[], today = todayISO()): TaskItem[] {
  return items.filter((t) => !!t.dueDate && t.dueDate < today && OPEN_STATUSES.has(t.status));
}

/* ============================================================
 * Entregas por semana — tendência de produtividade do time (painel
 * "Entregas por semana" da aba Time). Mesma fonte de "quando foi
 * concluída" que já alimenta o score (`taskCompletionDate`), sem campo
 * novo nem tabela nova.
 * ============================================================ */
export type WeekBucket = { weekStart: string; weekLabel: string; count: number };

const MONTH_ABBR = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** Segunda-feira da semana que contém `dateISO` (semana sempre
 * segunda→domingo, convenção comum de calendário de trabalho). */
function startOfWeekISO(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  const day = d.getDay(); // 0=dom..6=sáb
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function weekLabel(weekStartISO: string): string {
  const start = new Date(`${weekStartISO}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  return sameMonth
    ? `${start.getDate()}–${end.getDate()} ${MONTH_ABBR[end.getMonth()]}`
    : `${start.getDate()} ${MONTH_ABBR[start.getMonth()]}–${end.getDate()} ${MONTH_ABBR[end.getMonth()]}`;
}

/** Conclusões por semana (segunda a domingo), das últimas `weeks`
 * semanas até a semana corrente — pra visualizar tendência de
 * produtividade do time inteiro, não uma métrica de performance
 * isolada. Recebe os mesmos grupos já montados por quem chama
 * (`computeMemberScores`/`collectTaskItems`), sem duplicar a leitura de
 * projetos/campanhas. */
export function weeklyCompletions(
  projetos: Project[],
  campanhaGroups: TaskGroup[] = [],
  weeks = 8,
): WeekBucket[] {
  const currentWeekStart = startOfWeekISO(todayISO());
  const start = new Date(`${currentWeekStart}T00:00:00`);
  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i * 7);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    buckets.push({ weekStart: iso, weekLabel: weekLabel(iso), count: 0 });
  }
  const byStart = new Map(buckets.map((b) => [b.weekStart, b]));
  const earliestStart = buckets[0].weekStart;

  for (const p of [...projetosAsGroups(projetos), ...campanhaGroups]) {
    for (const t of flatten(p.tasks ?? [])) {
      if (t.status !== "Concluído") continue;
      const completedAt = taskCompletionDate(t);
      if (!completedAt || completedAt < earliestStart) continue;
      const bucket = byStart.get(startOfWeekISO(completedAt));
      if (bucket) bucket.count += 1;
    }
  }
  return buckets;
}

/* ============================================================
 * Produtividade por dia da semana — usada por "Entregas da Semana" na
 * página Time. Diferente de `weeklyCompletions` (bucket por SEMANA
 * civil), aqui o bucket é por DIA DA SEMANA (seg-sex) — sempre chamada
 * com o range da semana atual (Brasília, ver `currentWeekRangeBrasilia`
 * em `@/lib/timezone`), nunca outro período (o seletor de período que
 * existia aqui foi removido — "Entregas da Semana" só mostra a semana
 * atual, sem dropdown). Sábado/domingo nem entram nos buckets.
 * ============================================================ */

type Weekday = 1 | 2 | 3 | 4 | 5;
const WEEKDAY_LABEL: Record<Weekday, string> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
};

export type WeekdayBucket = {
  weekday: Weekday;
  label: string;
  totalCompletions: number;
  /** Quantas vezes esse dia da semana caiu dentro do período. */
  occurrences: number;
  /** `totalCompletions / occurrences` — `null` (não `0`) quando o dia
   * nunca ocorreu no período, pra diferenciar visualmente "sem dado" de
   * "zero entregas nesse dia". */
  average: number | null;
  /** Quantidade EXATA de entregas por responsável nesse dia (nome →
   * contagem, crédito cheio pra cada responsável de tarefas com vários,
   * mesma convenção de "Carga por membro"). Só faz sentido mostrar num
   * recorte de uma única semana (perguntar a média por pessoa num
   * período de 90 dias/ano seria uma tabela enorme) — quem consome decide
   * quando exibir, esta função sempre calcula (custo desprezível). */
  byMember: { name: string; count: number }[];
};

/** Data real de conclusão, preferindo o campo dedicado `t.completedAt`
 * (timestamp exato) — cai pro derivado de `activity`
 * (`taskCompletionDate`) só pra tarefas legadas concluídas antes desse
 * campo existir. Nunca cai pra `createdAt`: sem confirmação de quando
 * foi concluída, é melhor excluir a tarefa da estatística do que
 * atribuí-la a um dia errado. */
export type CompletionTimestampLike = {
  completedAt?: string;
  activity?: { action: string; createdAt: string }[];
};

/** Timestamp CRU de conclusão — preferindo `t.completedAt` (exato) e caindo
 * pra última entrada de activity "concluiu" só pra tarefas legadas
 * concluídas antes desse campo existir. Fonte ÚNICA reaproveitada tanto
 * pra decidir o DIA da semana (`resolvedCompletionDate`, abaixo) quanto
 * pra exibir a HORA exata no drill-down de "Entregas por dia"
 * (`task-aggregation.ts`'s `loadAllTasksFlat`) — as duas nunca podem
 * divergir sobre o que "é" a conclusão de uma tarefa. */
export function resolvedCompletionTimestamp(t: CompletionTimestampLike): string | null {
  if (t.completedAt) return t.completedAt;
  const entries = (t.activity ?? []).filter((a) => a.action === ACTIVITY_STATUS_COMPLETED_ACTION);
  return entries.length > 0 ? entries[entries.length - 1].createdAt : null;
}

/** Data real de conclusão, preferindo o campo dedicado `t.completedAt`
 * (timestamp exato) — cai pro derivado de `activity`
 * (`taskCompletionDate`) só pra tarefas legadas concluídas antes desse
 * campo existir. Nunca cai pra `createdAt`: sem confirmação de quando
 * foi concluída, é melhor excluir a tarefa da estatística do que
 * atribuí-la a um dia errado. */
function resolvedCompletionDate(t: Task): string | null {
  const ts = resolvedCompletionTimestamp(t);
  return ts ? toLocalDateISO(ts) : null;
}

export function weekdayProductivity(
  projetos: Project[],
  campanhaGroups: TaskGroup[] = [],
  range: DateRange,
): WeekdayBucket[] {
  const buckets = new Map<Weekday, WeekdayBucket>(
    ([1, 2, 3, 4, 5] as Weekday[]).map((wd) => [
      wd,
      {
        weekday: wd,
        label: WEEKDAY_LABEL[wd],
        totalCompletions: 0,
        occurrences: 0,
        average: null,
        byMember: [],
      },
    ]),
  );
  const byMemberCounts = new Map<Weekday, Map<string, number>>(
    ([1, 2, 3, 4, 5] as Weekday[]).map((wd) => [wd, new Map<string, number>()]),
  );

  if (range.from && range.to) {
    const cursor = parseIsoDateLocal(range.from);
    const end = parseIsoDateLocal(range.to);
    while (cursor.getTime() <= end.getTime()) {
      const wd = cursor.getDay();
      if (wd >= 1 && wd <= 5) buckets.get(wd as Weekday)!.occurrences += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  for (const p of [...projetosAsGroups(projetos), ...campanhaGroups]) {
    for (const t of flatten(p.tasks ?? [])) {
      if (t.status !== "Concluído") continue;
      const completedAt = resolvedCompletionDate(t);
      if (!completedAt || !inRange(completedAt, range)) continue;
      const wd = parseIsoDateLocal(completedAt).getDay();
      if (wd < 1 || wd > 5) continue;
      buckets.get(wd as Weekday)!.totalCompletions += 1;
      const counts = byMemberCounts.get(wd as Weekday)!;
      for (const name of getTaskAssignees(t)) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
  }

  for (const [wd, bucket] of buckets) {
    bucket.average = bucket.occurrences > 0 ? bucket.totalCompletions / bucket.occurrences : null;
    bucket.byMember = [...byMemberCounts.get(wd)!.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }
  return ([1, 2, 3, 4, 5] as Weekday[]).map((wd) => buckets.get(wd)!);
}

/** Totais semanais de entrega por membro dentro de `range` — uma entrada
 * por SEMANA-CALENDÁRIO (segunda a domingo, Brasília) que o range toca,
 * incluindo semanas com ZERO entregas daquele membro (mesma lógica de
 * "occurrences" de `weekdayProductivity`: o denominador da média tem que
 * contar toda semana do período, não só as que tiveram entrega, senão a
 * média fica artificialmente alta). Mesma fonte/regra de crédito de
 * `weekdayProductivity` (cada responsável ganha crédito integral, nunca
 * dividido) — quem chama decide o que fazer com os totais (média do mês/
 * trimestre/ano é responsabilidade do chamador, esta função só
 * bucketiza). Membro sem NENHUMA tarefa concluída em `range` não aparece
 * no mapa — cabe ao chamador tratar isso como "sem amostra" (nunca
 * inventar um `0` disfarçado de dado real). */
export function weeklyDeliveryTotalsByMember(
  projetos: Project[],
  campanhaGroups: TaskGroup[] = [],
  range: DateRange,
): Map<string, number[]> {
  const weekStarts: string[] = [];
  if (range.from && range.to) {
    const cursor = parseIsoDateLocal(range.from);
    const end = parseIsoDateLocal(range.to);
    while (cursor.getTime() <= end.getTime()) {
      weekStarts.push(startOfWeekIsoBrasilia(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
  }

  const perMemberPerWeek = new Map<string, Map<string, number>>();
  for (const p of [...projetosAsGroups(projetos), ...campanhaGroups]) {
    for (const t of flatten(p.tasks ?? [])) {
      if (t.status !== "Concluído") continue;
      const completedAt = resolvedCompletionDate(t);
      if (!completedAt || !inRange(completedAt, range)) continue;
      const ws = startOfWeekIsoBrasilia(parseIsoDateLocal(completedAt));
      for (const name of getTaskAssignees(t)) {
        if (!perMemberPerWeek.has(name)) perMemberPerWeek.set(name, new Map());
        const weeks = perMemberPerWeek.get(name)!;
        weeks.set(ws, (weeks.get(ws) ?? 0) + 1);
      }
    }
  }

  const result = new Map<string, number[]>();
  for (const [name, weeks] of perMemberPerWeek) {
    result.set(
      name,
      weekStarts.map((ws) => weeks.get(ws) ?? 0),
    );
  }
  return result;
}

/** Quantas tarefas de UMA pessoa foram concluídas na semana corrente
 * (segunda a domingo) — usado na visão individual do membro na aba
 * Time (item "tarefas concluídas na semana"). Mesma fonte de dados de
 * `weeklyCompletions`, só filtrado por responsável e por uma única
 * semana, sem precisar carregar `activity` pra fora deste módulo. */
export function memberCompletionsThisWeek(
  personName: string,
  projetos: Project[],
  campanhaGroups: TaskGroup[] = [],
): number {
  const weekStart = startOfWeekISO(todayISO());
  let count = 0;
  for (const p of [...projetosAsGroups(projetos), ...campanhaGroups]) {
    for (const t of flatten(p.tasks ?? [])) {
      if (t.status !== "Concluído" || !getTaskAssignees(t).includes(personName)) continue;
      const completedAt = taskCompletionDate(t);
      if (completedAt && completedAt >= weekStart) count += 1;
    }
  }
  return count;
}
