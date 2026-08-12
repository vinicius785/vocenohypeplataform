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

/** Item do cronograma da campanha — setado manualmente pelo time (não
 * derivado das entregas dos influenciadores), mostrado internamente e no
 * portal do cliente. */
export type CronogramaItem = {
  id: string;
  date: string;
  title: string;
  description?: string;
};

const influsStore = createScopedArrayStore<Influ>("campanha_influenciadores", "campanha_id");
const tarefasStore = createScopedArrayStore<Task>("campanha_tarefas", "campanha_id");
const docsStore = createScopedArrayStore<CampaignDoc>("campanha_documentos", "campanha_id");
const cronogramaStore = createScopedArrayStore<CronogramaItem>(
  "campanha_cronograma",
  "campanha_id",
);

let resyncStarted = false;

export async function initCampanhaScopedSync(): Promise<void> {
  await Promise.all([
    influsStore.init(),
    tarefasStore.init(),
    docsStore.init(),
    cronogramaStore.init(),
  ]);
  influsStore.subscribeRealtime();
  tarefasStore.subscribeRealtime();
  docsStore.subscribeRealtime();
  cronogramaStore.subscribeRealtime();
  // Segunda trava além do realtime: re-busca essas tabelas do zero de
  // tempos em tempos, corrigindo qualquer drift que um evento perdido ou
  // mal aplicado (ex: DELETE sem a coluna do parent, antes de
  // REPLICA IDENTITY FULL) tenha deixado como "fantasma" no cache.
  if (!resyncStarted) {
    resyncStarted = true;
    setInterval(() => {
      void influsStore.resync();
      void tarefasStore.resync();
      void docsStore.resync();
      void cronogramaStore.resync();
    }, 5 * 60_000);
  }
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

export function loadCampanhaCronograma(campanhaId: string): CronogramaItem[] {
  return cronogramaStore.get(campanhaId);
}
export function saveCampanhaCronograma(campanhaId: string, list: CronogramaItem[]) {
  cronogramaStore.set(campanhaId, () => list);
}
export function onCampanhaCronogramaChange(cb: () => void): () => void {
  return cronogramaStore.subscribe(cb);
}

/** Apaga tudo que estava escopado a uma campanha (influs/tarefas/docs/
 * cronograma) — chamar sempre que a campanha em si for excluída. Sem isso
 * essas linhas ficam orfãs no banco (a campanha nem existe mais em
 * `clientes.data`, mas a tarefa/influ/doc/item de cronograma continua lá) e
 * reaparecem em telas que agregam "tudo de todas as campanhas" (ex: "Meu
 * trabalho" no Início), sem jeito de acessar ou excluir pela UI normal. */
export function deleteCampanhaScopedData(campanhaId: string) {
  influsStore.set(campanhaId, () => []);
  tarefasStore.set(campanhaId, () => []);
  docsStore.set(campanhaId, () => []);
  cronogramaStore.set(campanhaId, () => []);
}
