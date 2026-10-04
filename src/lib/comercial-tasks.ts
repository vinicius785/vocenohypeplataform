/**
 * Tarefas do Comercial — Kanban de tarefas da página Comercial. Mesmo modelo
 * (`Task`), mesmos status e mesma UI das tarefas de Projetos/Campanhas/Marketing;
 * só a tabela é própria (`comercial_tarefas`, cada linha guarda a `Task` inteira).
 */
import type { Task } from "@/components/tasks/TaskBoard";
import { createTableArrayStore } from "@/lib/table-array-store";

const store = createTableArrayStore<Task>("comercial_tarefas");

let started: Promise<void> | null = null;

/** Carrega e assina o realtime uma única vez (sob demanda: só quem abre o
 * Comercial paga a leitura da tabela). */
export function initComercialTasksSync(): Promise<void> {
  started ??= store.init().then(() => store.subscribeRealtime());
  return started;
}

export const loadComercialTasks = (): Task[] => store.get();
export const onComercialTasksChange = (cb: () => void) => store.subscribe(cb);

/** Aplica ao banco a diferença entre a lista atual e a que o `TaskBoard` devolveu. */
export function saveComercialTasks(next: Task[]): void {
  store.set((prev) => {
    const nextIds = new Set(next.map((t) => t.id));
    const prevById = new Map(prev.map((t) => [t.id, t]));
    const kept = prev.filter((t) => nextIds.has(t.id)).map((t) => next.find((n) => n.id === t.id)!);
    const added = next.filter((t) => !prevById.has(t.id));
    return [...kept, ...added];
  });
}
