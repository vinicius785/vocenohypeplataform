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

/** Grupos do seletor de status (único em toda a plataforma): NÃO
 * INICIADO, ATIVO (inclui Bloqueada — trabalho em andamento, só
 * impedido), FINALIZADO (Aprovado/Concluído) e ARQUIVADO à parte. Só
 * organiza a lista; nenhuma regra de negócio depende do grupo. */
export type TaskStatusGroup = "not_started" | "active_group" | "done_group" | "archived_group";

export const TASK_STATUS_GROUP_ORDER: TaskStatusGroup[] = [
  "not_started",
  "active_group",
  "done_group",
  "archived_group",
];

export const TASK_STATUS_GROUP_LABEL: Record<TaskStatusGroup, string> = {
  not_started: "Não iniciado",
  active_group: "Ativo",
  done_group: "Finalizado",
  archived_group: "Arquivado",
};

export function groupForStatus(status: TaskStatus): TaskStatusGroup {
  const cat = TASK_STATUS_CATEGORY[status];
  if (cat === "not_started") return "not_started";
  if (cat === "active" || cat === "blocked") return "active_group";
  if (cat === "archived") return "archived_group";
  return "done_group";
}

/** Prioridade — importância, nunca estado: no vocabulário visual é só
 * ícone de bandeira + texto colorido (sem fundo), pra nunca competir com
 * o selo de status. "Urgente" continua existindo (regra do Score usa
 * Alta/Urgente como "alta prioridade"). */
export type TaskPriority = "Urgente" | "Alta" | "Normal" | "Baixa";
export const TASK_PRIORITIES: TaskPriority[] = ["Urgente", "Alta", "Normal", "Baixa"];
export const PRIORITY_TONE: Record<TaskPriority, string> = {
  Urgente: "text-red-600 dark:text-red-400",
  Alta: "text-amber-600 dark:text-amber-400",
  Normal: "text-sky-600 dark:text-sky-400",
  Baixa: "text-muted-foreground",
};
