import { createTableArrayStore } from "./table-array-store";

export const AEO_CATEGORIAS = ["A", "B", "C"] as const;
export type AeoCategoria = (typeof AEO_CATEGORIAS)[number];

export const AEO_CATEGORIA_LABEL: Record<AeoCategoria, string> = {
  A: "Brand Direct",
  B: "Share of Voice",
  C: "Intenção de Compra",
};

export const AEO_IDIOMAS = ["PT", "EN"] as const;
export type AeoIdioma = (typeof AEO_IDIOMAS)[number];

export const AEO_IAS = ["ChatGPT", "Perplexity", "Gemini", "Claude"] as const;
export type AeoIa = (typeof AEO_IAS)[number];

export const AEO_POSICOES = ["1", "2", "3", "4", "5+", "nao_se_aplica"] as const;
export type AeoPosicao = (typeof AEO_POSICOES)[number];
export const AEO_POSICAO_LABEL: Record<AeoPosicao, string> = {
  "1": "1ª",
  "2": "2ª",
  "3": "3ª",
  "4": "4ª",
  "5+": "5ª+",
  nao_se_aplica: "Não se aplica",
};

export const AEO_NARRATIVAS = ["positiva", "neutra", "negativa"] as const;
export type AeoNarrativa = (typeof AEO_NARRATIVAS)[number];
export const AEO_NARRATIVA_LABEL: Record<AeoNarrativa, string> = {
  positiva: "Positiva",
  neutra: "Neutra",
  negativa: "Negativa",
};

/** Uma rodada de monitoramento — antes era só uma string de data solta
 * dentro de cada resposta (`rodadaData`), sem linha própria. Status e
 * contagens NUNCA são armazenados aqui: são sempre computados ao vivo por
 * `computeRodadaProgresso` (aeo-engine.ts) a partir das respostas reais —
 * guardar isso junto reintroduziria a mesma classe de bug (dado derivado
 * que pode dessincronizar) que motivou esta refatoração. */
export type AeoRodada = {
  id: string;
  dataRodada: string; // YYYY-MM-DD
  createdAt: string;
};

export type AeoPrompt = {
  id: string;
  idCodigo: string; // ex: "A01"
  categoria: AeoCategoria;
  idioma: AeoIdioma;
  texto: string;
  ativo: boolean;
  createdAt: string;
};

export type AeoResposta = {
  id: string;
  rodadaId: string;
  promptId: string;
  ia: AeoIa;
  citada: boolean;
  /** undefined = ainda não respondida; forçado pra "nao_se_aplica" sempre
   * que citada=false (nunca fica solto/undefined nesse caso). */
  posicao?: AeoPosicao;
  /** Resposta bruta colada da IA — não existia antes desta refatoração. */
  rawResposta?: string;
  descricao?: string;
  /** Era `fonte?: string` (texto livre). Agora tags reais. */
  fontes: string[];
  /** Era uma string separada por vírgula. Agora tags reais. */
  concorrentes: string[];
  narrativa?: AeoNarrativa;
  /** LEGADO — data: URL base64 de antes desta refatoração. Nunca mais
   * escrita; convive com `evidenciaPath` pra não perder evidência antiga. */
  evidenciaUrl?: string;
  /** Path no bucket `aeo-evidencias` — usado por todo upload novo. */
  evidenciaPath?: string;
  createdAt: string;
  updatedAt?: string;
};

/** Normaliza uma linha que porventura ainda esteja no formato antigo (ex.:
 * criada na janela entre o backfill e o deploy do frontend novo) — mesmo
 * espírito de `normalizeMetaItem`. O backfill via SQL já convergiu os
 * dados reais; isso é só rede de segurança. */
function normalizeAeoResposta(raw: unknown): AeoResposta {
  const r = raw as Partial<AeoResposta> & {
    fonte?: string;
    rodadaData?: string;
  };
  return {
    ...r,
    fontes: Array.isArray(r.fontes) ? r.fontes : r.fonte ? [r.fonte] : [],
    concorrentes: Array.isArray(r.concorrentes) ? r.concorrentes : [],
    rodadaId: r.rodadaId ?? "",
  } as AeoResposta;
}

const rodadasStore = createTableArrayStore<AeoRodada>("aeo_rodadas");
const promptsStore = createTableArrayStore<AeoPrompt>("aeo_prompts");
const respostasStore = createTableArrayStore<AeoResposta>("aeo_respostas");

export function initAeoSync(): Promise<void> {
  const p1 = rodadasStore.init();
  const p2 = promptsStore.init();
  const p3 = respostasStore.init();
  rodadasStore.subscribeRealtime();
  promptsStore.subscribeRealtime();
  respostasStore.subscribeRealtime();
  return Promise.all([p1, p2, p3]).then(() => undefined);
}

export function loadAeoRodadas(): AeoRodada[] {
  return rodadasStore.get();
}
export function saveAeoRodadas(list: AeoRodada[]) {
  rodadasStore.set(() => list);
}
export function onAeoRodadasChange(callback: () => void): () => void {
  return rodadasStore.subscribe(callback);
}

export function createRodada(dataRodada: string): AeoRodada {
  const nova: AeoRodada = {
    id: crypto.randomUUID(),
    dataRodada,
    createdAt: new Date().toISOString(),
  };
  saveAeoRodadas([...loadAeoRodadas(), nova]);
  return nova;
}

export function loadAeoPrompts(): AeoPrompt[] {
  return promptsStore.get();
}
export function saveAeoPrompts(list: AeoPrompt[]) {
  promptsStore.set(() => list);
}
export function onAeoPromptsChange(callback: () => void): () => void {
  return promptsStore.subscribe(callback);
}

export function loadAeoRespostas(): AeoResposta[] {
  return respostasStore.get().map(normalizeAeoResposta);
}
export function saveAeoRespostas(list: AeoResposta[]) {
  respostasStore.set(() => list);
}
export function onAeoRespostasChange(callback: () => void): () => void {
  return respostasStore.subscribe(callback);
}

/** Único ponto de escrita de uma resposta — usado hoje pelo drawer de
 * edição manual e, no futuro, seria o mesmo ponto chamado por um webhook
 * de preenchimento automático (`POST /api/aeo/responses`), sem duplicar a
 * lógica de upsert-por-chave-natural em nenhum outro lugar. Chave natural:
 * rodadaId + promptId + ia. */
export function upsertAeoResposta(
  rodadaId: string,
  promptId: string,
  ia: AeoIa,
  patch: Partial<Omit<AeoResposta, "id" | "rodadaId" | "promptId" | "ia" | "createdAt">>,
): AeoResposta {
  const all = loadAeoRespostas();
  const existing = all.find(
    (r) => r.rodadaId === rodadaId && r.promptId === promptId && r.ia === ia,
  );
  const now = new Date().toISOString();
  if (existing) {
    const next: AeoResposta = { ...existing, ...patch, updatedAt: now };
    saveAeoRespostas(all.map((r) => (r.id === existing.id ? next : r)));
    return next;
  }
  const novo: AeoResposta = {
    id: crypto.randomUUID(),
    rodadaId,
    promptId,
    ia,
    citada: false,
    fontes: [],
    concorrentes: [],
    createdAt: now,
    ...patch,
  };
  saveAeoRespostas([...all, novo]);
  return novo;
}
