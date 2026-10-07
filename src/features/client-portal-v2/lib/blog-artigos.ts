import type { PublicArticle } from "@/lib/portal-types";

/** Blog do Portal V2 — regras puras. A elegibilidade (publicado + cliente em `portalClienteIds`)
 * é decidida no SERVIDOR (`findArtigosDoCliente`); aqui só se ordena e se apresenta. */

/** O item "Blog" do menu só existe quando há ao menos um artigo visível. */
export function hasBlogArtigos(artigos: readonly PublicArticle[] | undefined): boolean {
  return (artigos?.length ?? 0) > 0;
}

/** Mais recentes primeiro (o servidor já ordena; reordenar aqui não depende disso). */
export function sortArtigos(artigos: readonly PublicArticle[]): PublicArticle[] {
  return [...artigos].sort((a, b) => (b.publishDate ?? "").localeCompare(a.publishDate ?? ""));
}

export function findArtigo(
  artigos: readonly PublicArticle[],
  postId: string | undefined,
): PublicArticle | null {
  if (!postId) return null;
  return artigos.find((a) => a.id === postId) ?? null;
}

/** "2026-09-03" ou ISO com hora → "03/09/2026". Sem data válida → undefined. */
export function artigoDateLabel(publishDate: string | undefined): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(publishDate ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : undefined;
}

/** Resumo da lista: `excerpt`, ou o começo do texto sem marcações de markdown. */
export function artigoSummary(a: Pick<PublicArticle, "excerpt" | "content">, max = 160): string {
  const raw = (a.excerpt?.trim() || a.content || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return raw.length > max ? `${raw.slice(0, max - 1).trimEnd()}…` : raw;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-10-07" ou ISO com hora → "07 out. 2026". */
export function artigoDateLongLabel(publishDate: string | undefined): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(publishDate ?? "");
  const mes = m ? MESES[Number(m[2]) - 1] : undefined;
  return m && mes ? `${m[3]} ${mes}. ${m[1]}` : undefined;
}
