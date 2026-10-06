import { computeNextRecurrenceDueDate } from "@/lib/task-recurrence";
import { getMe } from "@/lib/chat-store";
import { recordPerformanceEvent } from "@/lib/performance-events-store";
import {
  effectivePerformanceDueDate,
  classifyOutcome,
  xpForCompletion,
  isValidUuid,
  type PerformanceSettings,
} from "@/lib/performance-engine";
import { colorFor, initialsOf } from "@/lib/person-avatar";
import { getTaskAssignees, getTaskPrimaryAssignee } from "@/lib/projetos";
import type { TaskStatus } from "@/lib/task-status";
import { loadProjetoTarefas, saveProjetoTarefas } from "@/lib/projeto-scoped-store";
import { getAllCampanhaTarefas, saveCampanhaTarefas } from "@/lib/campanha-scoped-store";
import { loadStandalone, updateStandalone } from "@/lib/marketing-tasks";
import { loadComercialTasks, saveComercialTasks } from "@/lib/comercial-tasks";
import { standaloneToTask, taskToStandalonePatch } from "@/lib/task-directory";
import { startTimerOnInProgress, stopIfRunningOnTask } from "@/lib/time-entries";
import {
  shouldStartTimerOnStatusChange,
  shouldStopTimerOnStatusChange,
} from "@/lib/timer-status-rules";
import type { ActivityKind, Member, Task, TaskBoardScope } from "@/components/tasks/TaskBoard";

/**
 * Pipeline OFICIAL de mudança de status de tarefa — extraído do `TaskBoard.tsx` SEM mudar
 * comportamento, para o Kanban (arrastar e diálogo) e o Início ("Meu trabalho") usarem exatamente
 * a mesma implementação: `withStatusChange` (conclusão, atividade, timer legado) →
 * `recordTaskLedgerEventsOnStatusChange` (XP/performance) → `applyRecurrenceIfCompleted`.
 */

export function getCurrentAuthor(): Member {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("config:perfil");
      if (raw) {
        const p = JSON.parse(raw) as { nome?: string; foto?: string };
        const name = (p.nome ?? "").trim();
        if (name)
          return { name, initials: initialsOf(name) || "?", color: colorFor(name), photo: p.foto };
      }
    } catch {
      /* ignore */
    }
  }
  return { name: "Você", initials: "VC", color: "bg-foreground text-background" };
}

