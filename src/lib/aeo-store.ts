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

export const AEO_POSICOES = ["1", "2", "3", "Não apareceu"] as const;
export type AeoPosicao = (typeof AEO_POSICOES)[number];

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
  rodadaData: string; // YYYY-MM-DD
  promptId: string;
  ia: AeoIa;
  citada: boolean;
  posicao?: AeoPosicao;
  descricao?: string;
  fonte?: string;
  concorrentes?: string;
  narrativeScore?: number; // 1-5, manual
  evidenciaNome?: string;
  evidenciaUrl?: string;
  createdAt: string;
  updatedAt?: string;
};

const promptsStore = createTableArrayStore<AeoPrompt>("aeo_prompts");
const respostasStore = createTableArrayStore<AeoResposta>("aeo_respostas");

export function initAeoSync(): Promise<void> {
  const p1 = promptsStore.init();
  const p2 = respostasStore.init();
  promptsStore.subscribeRealtime();
  respostasStore.subscribeRealtime();
  return Promise.all([p1, p2]).then(() => undefined);
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
  return respostasStore.get();
}
export function saveAeoRespostas(list: AeoResposta[]) {
  respostasStore.set(() => list);
}
export function onAeoRespostasChange(callback: () => void): () => void {
  return respostasStore.subscribe(callback);
}

/** Todas as datas de rodada já registradas, mais recente primeiro. */
export function aeoRodadas(respostas: AeoResposta[]): string[] {
  return Array.from(new Set(respostas.map((r) => r.rodadaData))).sort((a, b) => b.localeCompare(a));
}

/** % de prompts respondidos nessa rodada+IA onde a VNH foi citada. */
export function aiVisibilityScore(respostas: AeoResposta[], rodada: string, ia: AeoIa): number {
  const subset = respostas.filter((r) => r.rodadaData === rodada && r.ia === ia);
  if (subset.length === 0) return 0;
  const citadas = subset.filter((r) => r.citada).length;
  return Math.round((citadas / subset.length) * 100);
}

/** % das citações (citada=true) em que a VNH ficou em 1º lugar. */
export function shareOfAnswers(respostas: AeoResposta[], rodada: string, ia: AeoIa): number {
  const citadas = respostas.filter((r) => r.rodadaData === rodada && r.ia === ia && r.citada);
  if (citadas.length === 0) return 0;
  const primeiro = citadas.filter((r) => r.posicao === "1").length;
  return Math.round((primeiro / citadas.length) * 100);
}

/** Visibility score por categoria (A/B/C), pra uma rodada — todas as IAs juntas. */
export function categoryScore(
  respostas: AeoResposta[],
  prompts: AeoPrompt[],
  rodada: string,
): Record<AeoCategoria, number> {
  const promptById = new Map(prompts.map((p) => [p.id, p]));
  const result: Record<AeoCategoria, number> = { A: 0, B: 0, C: 0 };
  for (const cat of AEO_CATEGORIAS) {
    const subset = respostas.filter(
      (r) => r.rodadaData === rodada && promptById.get(r.promptId)?.categoria === cat,
    );
    if (subset.length === 0) continue;
    const citadas = subset.filter((r) => r.citada).length;
    result[cat] = Math.round((citadas / subset.length) * 100);
  }
  return result;
}

/** Prompts que nunca tiveram a VNH citada em nenhuma rodada/IA — maior oportunidade. */
export function promptsZero(respostas: AeoResposta[], prompts: AeoPrompt[]): AeoPrompt[] {
  const everCited = new Set(respostas.filter((r) => r.citada).map((r) => r.promptId));
  const everAsked = new Set(respostas.map((r) => r.promptId));
  return prompts.filter((p) => everAsked.has(p.id) && !everCited.has(p.id));
}

/** Ranking de prompts por nº de citações (mais citado primeiro). */
export function rankingPrompts(
  respostas: AeoResposta[],
  prompts: AeoPrompt[],
): { prompt: AeoPrompt; citacoes: number; total: number }[] {
  const promptById = new Map(prompts.map((p) => [p.id, p]));
  const counts = new Map<string, { citacoes: number; total: number }>();
  for (const r of respostas) {
    const c = counts.get(r.promptId) ?? { citacoes: 0, total: 0 };
    c.total += 1;
    if (r.citada) c.citacoes += 1;
    counts.set(r.promptId, c);
  }
  return Array.from(counts.entries())
    .map(([promptId, c]) => ({ prompt: promptById.get(promptId), ...c }))
    .filter((x): x is { prompt: AeoPrompt; citacoes: number; total: number } => !!x.prompt)
    .sort((a, b) => b.citacoes - a.citacoes);
}

/** Concorrentes citados junto (texto livre, separado por vírgula) — contagem de frequência. */
export function competitorFrequency(respostas: AeoResposta[]): { nome: string; vezes: number }[] {
  const counts = new Map<string, number>();
  for (const r of respostas) {
    if (!r.concorrentes) continue;
    for (const raw of r.concorrentes.split(",")) {
      const nome = raw.trim();
      if (!nome) continue;
      counts.set(nome, (counts.get(nome) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([nome, vezes]) => ({ nome, vezes }))
    .sort((a, b) => b.vezes - a.vezes);
}

/** Recomendação automática simples: aponta a pior combinação categoria×idioma
 * (visibility 0% com pelo menos uma resposta registrada). */
export function recomendacaoAutomatica(
  respostas: AeoResposta[],
  prompts: AeoPrompt[],
  rodada: string,
): string | null {
  const promptById = new Map(prompts.map((p) => [p.id, p]));
  let pior: { categoria: AeoCategoria; idioma: AeoIdioma; score: number; total: number } | null =
    null;
  for (const cat of AEO_CATEGORIAS) {
    for (const idioma of AEO_IDIOMAS) {
      const subset = respostas.filter((r) => {
        if (r.rodadaData !== rodada) return false;
        const p = promptById.get(r.promptId);
        return p?.categoria === cat && p?.idioma === idioma;
      });
      if (subset.length === 0) continue;
      const citadas = subset.filter((r) => r.citada).length;
      const score = Math.round((citadas / subset.length) * 100);
      if (!pior || score < pior.score)
        pior = { categoria: cat, idioma, score, total: subset.length };
    }
  }
  if (!pior || pior.score > 20) return null;
  return `Categoria ${pior.categoria} (${AEO_CATEGORIA_LABEL[pior.categoria]}) em ${pior.idioma === "EN" ? "inglês" : "português"} está com ${pior.score}% de visibilidade — priorizar conteúdo AEO nesse recorte.`;
}
