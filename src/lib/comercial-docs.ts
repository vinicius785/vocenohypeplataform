/**
 * Documentos do Comercial (Recursos → Documentos). Mesmo modelo dos documentos de
 * campanha (`CampaignDoc`: link ou anexo), em tabela própria (`comercial_documentos`).
 */
import type { CampaignDoc } from "@/lib/campanha-scoped-store";
import { createTableArrayStore } from "@/lib/table-array-store";

const store = createTableArrayStore<CampaignDoc>("comercial_documentos");

let started: Promise<void> | null = null;

/** Carrega e assina o realtime uma única vez, sob demanda. */
export function initComercialDocsSync(): Promise<void> {
  started ??= store.init().then(() => store.subscribeRealtime());
  return started;
}

export const loadComercialDocs = (): CampaignDoc[] => store.get();
export const onComercialDocsChange = (cb: () => void) => store.subscribe(cb);

/** Aplica ao banco a diferença entre a lista atual e a que a ferramenta devolveu. */
export function saveComercialDocs(next: CampaignDoc[]): void {
  store.set(() => next);
}
