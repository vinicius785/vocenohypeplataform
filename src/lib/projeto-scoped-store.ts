import type { Influ } from "@/components/influenciadores/InfluencerBoard";
import { createScopedArrayStore } from "./scoped-table-store";

const influsStore = createScopedArrayStore<Influ>("projeto_influenciadores", "projeto_id");

let resyncStarted = false;

export async function initProjetoScopedSync(): Promise<void> {
  await influsStore.init();
  influsStore.subscribeRealtime();
  if (!resyncStarted) {
    resyncStarted = true;
    setInterval(() => void influsStore.resync(), 5 * 60_000);
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
