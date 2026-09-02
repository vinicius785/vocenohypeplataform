import { useEffect, useMemo, useState } from "react";
import { loadProjetos, getTaskAssignees } from "@/lib/projetos";
import {
  getAllCampanhaTarefas,
  onCampanhaTarefasChange,
  saveCampanhaTarefas,
} from "@/lib/campanha-scoped-store";
import {
  loadStandalone,
  onStandaloneChange,
  updateStandalone,
  removeStandalone,
  type MktStandalone,
} from "@/lib/marketing-tasks";
import { saveProjetoTarefas } from "@/lib/projeto-scoped-store";
import { useClientes } from "@/lib/clientes-store";
import { cleanupDependenciesForTask } from "@/lib/task-dependencies-store";
import type { Task, TaskBoardScope, TaskStatus } from "@/components/tasks/TaskBoard";

/** Diretório "achatado" de todas as tarefas da plataforma (projetos +
 * campanhas + avulsas do Marketing), pra qualquer feature que precise
 * buscar/listar tarefas fora do board onde elas moram — hoje usado pelo
 * @menção do Chat e pelo `TaskPicker` de dependências. Extraído do que
 * era um `useMemo` só de `ChatSection.tsx` — mesmo shape, mesmo
 * comportamento, sem duplicar a lógica de montagem. */
export type TaskDirectoryEntry = {
  id: string;
  label: string;
  project?: string;
  projectId: string;
  campanhaId?: string;
  status: string;
  priority?: string;
  dueDate?: string;
  assignees: string[];
  /** Id real da linha na tabela de origem — igual a `id` pra tarefas de
   * projeto/campanha, mas SEM o prefixo "mkt:" que `id` carrega pra
   * tarefas avulsas do Marketing (convenção só de deep-link do Chat,
   * ver `MarketingSection.tsx`'s `?taskId=`). Qualquer feature que
   * precise gravar uma referência real a essa tarefa (ex.: dependências)
   * deve usar `rawId`, nunca `id`. */
  rawId: string;
};

export function useTaskDirectory(): TaskDirectoryEntry[] {
  const clientes = useClientes();
  const campanhaNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clientes) {
      for (const camp of c.campanhas ?? []) map.set(camp.id, camp.nome);
    }
    return map;
  }, [clientes]);

  const [, forceTasks] = useState(0);
  useEffect(() => onCampanhaTarefasChange(() => forceTasks((n) => n + 1)), []);
  useEffect(() => onStandaloneChange(() => forceTasks((n) => n + 1)), []);

  return useMemo(() => {
    const projs = loadProjetos();
    let marketingProjectId: string | undefined;
    const projectTasks: TaskDirectoryEntry[] = projs.flatMap((p) => {
      if (p.name.trim().toUpperCase() === "MARKETING") marketingProjectId = p.id;
      return (p.tasks ?? []).map((t) => ({
        id: t.id,
        rawId: t.id,
        label: t.title,
        project: p.name,
        projectId: p.id,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        assignees: getTaskAssignees(t),
      }));
    });
    const campanhaTasks: TaskDirectoryEntry[] = [];
    for (const [campanhaId, campTasks] of getAllCampanhaTarefas()) {
      for (const t of campTasks) {
        campanhaTasks.push({
          id: t.id,
          rawId: t.id,
          label: t.title,
          project: campanhaNameMap.get(campanhaId),
          projectId: "",
          campanhaId,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          assignees: getTaskAssignees(t),
        });
      }
    }
    const standaloneTasks: TaskDirectoryEntry[] = marketingProjectId
      ? loadStandalone().map((s) => ({
          id: `mkt:${s.id}`,
          rawId: s.id,
          label: s.title,
          project: "Marketing",
          projectId: marketingProjectId!,
          status: s.status,
          dueDate: s.dueDate,
          assignees: getTaskAssignees(s),
        }))
      : [];
    return [...projectTasks, ...campanhaTasks, ...standaloneTasks];
  }, [campanhaNameMap]);
}

/** Converte uma `MktStandalone` (tarefa avulsa do Marketing) pro shape de
 * `Task` que `TaskDialog` espera — mesmo mapeamento de campos já usado em
 * `MarketingSection.tsx`'s `resolveTasks` (replicado aqui, não importado,
 * porque lá é uma função privada do arquivo, só isso). */
function standaloneToTask(s: MktStandalone): Task {
  return {
    id: s.id,
    title: s.title,
    status: s.status as TaskStatus,
    priority: s.priority ?? "Normal",
    tags: s.tags,
    attachments: s.attachments,
    subtasks: s.subtasks as Task[] | undefined,
    startDate: s.startDate,
    estimate: s.estimate,
    dueDate: s.dueDate,
    assignee: s.assignee,
    assignees: s.assignees,
    primaryAssignee: s.primaryAssignee,
    description: s.note,
    createdAt: s.createdAt,
    timerRunning: s.timerRunning,
    timerStartedAt: s.timerStartedAt,
    timeEntries: s.timeEntries,
    activity: s.activity,
    comments: s.comments,
    completedAt: s.completedAt,
    originalDueDate: s.originalDueDate,
    performanceDueDate: s.performanceDueDate,
    deadlineHistory: s.deadlineHistory,
    recurrence: s.recurrence,
  } as Task;
}

