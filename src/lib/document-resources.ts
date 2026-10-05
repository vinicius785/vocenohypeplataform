/** Modelo e regras puras do recurso DOCUMENTOS — o mesmo para Projetos, Campanhas e Comercial.
 * Cada contexto converte o SEU dado (DocItem, CampaignDoc…) para `DocumentResource` e de volta;
 * a persistência continua sendo de cada contexto. */
export type DocSourceType =
  | "google_docs"
  | "google_sheets"
  | "google_slides"
  | "google_drive"
  | "figma"
  | "miro"
  | "notion"
  | "canva"
  | "link"
  | "file";

/** Origem de um LINK (tudo menos anexo) — o tipo que `detectSourceType` devolve. */
export type LinkSourceType = Exclude<DocSourceType, "file">;

export type DocumentResource = {
  id: string;
  title: string;
  url: string;
  /** `link` abre numa nova aba; `file` é um anexo (baixa). */
  kind: "link" | "file";
  fileName?: string;
  sourceType: DocSourceType;
  /** Só contextos com categorias (Projetos). */
  category?: string;
  /** Só contextos que permitem fixar (Projetos). */
  pinned?: boolean;
  createdAt?: string;
};

/** Entrada do formulário compartilhado de "adicionar". */
export type DocumentInput = {
  kind: "link" | "file";
  title: string;
  url: string;
  fileName?: string;
  category?: string;
};

export const SOURCE_LABEL: Record<DocSourceType, string> = {
  google_docs: "Google Docs",
  google_sheets: "Google Sheets",
  google_slides: "Google Slides",
  google_drive: "Google Drive",
  figma: "Figma",
  miro: "Miro",
  notion: "Notion",
  canva: "Canva",
  link: "Link externo",
  file: "Arquivo",
};

/** Detecta a origem só pelo hostname — nunca falha nem bloqueia o cadastro (URL inválida cai em
 * "link"). Não busca o título real da página (exigiria chamada de servidor e cuidado com SSRF). */
export function detectSourceType(url: string): LinkSourceType {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return "link";
  }
  if (host.includes("docs.google.com")) return "google_docs";
  if (host.includes("sheets.google.com")) return "google_sheets";
  if (host.includes("slides.google.com")) return "google_slides";
  if (host.includes("drive.google.com")) return "google_drive";
  if (host.includes("figma.com")) return "figma";
  if (host.includes("miro.com")) return "miro";
  if (host.includes("notion.so") || host.includes("notion.site")) return "notion";
  if (host.includes("canva.com")) return "canva";
  return "link";
}

export type DocumentFilters = {
  query: string;
  /** `null` = todas. */
  category: string | null;
  /** `null` = todos os tipos. */
  sourceType: DocSourceType | null;
};

export const NO_FILTERS: DocumentFilters = { query: "", category: null, sourceType: null };

/** Busca por nome/link/arquivo + filtros; preserva a ordem original. */
export function filterResources(
  docs: readonly DocumentResource[],
  f: DocumentFilters,
): DocumentResource[] {
  const q = f.query.trim().toLowerCase();
  return docs.filter((d) => {
    if (
      q &&
      !d.title.toLowerCase().includes(q) &&
      !d.url.toLowerCase().includes(q) &&
      !(d.fileName ?? "").toLowerCase().includes(q)
    ) {
      return false;
    }
    if (f.category && d.category !== f.category) return false;
    if (f.sourceType && d.sourceType !== f.sourceType) return false;
    return true;
  });
}

/** Fixados primeiro (ordenação estável: a ordem relativa dentro de cada grupo não muda). */
export function sortResources(docs: readonly DocumentResource[], pinFirst: boolean) {
  if (!pinFirst) return [...docs];
  return [...docs].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
}

/** Tipos de origem presentes, para montar o filtro só com o que existe. */
export function presentSourceTypes(docs: readonly DocumentResource[]): DocSourceType[] {
  const seen = new Set<DocSourceType>();
  for (const d of docs) seen.add(d.sourceType);
  return [...seen].sort((a, b) => SOURCE_LABEL[a].localeCompare(SOURCE_LABEL[b], "pt-BR"));
}

export function countActiveFilters(f: DocumentFilters): number {
  return (f.category ? 1 : 0) + (f.sourceType ? 1 : 0);
}

/** Título final de um novo documento: o digitado, senão o link/nome do arquivo. */
export function resolveTitle(input: { title: string; url: string; fileName?: string }): string {
  return input.title.trim() || input.fileName || input.url.trim();
}
