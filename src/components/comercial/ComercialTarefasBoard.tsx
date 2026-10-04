import { useEffect, useSyncExternalStore } from "react";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { KANBAN_COLUMN_LIMIT } from "@/lib/kanban-limit";
import {
  initComercialTasksSync,
  loadComercialTasks,
  onComercialTasksChange,
  saveComercialTasks,
} from "@/lib/comercial-tasks";

/** Kanban de tarefas do Comercial — o mesmo `TaskBoard` de Projetos/Campanhas
 * (criar, editar, arrastar entre os status reais, filtros), com até
 * `KANBAN_COLUMN_LIMIT` cards por coluna e "Ver mais (N)" para o restante. */
export function ComercialTarefasBoard() {
  useEffect(() => {
    void initComercialTasksSync();
  }, []);
  const tasks = useSyncExternalStore(
    onComercialTasksChange,
    loadComercialTasks,
    loadComercialTasks,
  );
  return (
    <TaskBoard
      tasks={tasks}
      onChange={saveComercialTasks}
      title="Tarefas"
      breadcrumb="Comercial"
      columnLimit={KANBAN_COLUMN_LIMIT}
    />
  );
}
