import type { BlogPost } from "@/lib/projetos";

/**
 * Data editorial do artigo = a PRIMEIRA publicação. `firstPublishedAt` é gravado uma única vez e
 * nunca mais muda (despublicar, republicar ou editar não o alteram). `publishedAt` continua sendo o
 * momento da ÚLTIMA publicação e `publishDate`, o alvo do agendamento — nenhum dos dois é a data
 * editorial. Funções puras, sem UI nem banco.
 */

type Dates = Pick<BlogPost, "status" | "firstPublishedAt" | "publishedAt" | "publishDate">;

/** Melhor informação de uma publicação ANTERIOR (dados gravados antes de `firstPublishedAt`). */
function previousPublication(p: Dates): string | undefined {
  if (p.firstPublishedAt) return p.firstPublishedAt;
  if (p.publishedAt) return p.publishedAt;
  // Posts muito antigos não tinham `publishedAt`; despublicado só existe depois de publicado,
  // então `publishDate` ainda é o momento da publicação.
  if (p.status === "despublicado" && p.publishDate) return p.publishDate;
  return undefined;
}

/** Data a EXIBIR (cliente e time): primeira publicação; para dados legados, a melhor disponível. */
export function editorialDate(p: Dates): string | undefined {
  return p.firstPublishedAt || p.publishedAt || p.publishDate || undefined;
}

/**
 * Aplica a regra a toda gravação de artigo. `previous` é o estado ANTES da alteração (ou undefined
 * em artigo novo). Garante: (1) `firstPublishedAt` já gravado nunca muda; (2) uma publicação
 * anterior conhecida é preservada ANTES de `publishedAt`/`publishDate` serem sobrescritos
 * (republicar, agendar de novo); (3) só uma publicação efetiva (status `publicado`) de um artigo
 * nunca publicado define a data de agora — agendar não define.
 */
export function reconcilePublication(
  previous: BlogPost | undefined,
  next: BlogPost,
  nowIso: string,
): BlogPost {
  let first = previous?.firstPublishedAt ?? next.firstPublishedAt;
  if (!first && previous) first = previousPublication(previous);
  if (!first) first = previousPublication(next);
  // Primeira publicação de verdade: a data de agora (ou o `publishedAt` que o editor acabou de gravar).
  if (!first && next.status === "publicado") first = next.publishedAt || nowIso;
  return first === next.firstPublishedAt ? next : { ...next, firstPublishedAt: first };
}

const TZ = "America/Sao_Paulo";

/** "dd/mm/aaaa" da data editorial. Data pura não sofre fuso; instante ISO é lido no fuso do Brasil. */
export function formatEditorialDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return undefined;
  return t.toLocaleDateString("pt-BR", { timeZone: TZ });
}
