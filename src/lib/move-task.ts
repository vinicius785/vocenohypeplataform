import type { Task, TaskBoardScope } from "@/components/tasks/TaskBoard";
import { loadProjetoTarefas, saveProjetoTarefas } from "@/lib/projeto-scoped-store";
import { loadCampanhaTarefas, saveCampanhaTarefas } from "@/lib/campanha-scoped-store";
import {
  insertStandaloneWithId,
  removeStandalone,
  type MktStandalone,
} from "@/lib/marketing-tasks";

/** Destino de "Mover tarefa" — mesma forma de `TaskBoardScope`, mas com
 * um rótulo pronto pra exibir (nome do projeto/campanha) já que quem
 * monta isso é o picker (`MoveTaskDialog`), não o board de origem. */
export type MoveTarget =
  | { kind: "projeto"; id: string; label: string }
  | { kind: "campanha"; id: string; label: string }
  | { kind: "marketing"; label: string };

/** Marketing guarda tarefas num shape próprio (`MktStandalone`, quase
 * idêntico a `Task` — ver `marketing-tasks.ts`), sem `roadmapPhaseId`
 * (não existe fase em Marketing). Mesma lista de campos que
 * `MarketingSection.tsx`'s `onChange` já grava ao criar/atualizar uma
 * tarefa avulsa — mantém as duas conversões (leitura e escrita)
 * sempre no mesmo formato. */
function taskToMkt(t: Task): MktStandalone {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    assignee: t.assignee,
    assignees: t.assignees,
    primaryAssignee: t.primaryAssignee,
    priority: t.priority,
    tags: t.tags,
    attachments: t.attachments,
    subtasks: t.subtasks,
    startDate: t.startDate,
    estimate: t.estimate,
    dueDate: t.dueDate,
    note: t.description,
    noteText: t.descriptionText,
    createdAt: t.createdAt,
    timerRunning: t.timerRunning,
    timerStartedAt: t.timerStartedAt,
    timeEntries: t.timeEntries,
    activity: t.activity,
    comments: t.comments,
    completedAt: t.completedAt,
    originalDueDate: t.originalDueDate,
    performanceDueDate: t.performanceDueDate,
    deadlineHistory: t.deadlineHistory,
    recurrence: t.recurrence,
  };
}

/** Move uma tarefa de um board pra outro (Projeto/Campanha/Marketing).
 * Escreve direto nas stores já existentes (mesmas usadas por cada
 * board) — não depende de estado de página nenhum, e a mudança chega
 * sozinha em quem estiver com o board de origem ou destino aberto via
 * os listeners de sincronização que essas stores já têm
 * (`onProjetoTarefasChange`/`onCampanhaTarefasChange`/`onStandaloneChange`).
 *
 * Preserva o `id` da tarefa (só removendo o prefixo `mkt:` quando ela
 * está saindo do Marketing) — dependências (`task_dependencies`) e
 * qualquer link cruzado guardam só o id cru da tarefa, sem coluna de
 * escopo, então preservar o id é o que faz esses vínculos sobreviverem
 * ao move sem nenhuma migração. `roadmapPhaseId` é sempre limpo: fase
 * só faz sentido dentro do projeto de origem. */
export function moveTask(task: Task, from: TaskBoardScope, to: MoveTarget): void {
  const rawId = from.kind === "marketing" ? task.id.replace(/^mkt:/, "") : task.id;
  const movedTask: Task = { ...task, id: rawId, roadmapPhaseId: undefined };

  if (from.kind === "projeto") {
    saveProjetoTarefas(
      from.id,
      loadProjetoTarefas(from.id).filter((t) => t.id !== task.id),
    );
  } else if (from.kind === "campanha") {
    saveCampanhaTarefas(
      from.id,
      loadCampanhaTarefas(from.id).filter((t) => t.id !== task.id),
    );
  } else {
    removeStandalone(rawId);
  }

  if (to.kind === "projeto") {
    saveProjetoTarefas(to.id, [...loadProjetoTarefas(to.id), movedTask]);
  } else if (to.kind === "campanha") {
    saveCampanhaTarefas(to.id, [...loadCampanhaTarefas(to.id), movedTask]);
  } else {
    insertStandaloneWithId(taskToMkt(movedTask));
  }
}

/** Duplica uma tarefa dentro do MESMO board (mesmo padrão de
 * `handleDuplicateFase`, em `projeto.$id.tsx`: espalha o objeto, gera
 * um novo id, sufixa "(cópia)" no título). Uma cópia não carrega o
 * histórico da original — activity/comentários/cronômetro/conclusão
 * são zerados, exatamente como uma tarefa nova nunca nasce com esses
 * campos preenchidos. */
export function duplicateTask(task: Task, scope: TaskBoardScope): Task {
  const copy: Task = {
    ...task,
    id: crypto.randomUUID(),
    title: `${task.title} (cópia)`,
    activity: undefined,
    comments: undefined,
    timeEntries: undefined,
    timerRunning: undefined,
    timerStartedAt: undefined,
    completedAt: undefined,
  };

  if (scope.kind === "projeto") {
    saveProjetoTarefas(scope.id, [...loadProjetoTarefas(scope.id), copy]);
  } else if (scope.kind === "campanha") {
    saveCampanhaTarefas(scope.id, [...loadCampanhaTarefas(scope.id), copy]);
  } else {
    insertStandaloneWithId(taskToMkt(copy));
  }

  return copy;
}
