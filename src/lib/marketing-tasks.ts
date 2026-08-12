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

const STANDALONE_KEY = "marketing:standalone";
const EVENT = "marketing:tasks:changed";

export type MktStandalone = {
  id: string;
  title: string;
  status: MktColumn;
  assignee?: string;
  dueDate?: string;
  note?: string;
  createdAt: string;
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

export function initMarketingTasksSync(): Promise<void> {
  const p = requestsStore.init();
  requestsStore.subscribeRealtime();
  return p;
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
  try {
    const raw = localStorage.getItem(STANDALONE_KEY);
    return raw ? (JSON.parse(raw) as MktStandalone[]) : [];
  } catch {
    return [];
  }
}

function saveStandalone(list: MktStandalone[]) {
  localStorage.setItem(STANDALONE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

export function onStandaloneChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function createStandalone(input: {
  title: string;
  status: MktColumn;
  assignee?: string;
  dueDate?: string;
  note?: string;
}): MktStandalone {
  const item: MktStandalone = {
    id: crypto.randomUUID(),
    title: input.title,
    status: input.status,
    assignee: input.assignee,
    dueDate: input.dueDate,
    note: input.note,
    createdAt: new Date().toISOString(),
  };
  saveStandalone([...loadStandalone(), item]);
  return item;
}

export function updateStandalone(
  id: string,
  patch: Partial<Omit<MktStandalone, "id" | "createdAt">>,
) {
  saveStandalone(loadStandalone().map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

export function removeStandalone(id: string) {
  saveStandalone(loadStandalone().filter((s) => s.id !== id));
}
