import type { Influ } from "@/components/influenciadores/InfluencerBoard";
import type { Task } from "@/components/tasks/TaskBoard";
import { createScopedArrayStore } from "./scoped-table-store";

export type CampaignDoc = {
  id: string;
  tipo: "link" | "anexo";
  titulo: string;
  url: string;
  arquivoNome?: string;
  criadoEm: string;
};

const influsStore = createScopedArrayStore<Influ>("campanha_influenciadores", "campanha_id");
const tarefasStore = createScopedArrayStore<Task>("campanha_tarefas", "campanha_id");
const docsStore = createScopedArrayStore<CampaignDoc>("campanha_documentos", "campanha_id");

export async function initCampanhaScopedSync(): Promise<void> {
  await Promise.all([influsStore.init(), tarefasStore.init(), docsStore.init()]);
  influsStore.subscribeRealtime();
  tarefasStore.subscribeRealtime();
  docsStore.subscribeRealtime();
}

export function loadCampanhaInflus(campanhaId: string): Influ[] {
  return influsStore.get(campanhaId);
}
export function saveCampanhaInflus(campanhaId: string, list: Influ[]) {
  influsStore.set(campanhaId, () => list);
}
export function onCampanhaInflusChange(cb: () => void): () => void {
  return influsStore.subscribe(cb);
}
/** All campanha->influencers, for cross-campaign lookups (e.g. a bank
 * influencer's history across every campaign they've been part of). */
export function getAllCampanhaInflus(): Map<string, Influ[]> {
  return influsStore.getAll();
}

export function loadCampanhaTarefas(campanhaId: string): Task[] {
  return tarefasStore.get(campanhaId);
}
export function saveCampanhaTarefas(campanhaId: string, list: Task[]) {
  tarefasStore.set(campanhaId, () => list);
}
export function onCampanhaTarefasChange(cb: () => void): () => void {
  return tarefasStore.subscribe(cb);
}
/** All campanha->tarefas, para achar timers ativos em qualquer campanha
 * (indicador global no cabeçalho). */
export function getAllCampanhaTarefas(): Map<string, Task[]> {
  return tarefasStore.getAll();
}

export function loadCampanhaDocs(campanhaId: string): CampaignDoc[] {
  return docsStore.get(campanhaId);
}
export function saveCampanhaDocs(campanhaId: string, list: CampaignDoc[]) {
  docsStore.set(campanhaId, () => list);
}
export function onCampanhaDocsChange(cb: () => void): () => void {
  return docsStore.subscribe(cb);
}
