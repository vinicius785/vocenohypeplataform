import type { Influ } from "@/components/influenciadores/InfluencerBoard";
import type { Task } from "@/components/tasks/TaskBoard";
import type { ProjetoFase } from "./roadmap-engine";
import { createScopedArrayStore } from "./scoped-table-store";

const influsStore = createScopedArrayStore<Influ>("projeto_influenciadores", "projeto_id");
const tarefasStore = createScopedArrayStore<Task>("projeto_tarefas", "projeto_id");
const fasesStore = createScopedArrayStore<ProjetoFase>("projeto_fases", "projeto_id");

let resyncStarted = false;

export async function initProjetoScopedSync(): Promise<void> {
  await Promise.all([influsStore.init(), tarefasStore.init(), fasesStore.init()]);
  influsStore.subscribeRealtime();
  tarefasStore.subscribeRealtime();
  fasesStore.subscribeRealtime();
  // Mesma lógica de campanha-scoped-store.ts: intervalo espaçado + pula
  // enquanto a aba está em segundo plano, pra não multiplicar egress
  // rebaixando a tabela inteira em toda aba aberta o dia todo.
  if (!resyncStarted) {
    resyncStarted = true;
    setInterval(() => {
      if (document.hidden) return;
      void influsStore.resync();
      void tarefasStore.resync();
      void fasesStore.resync();
    }, 20 * 60_000);
  }
}

export function loadProjetoInflus(projetoId: string): Influ[] {
  return influsStore.get(projetoId);
}
export function saveProjetoInflus(projetoId: string, list: Influ[]) {
  influsStore.set(projetoId, () => list);
}
export function onProjetoInflusChange(cb: () => void): () => void {
  return influsStore.subscribe(cb);
}

/** Tarefas de projeto — per-row (escopadas por `projeto_id`), como
 * campanha_tarefas. Antes viviam dentro de `Project.tasks` (array inteiro
 * gravado junto com o resto do projeto a cada edição): duas abas/pessoas
 * editando tarefas diferentes do mesmo projeto quase ao mesmo tempo fazia a
 * segunda gravação sobrescrever o array completo e apagar a tarefa que a
 * primeira acabara de criar, sem erro nenhum. Ver src/lib/projetos.ts
 * (`loadProjetos` sobrepõe as tarefas lidas daqui no campo `tasks`, então
 * quem já lê `project.tasks` continua funcionando sem mudança). */
export function loadProjetoTarefas(projetoId: string): Task[] {
  return tarefasStore.get(projetoId);
}
export function saveProjetoTarefas(projetoId: string, list: Task[]) {
  tarefasStore.set(projetoId, () => list);
}
export function onProjetoTarefasChange(cb: () => void): () => void {
  return tarefasStore.subscribe(cb);
}

/** Fases do roadmap de um projeto — per-row (`projeto_fases`, escopadas
 * por `projeto_id`), mesmo padrão de `loadProjetoTarefas` acima. Excluir
 * uma fase aqui NUNCA apaga as tarefas que apontam pra ela (o vínculo é
 * só `Task.roadmapPhaseId`, resolvido como "sem fase" quando o id não
 * existe mais — ver `tarefasSemFase` em `roadmap-engine.ts`). */
export function loadProjetoFases(projetoId: string): ProjetoFase[] {
  return fasesStore.get(projetoId);
}
export function saveProjetoFases(projetoId: string, list: ProjetoFase[]) {
  fasesStore.set(projetoId, () => list);
}
export function onProjetoFasesChange(cb: () => void): () => void {
  return fasesStore.subscribe(cb);
}
