/**
 * Marketing tasks registry.
 * Stores references to tasks that live inside projects or campaigns and
 * should also appear in the shared "Marketing" kanban.
 *
 * A request is just a pointer — the actual task lives in its source
 * (project or campaign). Both the source view and the marketing kanban
 * read/write the same source, so updates reflect in both.
 */

import type { KanbanStatus } from "@/lib/projetos";
import type { TimeEntry, Activity } from "@/components/tasks/TaskBoard";
import { createTableArrayStore } from "@/lib/table-array-store";

export type MktSourceKind = "projeto" | "campanha";

/** Colunas do kanban de marketing — mesmas de Campanhas/Projetos. */
export type MktColumn =
  | "Aberto"
  | "Em andamento"
  | "Em aprovação"
  | "Em ajustes"
  | "Aprovado"
  | "Concluído"
  | "Arquivado";

export type MktRequest = {
  id: string;
  sourceKind: MktSourceKind;
  sourceId: string; // projeto id or campanha id
  taskId: string;
  requestedAt: string;
  note?: string;
};

export type MktStandalone = {
  id: string;
  title: string;
  status: MktColumn;
  /** Legado (um só responsável) — mantido só pra tarefas antigas; a UI de
   * hoje (TaskBoard) sempre grava em `assignees`. */
  assignee?: string;
  assignees?: string[];
  dueDate?: string;
  note?: string;
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

const requestsStore = createTableArrayStore<MktRequest>("marketing_tasks");
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
  const p = Promise.all([requestsStore.init(), standaloneStore.init()]);
  requestsStore.subscribeRealtime();
  standaloneStore.subscribeRealtime();
  return p.then(() => {
    migrateLegacyStandalone();
  });
}

export function loadRequests(): MktRequest[] {
  return requestsStore.get();
}

function save(list: MktRequest[]) {
  requestsStore.set(() => list);
}

export function onRequestsChange(cb: () => void): () => void {
  return requestsStore.subscribe(cb);
}

export function isRequested(kind: MktSourceKind, sourceId: string, taskId: string): boolean {
  return loadRequests().some(
    (r) => r.sourceKind === kind && r.sourceId === sourceId && r.taskId === taskId,
  );
}

export function requestForMarketing(kind: MktSourceKind, sourceId: string, taskId: string) {
  const list = loadRequests();
  if (list.some((r) => r.sourceKind === kind && r.sourceId === sourceId && r.taskId === taskId))
    return;
  list.push({
    id: crypto.randomUUID(),
    sourceKind: kind,
    sourceId,
    taskId,
    requestedAt: new Date().toISOString(),
  });
  save(list);
}

export function removeRequest(kind: MktSourceKind, sourceId: string, taskId: string) {
  save(
    loadRequests().filter(
      (r) => !(r.sourceKind === kind && r.sourceId === sourceId && r.taskId === taskId),
    ),
  );
}

/* Os status de projeto e campanha agora são idênticos aos da coluna. */

const ALLOWED: MktColumn[] = [
  "Aberto",
  "Em andamento",
  "Em aprovação",
  "Em ajustes",
  "Aprovado",
  "Concluído",
  "Arquivado",
];

function toColumn(status: string): MktColumn {
  // Compatibilidade com valores antigos (todo/doing/done).
  if (status === "todo") return "Aberto";
  if (status === "doing") return "Em andamento";
  if (status === "done") return "Concluído";
  return (ALLOWED as string[]).includes(status) ? (status as MktColumn) : "Aberto";
}

export function projetoStatusToColumn(status: string): MktColumn {
  return toColumn(status);
}

export function campanhaStatusToColumn(status: string): MktColumn {
  return toColumn(status);
}

export function columnToProjetoStatus(col: MktColumn): KanbanStatus {
  return col;
}

export function columnToCampanhaStatus(col: MktColumn): string {
  return col;
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
  dueDate?: string;
  note?: string;
  activity?: Activity[];
}): MktStandalone {
  const item: MktStandalone = {
    id: crypto.randomUUID(),
    title: input.title,
    status: input.status,
    assignee: input.assignee,
    assignees: input.assignees,
    dueDate: input.dueDate,
    note: input.note,
    activity: input.activity,
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
