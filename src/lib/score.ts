import type { Project, Task } from "./projetos";
import { getTaskAssignees } from "./projetos";
import type { Meeting } from "./reunioes-store";
import type { ChatMember } from "./chat-store";
import { todayISO } from "./financeiro-entries";

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
  const entries = (t.activity ?? []).filter((a) => a.action === "mudou status para Concluído");
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
