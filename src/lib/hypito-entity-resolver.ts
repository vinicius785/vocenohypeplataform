/**
 * Resolvedor genérico de entidades (campanha/projeto/pessoa/...) — puro,
 * opera sobre uma lista de candidatos já carregada (quem busca os
 * candidatos reais no banco, respeitando permissão/workspace, é sempre
 * quem chama — este módulo nunca acessa dado nenhum sozinho). Mesma
 * lógica pra qualquer tipo de entidade, em vez de cada ferramenta
 * reimplementar sua própria busca com `.includes()`.
 *
 * Ordem de resolução (pedido, seção 6): id explícito > nome exato >
 * nome normalizado > alias/variante > tokens > substring > fuzzy —
 * tudo isso já embutido em `scoreMatch` (`hypito-normalize.ts`); este
 * módulo só decide o que fazer com a pontuação (resolver sozinho, pedir
 * esclarecimento ou dizer que não achou).
 */
import { scoreMatch } from "@/lib/hypito-normalize";

export type EntityCandidate = { id: string; name: string };

export type ScoredCandidate<T extends EntityCandidate> = {
  entity: T;
  score: number;
  reasons: string[];
};

export type ResolveResult<T extends EntityCandidate> =
  | { kind: "resolved"; match: ScoredCandidate<T> }
  | { kind: "ambiguous"; candidates: ScoredCandidate<T>[] }
  | { kind: "not_found" };

/** Acima disso, resolve sozinho sem perguntar (correspondência clara). */
const AUTO_RESOLVE_THRESHOLD = 0.88;
/** Abaixo disso, o candidato nem entra na lista de sugestões. */
const MIN_SUGGEST_THRESHOLD = 0.45;
/** Se o 2º colocado está a menos que isso do 1º, os dois são "próximos"
 * o bastante pra virar uma pergunta de ambiguidade em vez de resolver
 * sozinho, mesmo que o 1º sozinho passasse do threshold automático. */
const AMBIGUITY_GAP = 0.08;
const MAX_CANDIDATES = 5;

export function resolveEntity<T extends EntityCandidate>(
  query: string,
  pool: T[],
): ResolveResult<T> {
  const q = query.trim();
  if (!q || pool.length === 0) return { kind: "not_found" };

  const scored = pool
    .map((entity) => {
      const { score, reasons } = scoreMatch(q, entity.name);
      return { entity, score, reasons };
    })
    .filter((c) => c.score >= MIN_SUGGEST_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { kind: "not_found" };

  const top = scored[0];
  const second = scored[1];

  if (
    top.score >= AUTO_RESOLVE_THRESHOLD &&
    (!second || top.score - second.score >= AMBIGUITY_GAP)
  ) {
    return { kind: "resolved", match: top };
  }

  // Mais de um candidato relevante e próximo o bastante -> pergunta,
  // nunca escolhe sozinho (pedido: "dois ou mais candidatos próximos:
  // perguntar qual deles").
  const close = scored.filter((c) => top.score - c.score < AMBIGUITY_GAP + 0.15);
  if (close.length > 1) {
    return { kind: "ambiguous", candidates: close.slice(0, MAX_CANDIDATES) };
  }

  // Só um candidato plausível, mas não forte o bastante pra confiar sem
  // perguntar — trata como sugestão única ("Você quis dizer X?").
  return { kind: "ambiguous", candidates: [top] };
}

/** Depois de uma pergunta de esclarecimento ("Você quis dizer X?"), a
 * resposta do usuário pode ser: uma confirmação curta ("sim"/"isso"), o
 * índice/nome de uma opção mostrada, ou um nome corrigido. Tenta as três
 * leituras nessa ordem. */
export function resolveFollowUp<T extends EntityCandidate>(
  reply: string,
  candidates: ScoredCandidate<T>[],
): T | "ambiguous" | null {
  const r = reply.trim().toLowerCase();
  const AFFIRM = [
    "sim",
    "isso",
    "exato",
    "esse",
    "essa",
    "isso mesmo",
    "correto",
    "é essa",
    "é esse",
    "sim é essa",
    "sim, é essa",
  ];
  if (candidates.length === 1 && AFFIRM.some((a) => r === a || r.startsWith(a))) {
    return candidates[0].entity;
  }
  const NEGATE = ["nao", "não", "nenhuma", "nenhum", "outra", "outro"];
  if (NEGATE.some((n) => r === n || r.startsWith(n))) return null;

  // Resposta com o nome (corrigido ou não) — resolve de novo contra os
  // MESMOS candidatos (não a base inteira), já que o usuário está
  // respondendo à pergunta específica.
  const pool = candidates.map((c) => c.entity);
  const result = resolveEntity(reply, pool);
  if (result.kind === "resolved") return result.match.entity;
  if (result.kind === "ambiguous" && result.candidates.length === 1) {
    return result.candidates[0].entity;
  }
  if (result.kind === "ambiguous") return "ambiguous";
  return null;
}
