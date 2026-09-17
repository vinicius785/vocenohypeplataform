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
  | "Bloqueada"
  | "Concluído"
  | "Arquivado";

export const TASK_STATUSES: TaskStatus[] = [
  "Aberto",
  "Em andamento",
  "Em aprovação",
  "Em ajustes",
  "Aprovado",
  "Bloqueada",
  "Concluído",
  "Arquivado",
];

/** "Bloqueada" nunca é vermelho — bloqueio não é erro/cancelamento, é um
 * estado operacional de espera. Tom âmbar diferente de "Em aprovação"
 * (que também é âmbar) pra não colidir visualmente: aqui usamos
 * amber-600, mais escuro/saturado. */
export const TASK_STATUS_TONE: Record<TaskStatus, string> = {
  Aberto: "bg-muted text-muted-foreground",
  "Em andamento": "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  "Em aprovação": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "Em ajustes": "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  Aprovado: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Bloqueada: "bg-amber-600/15 text-amber-800 dark:text-amber-300",
  Concluído: "bg-foreground text-background",
  Arquivado: "bg-muted/60 text-muted-foreground line-through",
};

export const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  Aberto: "bg-muted-foreground/50",
  "Em andamento": "bg-sky-500",
  "Em aprovação": "bg-amber-500",
  "Em ajustes": "bg-orange-500",
  Aprovado: "bg-emerald-500",
  Bloqueada: "bg-amber-600",
  Concluído: "bg-foreground",
  Arquivado: "bg-muted-foreground/30",
};

/** Categoria interna de cada status — usada pra calcular progresso
 * (barra de subtarefas) e agrupar o seletor de status em vez de
 * depender do texto do status em si. `archived` fica fora do "ativo"
 * (não conta nem no total nem nas concluídas); `blocked` nunca conta
 * como concluída, mesmo sendo um estado "em andamento" na prática. */
export type TaskStatusCategory = "not_started" | "active" | "blocked" | "done" | "archived";

export const TASK_STATUS_CATEGORY: Record<TaskStatus, TaskStatusCategory> = {
  Aberto: "not_started",
  "Em andamento": "active",
  "Em aprovação": "active",
  "Em ajustes": "active",
  Bloqueada: "blocked",
  Aprovado: "done",
  Concluído: "done",
  Arquivado: "archived",
};

/** Rótulos dos 3 grupos do novo seletor de status das subtarefas —
 * "ATIVO" reúne `active` + `blocked` (bloqueada continua sendo um
 * trabalho em andamento, só impedido), "FINALIZADO" reúne `done` +
 * `archived`. */
export const TASK_STATUS_GROUP_LABEL: Record<
  "not_started" | "active_group" | "done_group",
  string
> = {
  not_started: "NÃO INICIADO",
  active_group: "ATIVO",
  done_group: "FINALIZADO",
};

export function groupForStatus(status: TaskStatus): "not_started" | "active_group" | "done_group" {
  const cat = TASK_STATUS_CATEGORY[status];
  if (cat === "not_started") return "not_started";
  if (cat === "active" || cat === "blocked") return "active_group";
  return "done_group";
}
