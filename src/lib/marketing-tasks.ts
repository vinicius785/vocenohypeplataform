/**
 * Marketing tasks registry — tarefas avulsas criadas direto no kanban
 * compartilhado do Marketing (não vinculadas a projeto/campanha).
 */

import type {
  TimeEntry,
  Activity,
  Comment,
  DeadlineChangeEntry,
  TaskPriority,
  Attachment,
  Task,
} from "@/components/tasks/TaskBoard";
import type { RichDoc } from "@/lib/rich-text";
import { createTableArrayStore } from "@/lib/table-array-store";
import type { TaskRecurrence } from "@/lib/task-recurrence";

/** Colunas do kanban de marketing — mesmas de Campanhas/Projetos. */
export type MktColumn =
  | "Aberto"
  | "Em andamento"
  | "Em aprovação"
  | "Em ajustes"
  | "Aprovado"
  | "Concluído"
  | "Arquivado";

export type MktStandalone = {
  id: string;
  title: string;
  status: MktColumn;
  /** Legado (um só responsável) — mantido só pra tarefas antigas; a UI de
   * hoje (TaskBoard) sempre grava em `assignees`. */
  assignee?: string;
  assignees?: string[];
  /** Ver comentário equivalente em `TaskBoard.tsx`'s `Task.primaryAssignee`. */
  primaryAssignee?: string;
  /** Sem estes 5 campos, uma tarefa avulsa do Marketing nunca guardava
   * prioridade/etiquetas/anexos/subtarefas/início de verdade — cada um
   * "resetava" pro padrão (prioridade sempre "Normal", resto sempre
   * vazio) a cada leitura, porque o tipo nunca tinha onde persisti-los,
   * mesmo a UI (TaskBoard) já editando todos eles normalmente. */
  priority?: TaskPriority;
  tags?: string[];
  attachments?: Attachment[];
  subtasks?: Task[];
  startDate?: string;
  estimate?: string;
  dueDate?: string;
  /** Mesmo formato de `Task.description` (doc estruturado do editor
   * rich-text) — aceita `string` pra registros antigos ainda não
   * convertidos. */
  note?: RichDoc | string;
  noteText?: string;
  createdAt: string;
  /** Espelha `Task.timerRunning`/`timerStartedAt`/`timeEntries` — sem
   * esses campos aqui, o timer que inicia/para sozinho ao mudar de status
   * (`withStatusChange`, em TaskBoard.tsx) nunca era persistido pra uma
   * tarefa avulsa do Marketing: a mudança acontecia só no objeto em
   * memória repassado pro `onChange`, e o patch salvo em
   * `updateStandalone` não tinha onde guardá-la — na próxima leitura o
   * timer "voltava" a aparecer rodando (ou nunca aparecia parado). */
  timerRunning?: boolean;
  timerStartedAt?: string;
  timeEntries?: TimeEntry[];
  /** Sem isso, uma tarefa avulsa reaberta sempre chegava ao diálogo sem
   * histórico — o diálogo então fabricava um "criou esta tarefa" na hora,
   * atribuído a quem só estava ABRINDO pra olhar, não a quem realmente
   * criou. Persistindo o log de verdade aqui, cada evento fica com o
   * autor certo (`getCurrentAuthor()` no momento real da ação). */
  activity?: Activity[];
  /** Sem isso, todo comentário postado numa tarefa avulsa do Marketing
   * era descartado silenciosamente a cada save — o tipo nunca ganhou
   * este campo quando os outros (activity/completedAt/etc.) foram
   * adicionados. */
  comments?: Comment[];
  completedAt?: string;
  originalDueDate?: string;
  performanceDueDate?: string;
  deadlineHistory?: DeadlineChangeEntry[];
  /** Ver comentário equivalente em `TaskBoard.tsx`'s `Task.recurrence`. */
  recurrence?: TaskRecurrence;
};

