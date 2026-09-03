import { useEffect, useMemo, useState } from "react";
import { SectionHeader } from "./SectionHeader";
import { TaskBoard, type Task as BoardTask, type TaskStatus } from "./tasks/TaskBoard";
import {
  loadStandalone,
  createStandalone,
  updateStandalone,
  removeStandalone,
  onStandaloneChange,
  type MktStandalone,
} from "@/lib/marketing-tasks";

function resolveTasks(standalones: MktStandalone[]): BoardTask[] {
  return standalones.map((s) => ({
    id: `mkt:${s.id}`,
    title: s.title,
    status: s.status as TaskStatus,
    // Sem isso, toda tarefa avulsa do Marketing sempre "resetava" pra
    // Normal ao ser lida — a prioridade escolhida na UI nunca tinha
    // onde ser persistida (mesma lacuna dos campos abaixo).
    priority: s.priority ?? "Normal",
    tags: s.tags,
    attachments: s.attachments,
    subtasks: s.subtasks,
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
  }));
}

export function MarketingSection({
  initialOpenTaskId,
  onInitialOpenTaskHandled,
}: {
  /** Deep-link vindo de "Meu trabalho" (Início) ou do indicador de timer
   * ativo — mesmo search param `taskId` que `/projeto/$id` já usa pra
   * projetos normais, só que aqui o id já vem prefixado (`mkt:`) porque o
   * board do Marketing usa um id "achatado" só dele. */
  initialOpenTaskId?: string;
  onInitialOpenTaskHandled?: () => void;
} = {}) {
  const [standalones, setStandalones] = useState<MktStandalone[]>(() => loadStandalone());

  // Sem esse listener, criar/editar/excluir uma tarefa salvava certinho,
  // mas a tela só refletia depois de um F5 (parecia que "não criava").
  useEffect(
    () =>
      onStandaloneChange(() => {
        setStandalones(loadStandalone());
      }),
    [],
  );

  const tasks = useMemo(() => resolveTasks(standalones), [standalones]);

  const onChange = (next: BoardTask[]) => {
    const prevIds = new Set(tasks.map((t) => t.id));
    const nextIds = new Set(next.map((t) => t.id));

    for (const id of prevIds) {
      if (!nextIds.has(id)) removeStandalone(id.replace(/^mkt:/, ""));
    }

    for (const t of next) {
      if (!prevIds.has(t.id)) {
        createStandalone({
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
          activity: t.activity,
          comments: t.comments,
        });
        continue;
      }
      updateStandalone(t.id.replace(/^mkt:/, ""), {
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
      });
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Marketing"
        subtitle="Kanban compartilhado do time de marketing. Crie tarefas aqui."
      />
      <TaskBoard
        tasks={tasks}
        onChange={onChange}
        scope={{ kind: "marketing" }}
        breadcrumb="Marketing"
        title="Tarefas do Marketing"
        initialOpenTaskId={initialOpenTaskId}
        onInitialOpenTaskHandled={onInitialOpenTaskHandled}
      />
    </div>
  );
}