/* ============================================================
 * Timer por tarefa — inicia sozinho ao mover para "Em andamento"
 * (drag no board ou troca de status no diálogo), ou manualmente pelo
 * botão de play no card. Ao parar (pausa manual ou troca de status),
 * a sessão vira um comentário + entrada de atividade na própria
 * tarefa, e o total em segundos fica em `timeEntries` para a aba
 * Gestão calcular horas trabalhadas por pessoa.
 * ============================================================ */

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min`;
  return `${sec}s`;
}

export function liveElapsedSeconds(t: Task): number {
  if (!t.timerRunning || !t.timerStartedAt) return 0;
  return (Date.now() - Date.parse(t.timerStartedAt)) / 1000;
}

export function startTaskTimer(task: Task): Task {
  if (task.timerRunning) return task;
  return { ...task, timerRunning: true, timerStartedAt: new Date().toISOString() };
}

export function stopTaskTimer(task: Task): Task {
  if (!task.timerRunning || !task.timerStartedAt) {
    return { ...task, timerRunning: false, timerStartedAt: undefined };
  }
  const elapsedSec = (Date.now() - Date.parse(task.timerStartedAt)) / 1000;
  const next: Task = { ...task, timerRunning: false, timerStartedAt: undefined };
  if (elapsedSec < 1) return next;
  const me = getCurrentAuthor();
  const now = new Date().toISOString();
  return {
    ...next,
    activity: [
      ...(task.activity ?? []),
      {
        id: crypto.randomUUID(),
        author: me.name,
        initials: me.initials,
        color: me.color,
        action: `registrou ${formatDuration(elapsedSec)} de trabalho`,
        createdAt: now,
      },
    ],
    timeEntries: [
      ...(task.timeEntries ?? []),
      { seconds: elapsedSec, author: me.name, endedAt: now },
    ],
  };
}

/** Aplica uma mudança de status junto com os efeitos de timer que ela dispara
 * (para o timer se estava rodando; inicia sozinho se o novo status é "Em
 * andamento") e a entrada de atividade correspondente — usado tanto pelo
 * drag-and-drop do board quanto pelo diálogo de edição, para os dois
 * caminhos ficarem consistentes. */
export function withStatusChange(task: Task, newStatus: TaskStatus): Task {
  if (task.status === newStatus) return task;
  let next = task.timerRunning ? stopTaskTimer(task) : task;
  const me = getCurrentAuthor();
  const now = new Date().toISOString();
  const wasCompleted = task.status === "Concluído";
  const kind: ActivityKind =
    newStatus === "Concluído" ? "completed" : wasCompleted ? "reopened" : "status";
  next = {
    ...next,
    status: newStatus,
    // `completedAt` é a fonte de verdade estruturada de "quando concluiu"
    // (Score Operacional precisa de precisão de minuto, não só o dia) —
    // vive em paralelo à entrada de `activity` abaixo, nunca a
    // substitui. Some de novo se a tarefa sair de "Concluído"
    // (reaberta) — deixa de estar concluída agora, mesmo que já tenha
    // sido no passado (esse fato fica só no ledger de performance).
    completedAt: newStatus === "Concluído" ? now : undefined,
    activity: [
      ...(next.activity ?? []),
      {
        id: crypto.randomUUID(),
        author: me.name,
        initials: me.initials,
        color: me.color,
        // Texto igual a `ACTIVITY_STATUS_COMPLETED_ACTION` quando
        // `newStatus === "Concluído"` — nunca mude este formato sem
        // atualizar a constante e `score.ts`'s `taskCompletionDate`.
        action: `mudou status para ${newStatus}`,
        createdAt: now,
        kind,
      },
    ],
  };
  if (newStatus === "Em andamento") next = startTaskTimer(next);
  return next;
}

export function taskOriginFromScope(
  scope?: TaskBoardScope,
): "projeto" | "campanha" | "marketing" | "comercial" | null {
  return scope?.kind ?? null;
}

export function resolvePersonId(name: string, members: Member[]): string | null {
  return members.find((m) => m.name === name)?.id ?? null;
}

/** Emite o(s) evento(s) de performance relevantes quando uma tarefa
 * conclui ou é reaberta — chamado tanto pelo `save()` do diálogo quanto
 * pelo drag-and-drop do board, os dois pontos que já passam por
 * `withStatusChange`. Nunca bloqueia a ação principal: `recordPerformanceEvent`
 * já é fire-and-forget, e o `me.id` inválido (perfil ainda não
 * hidratado) simplesmente pula a emissão em vez de tentar gravar lixo. */
export function recordTaskLedgerEventsOnStatusChange(
  prev: Task,
  next: Task,
  ctx: { scope?: TaskBoardScope; members: Member[]; performanceSettings: PerformanceSettings },
) {
  const me = getMe();
  if (!isValidUuid(me.id)) return;
  const actor = getCurrentAuthor();
  const origin = taskOriginFromScope(ctx.scope);
  const assigneeNames = getTaskAssignees(next);
  // Conclusão/reabertura geram XP — quando há responsável principal
  // definido, ele é o único alvo (accountability real, item 19 do
  // pedido). Sem principal (tarefa legada), mantém o comportamento
  // anterior: distribui entre todos os assignees, sem inventar um
  // principal arbitrário pra fins de pontuação.
  const primary = getTaskPrimaryAssignee(next);
  const targets = primary ? [primary] : assigneeNames.length ? assigneeNames : [actor.name];
  const enteredConcluido = next.status === "Concluído" && prev.status !== "Concluído";
  const leftConcluido = prev.status === "Concluído" && next.status !== "Concluído";

  if (enteredConcluido && next.completedAt) {
    const ref = effectivePerformanceDueDate(
      next.originalDueDate ?? next.dueDate,
      next.deadlineHistory,
      ctx.performanceSettings.deadlineCutoffHour,
    );
    const { outcome, delayMinutes } = classifyOutcome(
      ref,
      next.completedAt,
      ctx.performanceSettings.deadlineCutoffHour,
    );
    const xpDelta = xpForCompletion(outcome, ctx.performanceSettings, targets.length);
    for (const name of targets) {
      recordPerformanceEvent({
        eventType: "task_completed",
        personId: resolvePersonId(name, ctx.members),
        personName: name,
        actorId: me.id,
        actorName: actor.name,
        taskId: next.id,
        taskOrigin: origin,
        taskTitle: next.title,
        meetingId: null,
        data: { outcome, delayMinutes, performanceDueDateUsed: ref ?? null, xpDelta },
      });
    }
  } else if (leftConcluido) {
    for (const name of targets) {
      recordPerformanceEvent({
        eventType: "task_reopened",
        personId: resolvePersonId(name, ctx.members),
        personName: name,
        actorId: me.id,
        actorName: actor.name,
        taskId: next.id,
        taskOrigin: origin,
        taskTitle: next.title,
        meetingId: null,
        data: {},
      });
    }
  }
}

/** Se `next` acabou de entrar em "Concluído" e tem uma `recurrence`
 * configurada, o ciclo NUNCA fica concluído de vez — o registro volta
 * sozinho pra "Aberto" com um novo prazo (calculado a partir da
 * conclusão), igual ao ClickUp (a tarefa recorrente não duplica, ela
 * "gira"). Chamado DEPOIS de `recordTaskLedgerEventsOnStatusChange` nos
 * dois pontos de entrada (drag-and-drop e `save()`), pra que o evento de
 * conclusão do ciclo que está terminando seja registrado com o prazo
 * REAL desse ciclo, antes do reset. Histórico de prazo (`deadlineHistory`/
 * `originalDueDate`/`performanceDueDate`) é zerado a cada novo ciclo —
 * cada volta da tarefa recorrente começa com uma folha em branco, sem
 * carregar replanejamentos do ciclo anterior. */
export function applyRecurrenceIfCompleted(prev: Task, next: Task): Task {
  if (!(next.status === "Concluído" && prev.status !== "Concluído")) return next;
  if (!next.recurrence) return next;
  const actor = getCurrentAuthor();
  const completedAt = next.completedAt ?? new Date().toISOString();
  const nextDue = computeNextRecurrenceDueDate(completedAt, next.recurrence);
  return {
    ...next,
    status: "Aberto",
    completedAt: undefined,
    dueDate: nextDue,
    originalDueDate: nextDue,
    performanceDueDate: nextDue,
    deadlineHistory: [],
    activity: [
      ...(next.activity ?? []),
      {
        id: crypto.randomUUID(),
        author: actor.name,
        initials: actor.initials,
        color: actor.color,
        action: `tarefa recorrente: novo prazo em ${fmtDate(nextDue)}`,
        createdAt: new Date().toISOString(),
        kind: "minor",
      },
    ],
  };
}

// `new Date("2026-07-29")` (data sem hora) é interpretada como meia-noite UTC;
// formatar em horário local (Brasil, UTC-3) mostra um dia a menos. Ancorar em
// meio-dia local evita esse desvio de fuso horário.
export const fmtDate = (d: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR") : "—";

/* ---------------- Mudar o status de uma tarefa a partir de qualquer tela ---------------- */

/** Como achar a tarefa: `id` é o da própria tarefa/subtarefa (com `mkt:` nas avulsas do Marketing),
 * `parentId` só existe em subtarefa. */
export type StatusTarget = {
  id: string;
  projectId: string;
  campanhaId?: string;
  parentId?: string;
  /** Tarefa do Comercial (`comercial_tarefas`): sem projeto/campanha e sem cronômetro. */
  comercial?: boolean;
};
export type StatusChangeContext = { members: Member[]; performanceSettings: PerformanceSettings };

export function statusTargetOrigin(
  t: StatusTarget,
): "projeto" | "campanha" | "marketing" | "comercial" {
  if (t.comercial) return "comercial";
  if (t.campanhaId) return "campanha";
  if (t.id.startsWith("mkt:") || t.parentId?.startsWith("mkt:")) return "marketing";
  return "projeto";
}

/** Atualiza (recursivamente) a tarefa/subtarefa `id` dentro de `list`. */
export function updateTaskNode(
  list: Task[],
  id: string,
  fn: (t: Task) => Task,
): { list: Task[]; prev: Task; next: Task } | null {
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.id === id) {
      const next = fn(t);
      return { list: list.map((x, j) => (j === i ? next : x)), prev: t, next };
    }
    if (t.subtasks?.length) {
      const r = updateTaskNode(t.subtasks, id, fn);
      if (r) {
        return {
          list: list.map((x, j) => (j === i ? { ...x, subtasks: r.list } : x)),
          prev: r.prev,
          next: r.next,
        };
      }
    }
  }
  return null;
}

/**
 * Muda o status de uma tarefa (ou subtarefa) pelo MESMO pipeline do Kanban: `withStatusChange` →
 * XP/performance → recorrência → grava no store da origem → cronômetro (para ao sair de "Em
 * andamento"/concluir; começa para quem mudou ao entrar em "Em andamento"). As regras que exigem
 * tela (dependência pendente, bloqueio) são decididas por quem chama — ver `home-work.ts`.
 */
export function changeTaskStatus(
  target: StatusTarget,
  newStatus: TaskStatus,
  ctx: StatusChangeContext,
): { ok: boolean; completed: boolean } {
  const origin = statusTargetOrigin(target);
  const scope: TaskBoardScope =
    origin === "comercial"
      ? { kind: "comercial" }
      : origin === "campanha"
        ? { kind: "campanha", id: target.campanhaId! }
        : origin === "marketing"
          ? { kind: "marketing" }
          : { kind: "projeto", id: target.projectId };
  const rawId = target.id.replace(/^mkt:/, "");
  let changed: { prev: Task; next: Task } | null = null;

  const pipeline = (t: Task): Task => {
    const updated = withStatusChange(t, newStatus);
    if (updated !== t) {
      recordTaskLedgerEventsOnStatusChange(t, updated, { scope, ...ctx });
    }
    return applyRecurrenceIfCompleted(t, updated);
  };

  if (target.comercial) {
    const r = updateTaskNode(loadComercialTasks(), target.id, pipeline);
    if (r) {
      saveComercialTasks(r.list);
      changed = r;
    }
  } else if (origin === "campanha") {
    const list = getAllCampanhaTarefas().get(target.campanhaId!);
    const r = list ? updateTaskNode(list, target.id, pipeline) : null;
    if (r) {
      saveCampanhaTarefas(target.campanhaId!, r.list);
      changed = r;
    }
  } else if (origin === "marketing") {
    for (const s of loadStandalone()) {
      const r = updateTaskNode([standaloneToTask(s)], rawId, pipeline);
      if (r) {
        updateStandalone(s.id, taskToStandalonePatch(r.list[0]));
        changed = r;
        break;
      }
    }
  } else {
    const r = updateTaskNode(loadProjetoTarefas(target.projectId), target.id, pipeline);
    if (r) {
      saveProjetoTarefas(target.projectId, r.list);
      changed = r;
    }
  }
  if (!changed) return { ok: false, completed: false };

  const prevStatus = changed.prev.status;
  if (shouldStopTimerOnStatusChange(prevStatus, newStatus)) {
    void stopIfRunningOnTask(rawId, origin);
  }
  if (shouldStartTimerOnStatusChange(prevStatus, newStatus)) {
    void startTimerOnInProgress(rawId, origin, changed.prev.title);
  }
  return { ok: true, completed: newStatus === "Concluído" };
}
