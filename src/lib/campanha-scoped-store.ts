import type { Influ } from "@/lib/influencer-model";
import type { Task } from "@/components/tasks/TaskBoard";
import { createScopedArrayStore } from "./scoped-table-store";
import { clientesStore, getDemoCampanhaIds } from "./clientes-store";
import { demoIdsKey, demoTaskIdsOf, withoutDemoCampanhas } from "./demo/demo-visibility";

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
 * portal do cliente. `date` é sempre uma data âncora (usada tal como está
 * pra itens únicos); quando `recurring` é true (só faz sentido pra clientes
 * recorrentes), o item se repete todo mês no dia-do-mês de `date` — ex: "dia
 * 5, envio do relatório de métricas" — em vez de precisar recriar o item
 * campanha a campanha/mês a mês. */
export type CronogramaItem = {
  id: string;
  date: string;
  title: string;
  description?: string;
  recurring?: boolean;
};

const influsStore = createScopedArrayStore<Influ>("campanha_influenciadores", "campanha_id", {
  name: "campaign_cycle_id",
  itemKey: "campaignCycleId",
});
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
  // REPLICA IDENTITY FULL) tenha deixado como "fantasma" no cache. Cada
  // resync baixa a tabela INTEIRA (todas as campanhas do workspace, não só
  // a aberta) — com várias abas ficando o dia todo abertas isso soma
  // bastante egress, então: intervalo bem mais espaçado (era 5 min) e pula
  // o ciclo enquanto a aba está em segundo plano (`document.hidden`), já
  // que o realtime continua cobrindo mudanças ao vivo nesse meio tempo.
  if (!resyncStarted) {
    resyncStarted = true;
    setInterval(() => {
      if (document.hidden) return;
      void influsStore.resync();
      void tarefasStore.resync();
      void docsStore.resync();
      void cronogramaStore.resync();
    }, 20 * 60_000);
  }
}

/**
 * A Demo (campanha de um cliente marcado `demoSessionId`) fica FORA de todo agregado
 * "de todas as campanhas" (`getAll*` abaixo) — mas continua acessível pelos acessores
 * por campanha (`load*(campanhaId)`), que o detalhe da campanha usa. Os ids vêm das
 * `campanhas[]` dos clientes marcados no store de clientes (sem consulta extra).
 *
 * Os assinantes (`on*Change`) também são avisados quando o CONJUNTO de campanhas de demo
 * muda (a Demo chegou ao cache depois dos dados da campanha), para quem agrega recalcular.
 */
function onDemoIdsChange(cb: () => void): () => void {
  let last = demoIdsKey(getDemoCampanhaIds());
  return clientesStore.subscribe(() => {
    const next = demoIdsKey(getDemoCampanhaIds());
    if (next === last) return;
    last = next;
    cb();
  });
}

function subscribeWithDemoIds(
  subscribe: (cb: () => void) => () => void,
  cb: () => void,
): () => void {
  const offs = [subscribe(cb), onDemoIdsChange(cb)];
  return () => offs.forEach((off) => off());
}

export function loadCampanhaInflus(campanhaId: string): Influ[] {
  return influsStore.get(campanhaId);
}
export function saveCampanhaInflus(campanhaId: string, list: Influ[]) {
  influsStore.set(campanhaId, () => list);
}
export function onCampanhaInflusChange(cb: () => void): () => void {
  return subscribeWithDemoIds(influsStore.subscribe, cb);
}
/** All campanha->influencers, for cross-campaign lookups (e.g. a bank
 * influencer's history across every campaign they've been part of). SEM as campanhas
 * de demonstração. */
export function getAllCampanhaInflus(): Map<string, Influ[]> {
  return withoutDemoCampanhas(influsStore.getAll(), getDemoCampanhaIds());
}

export function loadCampanhaTarefas(campanhaId: string): Task[] {
  return tarefasStore.get(campanhaId);
}
export function saveCampanhaTarefas(campanhaId: string, list: Task[]) {
  tarefasStore.set(campanhaId, () => list);
}
export function onCampanhaTarefasChange(cb: () => void): () => void {
  return subscribeWithDemoIds(tarefasStore.subscribe, cb);
}
/** All campanha->tarefas, para achar timers ativos em qualquer campanha
 * (indicador global no cabeçalho). SEM as campanhas de demonstração. */
export function getAllCampanhaTarefas(): Map<string, Task[]> {
  return withoutDemoCampanhas(tarefasStore.getAll(), getDemoCampanhaIds());
}

/** A tarefa (ou subtarefa) pertence a uma campanha de demonstração? Usado para a Demo não
 * contar no ledger de desempenho do time. */
export function isDemoTaskId(taskId: string): boolean {
  const demoIds = getDemoCampanhaIds();
  if (demoIds.size === 0) return false;
  return demoTaskIdsOf(tarefasStore.getAll(), demoIds).has(taskId);
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
