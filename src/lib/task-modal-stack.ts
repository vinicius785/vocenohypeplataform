import { useSyncExternalStore } from "react";

/** Pilha global de tarefas abertas por dependência — permite abrir uma
 * tarefa vinculada (de qualquer projeto/campanha) por cima da atual sem
 * navegar de página, e "voltar" pra anterior fechando a de cima. Montada
 * uma única vez (`TaskModalStack`, em `AppShell.tsx`). */
let stack: string[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function pushTaskModal(taskId: string): void {
  stack = [...stack, taskId];
  emit();
}

export function popTaskModal(): void {
  if (stack.length === 0) return;
  stack = stack.slice(0, -1);
  emit();
}

export function useTaskModalStack(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => stack,
    () => stack,
  );
}
