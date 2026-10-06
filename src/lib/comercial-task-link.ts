/**
 * Deep-link para uma tarefa do Comercial. O Comercial é uma seção dentro de `/time` (sem rota própria
 * por tarefa), então o id viaja por sessionStorage + evento — o mesmo mecanismo de
 * `OPEN_CAMPANHA_TASK_KEY`. Quem chama navega para `/time?section=comercial` em seguida.
 */
export const OPEN_COMERCIAL_TASK_KEY = "comercial:openTask";
export const OPEN_COMERCIAL_TASK_EVENT = "comercial:openTask:changed";

export function stageComercialTask(taskId: string): void {
  try {
    sessionStorage.setItem(OPEN_COMERCIAL_TASK_KEY, JSON.stringify({ taskId }));
  } catch {
    /* sem sessionStorage: abre só a seção */
  }
  window.dispatchEvent(new CustomEvent(OPEN_COMERCIAL_TASK_EVENT));
}

/** Lê e consome o id guardado (uma única vez). */
export function takeComercialTask(): string | undefined {
  try {
    const raw = sessionStorage.getItem(OPEN_COMERCIAL_TASK_KEY);
    if (!raw) return undefined;
    sessionStorage.removeItem(OPEN_COMERCIAL_TASK_KEY);
    return (JSON.parse(raw) as { taskId?: string }).taskId;
  } catch {
    return undefined;
  }
}