function taskToStandalonePatch(t: Task): Partial<Omit<MktStandalone, "id" | "createdAt">> {
  return {
    title: t.title,
    status: t.status,
    priority: t.priority,
    tags: t.tags,
    attachments: t.attachments,
    subtasks: t.subtasks,
    startDate: t.startDate,
    estimate: t.estimate,
    dueDate: t.dueDate,
    assignee: t.assignee,
    assignees: t.assignees,
    primaryAssignee: t.primaryAssignee,
    note: t.description,
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
  } as Partial<Omit<MktStandalone, "id" | "createdAt">>;
}

export type TaskContext = {
  task: Task;
  scope: TaskBoardScope;
  breadcrumb: string;
  save: (t: Task) => void;
  remove: () => void;
};

/** Resolve uma tarefa por id (o `rawId` de `TaskDirectoryEntry`, nunca o
 * `id` prefixado de exibição) em qualquer uma das 3 origens, com
 * `save`/`remove` já fechados sobre a função de persistência certa —
 * usado pelo overlay global de dependências (`TaskModalStack`) pra abrir
 * qualquer tarefa da plataforma sem saber de antemão de onde ela vem. */
export function findTaskContext(taskId: string): TaskContext | null {
  const projs = loadProjetos();
  for (const p of projs) {
    const tasks = p.tasks ?? [];
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx >= 0) {
      const task = tasks[idx] as unknown as Task;
      return {
        task,
        scope: { kind: "projeto", id: p.id },
        breadcrumb: p.name,
        save: (t) => {
          const next = tasks.map((x) =>
            x.id === taskId ? (t as unknown as (typeof tasks)[number]) : x,
          );
          saveProjetoTarefas(p.id, next as unknown as Parameters<typeof saveProjetoTarefas>[1]);
        },
        remove: () => {
          saveProjetoTarefas(
            p.id,
            tasks.filter((x) => x.id !== taskId) as unknown as Parameters<
              typeof saveProjetoTarefas
            >[1],
          );
          void cleanupDependenciesForTask(taskId);
        },
      };
    }
    for (const parent of tasks) {
      const subs = parent.subtasks ?? [];
      const subIdx = subs.findIndex((s) => s.id === taskId);
      if (subIdx >= 0) {
        const sub = subs[subIdx] as unknown as Task;
        return {
          task: sub,
          scope: { kind: "projeto", id: p.id },
          breadcrumb: `${p.name} · ${parent.title}`,
          save: (t) => {
            const nextParent = {
              ...parent,
              subtasks: subs.map((x) => (x.id === taskId ? (t as unknown as typeof x) : x)),
            };
            saveProjetoTarefas(
              p.id,
              tasks.map((x) => (x.id === parent.id ? nextParent : x)) as unknown as Parameters<
                typeof saveProjetoTarefas
              >[1],
            );
          },
          remove: () => {
            const nextParent = { ...parent, subtasks: subs.filter((x) => x.id !== taskId) };
            saveProjetoTarefas(
              p.id,
              tasks.map((x) => (x.id === parent.id ? nextParent : x)) as unknown as Parameters<
                typeof saveProjetoTarefas
              >[1],
            );
            void cleanupDependenciesForTask(taskId);
          },
        };
      }
    }
  }

  for (const [campanhaId, campTasks] of getAllCampanhaTarefas()) {
    const idx = campTasks.findIndex((t) => t.id === taskId);
    if (idx >= 0) {
      const task = campTasks[idx] as unknown as Task;
      return {
        task,
        scope: { kind: "campanha", id: campanhaId },
        breadcrumb: "Campanha",
        save: (t) =>
          saveCampanhaTarefas(
            campanhaId,
            campTasks.map((x) => (x.id === taskId ? (t as unknown as typeof x) : x)),
          ),
        remove: () => {
          saveCampanhaTarefas(
            campanhaId,
            campTasks.filter((x) => x.id !== taskId),
          );
          void cleanupDependenciesForTask(taskId);
        },
      };
    }
  }

  const standalone = loadStandalone();
  const sIdx = standalone.findIndex((s) => s.id === taskId);
  if (sIdx >= 0) {
    const s = standalone[sIdx];
    return {
      task: standaloneToTask(s),
      scope: { kind: "marketing" },
      breadcrumb: "Marketing",
      save: (t) => updateStandalone(taskId, taskToStandalonePatch(t)),
      remove: () => {
        removeStandalone(taskId);
        void cleanupDependenciesForTask(taskId);
      },
    };
  }

  return null;
}