export const MKT_COLUMNS: { key: MktColumn; label: string; color: string }[] = [
  { key: "Aberto", label: "Aberto", color: "bg-muted-foreground/50" },
  { key: "Em andamento", label: "Em andamento", color: "bg-sky-500" },
  { key: "Em aprovação", label: "Em aprovação", color: "bg-amber-500" },
  { key: "Em ajustes", label: "Em ajustes", color: "bg-orange-500" },
  { key: "Aprovado", label: "Aprovado", color: "bg-emerald-500" },
  { key: "Concluído", label: "Concluído", color: "bg-foreground" },
  { key: "Arquivado", label: "Arquivado", color: "bg-muted-foreground/30" },
];

const standaloneStore = createTableArrayStore<MktStandalone>("marketing_standalone_tasks");

/** Tarefas avulsas do Marketing viviam só em localStorage
 * ("marketing:standalone") antes desta tabela existir — sem sincronizar
 * entre pessoas/dispositivos e somem se o navegador limpar os dados. Se
 * este navegador ainda tem alguma sobrando (nunca migrada), recupera pra
 * tabela de verdade uma única vez e limpa a chave antiga. */
const LEGACY_STANDALONE_KEY = "marketing:standalone";
function migrateLegacyStandalone() {
  try {
    const raw = localStorage.getItem(LEGACY_STANDALONE_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw) as MktStandalone[];
    if (Array.isArray(legacy) && legacy.length > 0) {
      const existingIds = new Set(standaloneStore.get().map((s) => s.id));
      const toAdd = legacy.filter((s) => s?.id && !existingIds.has(s.id));
      if (toAdd.length > 0) standaloneStore.set((prev) => [...prev, ...toAdd]);
    }
    localStorage.removeItem(LEGACY_STANDALONE_KEY);
  } catch {
    /* ignore */
  }
}

export function initMarketingTasksSync(): Promise<void> {
  return standaloneStore.init().then(() => {
    standaloneStore.subscribeRealtime();
    migrateLegacyStandalone();
  });
}

export function loadStandalone(): MktStandalone[] {
  return standaloneStore.get();
}

export function onStandaloneChange(cb: () => void): () => void {
  return standaloneStore.subscribe(cb);
}

export function createStandalone(input: {
  title: string;
  status: MktColumn;
  assignee?: string;
  assignees?: string[];
  primaryAssignee?: string;
  priority?: TaskPriority;
  tags?: string[];
  attachments?: Attachment[];
  subtasks?: Task[];
  startDate?: string;
  estimate?: string;
  dueDate?: string;
  note?: RichDoc | string;
  noteText?: string;
  activity?: Activity[];
  comments?: Comment[];
}): MktStandalone {
  const item: MktStandalone = {
    id: crypto.randomUUID(),
    title: input.title,
    status: input.status,
    assignee: input.assignee,
    assignees: input.assignees,
    primaryAssignee: input.primaryAssignee,
    priority: input.priority,
    tags: input.tags,
    attachments: input.attachments,
    subtasks: input.subtasks,
    startDate: input.startDate,
    estimate: input.estimate,
    dueDate: input.dueDate,
    note: input.note,
    noteText: input.noteText,
    activity: input.activity,
    comments: input.comments,
    createdAt: new Date().toISOString(),
  };
  standaloneStore.set((prev) => [...prev, item]);
  return item;
}

export function updateStandalone(
  id: string,
  patch: Partial<Omit<MktStandalone, "id" | "createdAt">>,
) {
  standaloneStore.set((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

export function removeStandalone(id: string) {
  standaloneStore.set((prev) => prev.filter((s) => s.id !== id));
}

/** Igual a `createStandalone`, mas preserva o `id` recebido em vez de
 * gerar um novo — usada só por "Mover tarefa" (`src/lib/move-task.ts`):
 * mover uma tarefa PRA cá tem que manter o mesmo id de origem, senão
 * dependências (`task_dependencies`, guardadas só pelo id cru da
 * tarefa) e qualquer link cruzado apontando pra ela quebrariam. */
export function insertStandaloneWithId(item: MktStandalone) {
  standaloneStore.set((prev) => [...prev, item]);
}
