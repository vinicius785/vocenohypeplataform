import type { BlogComment, BlogEngagement } from "@/lib/blog-engagement";

/** Regras puras de curtidas/comentários do leitor. O servidor continua sendo a fonte da verdade. */

export const COMMENT_MAX = 2000;

/** Curtir/descurtir otimista: inverte o estado e ajusta a contagem (nunca abaixo de 0). */
export function toggleLikeOptimistic(e: BlogEngagement): BlogEngagement {
  return {
    ...e,
    likedByMe: !e.likedByMe,
    likeCount: Math.max(0, e.likeCount + (e.likedByMe ? -1 : 1)),
  };
}

/** Mais recentes primeiro (o servidor devolve do mais antigo ao mais novo). */
export function newestFirst(comments: readonly BlogComment[]): BlogComment[] {
  return [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Comentário provisório mostrado na hora, até o servidor confirmar (a lista é recarregada). */
export function pendingComment(body: string, authorLabel: string, nowIso: string): BlogComment {
  return {
    id: `pending:${nowIso}`,
    authorLabel,
    authorKind: "cliente",
    body,
    createdAt: nowIso,
  };
}

/** Texto do comentário pronto para enviar, ou null se vazio/longo demais. */
export function normalizeComment(raw: string): string | null {
  const body = raw.trim();
  return body.length > 0 && body.length <= COMMENT_MAX ? body : null;
}

export function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "agora", "5 min", "2 h", "3 d" e, depois de uma semana, "07 out." */
export function relativeTime(iso: string, nowMs: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d`;
  const d = new Date(t);
  const meses = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  return `${String(d.getDate()).padStart(2, "0")} ${meses[d.getMonth()]}.`;
}
