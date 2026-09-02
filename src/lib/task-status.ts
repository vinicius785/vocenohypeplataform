/** Única fonte de verdade pro status de tarefa e sua representação visual
 * (cor do badge/dot) — usado pelo Kanban, pelo modal de tarefa e pelo
 * `TaskPicker` (seletor de tarefas de Dependências), sempre a mesma
 * paleta/linguagem visual em qualquer lugar que mostre um status.
 * Movido pra cá (fora de `TaskBoard.tsx`) só pra `TaskPicker.tsx` poder
 * reaproveitar sem criar um import circular entre os dois arquivos —
 * `TaskBoard.tsx` reexporta os mesmos nomes, então nada que já importava
 * daqui precisou mudar. */
export type TaskStatus =
  | "Aberto"
  | "Em andamento"
  | "Em aprovação"
  | "Em ajustes"
  | "Aprovado"
  | "Concluído"
  | "Arquivado";

export const TASK_STATUSES: TaskStatus[] = [
  "Aberto",
  "Em andamento",
  "Em aprovação",
  "Em ajustes",
  "Aprovado",
  "Concluído",
  "Arquivado",
];

export const TASK_STATUS_TONE: Record<TaskStatus, string> = {
  Aberto: "bg-muted text-muted-foreground",
  "Em andamento": "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  "Em aprovação": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "Em ajustes": "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  Aprovado: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Concluído: "bg-foreground text-background",
  Arquivado: "bg-muted/60 text-muted-foreground line-through",
};

export const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  Aberto: "bg-muted-foreground/50",
  "Em andamento": "bg-sky-500",
  "Em aprovação": "bg-amber-500",
  "Em ajustes": "bg-orange-500",
  Aprovado: "bg-emerald-500",
  Concluído: "bg-foreground",
  Arquivado: "bg-muted-foreground/30",
};
