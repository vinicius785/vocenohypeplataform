/** Regras do cronômetro (`time_entries`) ligadas à mudança de status da tarefa — um só lugar para
 * o board, o detalhe, as subtarefas e o card do Chat.
 *  - ENTRAR em "Em andamento" → começa a contar (para quem mudou o status);
 *  - SAIR de "Em andamento" (para qualquer outro status) → para/pausa;
 *  - "Concluído" sempre para, de onde vier.
 * "Parar" fecha a entrada atual com o tempo trabalhado; para retomar, basta iniciar de novo. */
export const IN_PROGRESS_STATUS = "Em andamento";
export const DONE_STATUS = "Concluído";

export function shouldStartTimerOnStatusChange(prev: string | undefined, next: string): boolean {
  return next === IN_PROGRESS_STATUS && prev !== IN_PROGRESS_STATUS;
}

export function shouldStopTimerOnStatusChange(prev: string | undefined, next: string): boolean {
  if (prev === next) return false;
  return next === DONE_STATUS || prev === IN_PROGRESS_STATUS;
}
