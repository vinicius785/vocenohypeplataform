/**
 * Normalização central de texto do Hypito — usada SÓ pra comparação e
 * busca (nunca altera o que fica salvo ou o que é mostrado pro usuário).
 * Uma única fonte pra "Poupatempo RJ" / "PoupatempoRJ" / "poupatempo-rj" /
 * "poupatempo rj" serem tratados como a mesma coisa, e pra "tarefs"
 * aproximar de "tarefa" (tolerância a erro de digitação) — em vez de
 * cada arquivo reimplementar sua própria variação de `.toLowerCase()`.
 *
 * Puro, sem I/O, 100% testável (`hypito-normalize.test.ts`).
 */

/** Minúsculas + sem acento + pontuação vira espaço + espaços colapsados
 * + trim. Base de qualquer comparação — nunca usada pra decidir o que
 * fica salvo no banco ou o que é exibido (isso sempre usa o texto
 * original). */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ") // pontuação -> espaço (preserva hífen, tratado à parte)
    .replace(/\s+/g, " ")
    .trim();
}

/** Mesmo texto, mas com hífens também virando espaço — usada quando se
 * quer comparar "poupatempo-rj" com "poupatempo rj" como equivalentes. */
export function normalizeLoose(text: string): string {
  return normalizeForMatch(text).replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

/** Mesmo texto, sem NENHUM espaço — usada pra comparar "PoupatempoRJ"
 * (escrito grudado) com "Poupatempo RJ" (com espaço) como equivalentes. */
export function normalizeCompact(text: string): string {
  return normalizeLoose(text).replace(/\s+/g, "");
}

export function tokenize(text: string): string[] {
  const n = normalizeLoose(text);
  return n ? n.split(" ").filter(Boolean) : [];
}

/** Palavras que carregam a INTENÇÃO, não o nome da entidade — removidas
 * só do texto de busca (nunca do nome armazenado). Inclui artigos,
 * preposições e as próprias palavras "campanha"/"projeto" quando usadas
 * como rótulo genérico (ex.: "campanha do Poupatempo" -> "poupatempo"). */
const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "no",
  "na",
  "sobre",
  "sobre",
  "pra",
  "para",
  "com",
  "e",
  "um",
  "uma",
  "que",
  "eh",
  "e",
  "campanha",
  "projeto",
  "queria",
  "gostaria",
  "saber",
  "consultar",
  "quero",
]);

/** Remove stopwords de um texto de BUSCA (nunca de um nome armazenado).
 * "campanha do Poupatempo" -> tokens ["poupatempo"]. Se remover tudo
 * (frase só de stopwords), devolve os tokens originais — nunca some com
 * o termo de busca inteiro. */
export function stripStopwordTokens(tokens: string[]): string[] {
  const kept = tokens.filter((t) => !STOPWORDS.has(t));
  return kept.length > 0 ? kept : tokens;
}

export function stripStopwords(text: string): string {
  return stripStopwordTokens(tokenize(text)).join(" ");
}

/** Distância de edição (Levenshtein) — usada só pra tolerância a erro de
 * digitação em palavras curtas (nomes de intenção, tokens de busca).
 * O(n*m), mas sempre chamada com strings curtas (< 30 chars). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = Array.from({ length: bl + 1 }, (_, i) => i);
  for (let i = 1; i <= al; i++) {
    const cur = [i];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[bl];
}

/** `true` quando `word` está "perto o bastante" de `target` pra ser
 * considerado o mesmo termo com erro de digitação — tolerância cresce
 * com o tamanho da palavra (1 erro em palavras curtas, até 2 em longas),
 * nunca deixando palavras completamente diferentes colidirem. */
export function isCloseTo(word: string, target: string): boolean {
  if (word === target) return true;
  const maxLen = Math.max(word.length, target.length);
  if (maxLen < 3) return false; // palavras muito curtas: só igualdade exata
  const tolerance = maxLen <= 5 ? 1 : maxLen <= 9 ? 2 : 3;
  return levenshtein(word, target) <= tolerance;
}

/** `true` se algum token de `text` (já normalizado/tokenizado) está
 * perto o bastante de algum dos `targets` — a base da tolerância a erro
 * de digitação no reconhecimento de intenção ("tarefs" ~ "tarefa"). */
export function hasCloseToken(tokens: string[], ...targets: string[]): boolean {
  return tokens.some((t) => targets.some((target) => isCloseTo(t, target)));
}

export type MatchScore = { score: number; reasons: string[] };

/** Pontua o quanto `queryRaw` corresponde a `candidateRaw` (nome real de
 * uma entidade) — usada pelo resolvedor genérico de entidades
 * (`hypito-entity-resolver.ts`). Score de 0 a 1; `reasons` é só pra
 * depuração/log interno, nunca mostrado ao usuário. */
export function scoreMatch(queryRaw: string, candidateRaw: string): MatchScore {
  const query = normalizeForMatch(queryRaw);
  const candidate = normalizeForMatch(candidateRaw);
  if (!query) return { score: 0, reasons: [] };

  if (candidateRaw.trim() === queryRaw.trim()) return { score: 1, reasons: ["exact_original"] };
  if (candidate === query) return { score: 0.98, reasons: ["exact_normalized"] };

  const queryCompact = normalizeCompact(queryRaw);
  const candidateCompact = normalizeCompact(candidateRaw);
  if (queryCompact === candidateCompact) return { score: 0.95, reasons: ["exact_compact"] };

  const queryTokens = stripStopwordTokens(tokenize(queryRaw));
  const candidateTokens = tokenize(candidateRaw);
  if (queryTokens.length === 0) return { score: 0, reasons: [] };

  // Igualdade EXATA de tokens só (não tolerante a erro de digitação aqui)
  // — um token colado como "PoupatempoRJ" não pode "vencer" via fuzzy
  // contra o token "Poupatempo" de UM candidato só, silenciando outros
  // candidatos igualmente plausíveis (ex.: "Poupatempo SP"). Correspondência
  // aproximada de token cai pro nível mais baixo (partial_tokens), abaixo.
  const allTokensPresent = queryTokens.every((qt) => candidateTokens.some((ct) => ct === qt));
  if (allTokensPresent) return { score: 0.9, reasons: ["all_tokens_present"] };

  if (candidate.includes(query) || query.includes(candidate)) {
    return { score: 0.75, reasons: ["substring"] };
  }

  const matchingTokens = queryTokens.filter((qt) =>
    candidateTokens.some((ct) => ct === qt || isCloseTo(ct, qt)),
  ).length;
  if (matchingTokens > 0) {
    const ratio = matchingTokens / Math.max(queryTokens.length, candidateTokens.length);
    if (ratio >= 0.5) return { score: 0.55 + ratio * 0.15, reasons: ["partial_tokens"] };
  }

  // Fuzzy geral (só pra strings curtas o bastante pra Levenshtein fazer sentido).
  if (Math.max(query.length, candidate.length) <= 40) {
    const dist = levenshtein(query, candidate);
    const maxLen = Math.max(query.length, candidate.length);
    const similarity = 1 - dist / maxLen;
    if (similarity >= 0.6) return { score: similarity * 0.6, reasons: ["fuzzy"] };
  }

  return { score: 0, reasons: [] };
}
