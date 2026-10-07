import type { PortalSessionData } from "@/components/portal/portal-session-context";
import { inferFileKind, type ClientFileKind } from "./client-file-format";

/** Modelo puro da página Arquivos: agrega o que o portal já carrega (nenhum dado novo). */
export type FileRow = {
  id: string;
  nome: string;
  categoria: string;
  campanhaId: string;
  campanhaNome: string;
  influencerNome?: string;
  url: string;
  createdAt?: string;
};

export type TypeFilter = "todos" | "documentos" | "imagens" | "videos" | "audios" | "relatorios";

export const KIND_TO_FILTER: Record<ClientFileKind, TypeFilter> = {
  pdf: "documentos",
  text: "documentos",
  image: "imagens",
  video: "videos",
  audio: "audios",
  unsupported: "documentos",
};

export function buildFileRows(data: Pick<PortalSessionData, "campanhas">): FileRow[] {
  const rows: FileRow[] = [];
  for (const campanha of data.campanhas) {
    for (const influencer of campanha.influencers) {
      if (influencer.briefingAnexoUrl) {
        rows.push({
          id: `briefing:${influencer.id}`,
          nome: influencer.briefingAnexoNome || "Briefing",
          categoria: "Briefing",
          campanhaId: campanha.id,
          campanhaNome: campanha.nome,
          influencerNome: influencer.nome,
          url: influencer.briefingAnexoUrl,
        });
      }
      for (const entrega of influencer.entregas) {
        for (const anexo of entrega.anexos ?? []) {
          rows.push({
            id: `anexo:${anexo.id}`,
            nome: anexo.nome,
            categoria: anexo.categoria,
            campanhaId: campanha.id,
            campanhaNome: campanha.nome,
            influencerNome: influencer.nome,
            url: anexo.url,
            createdAt: anexo.criadoEm,
          });
        }
      }
    }
    for (const relatorio of campanha.relatorios) {
      if (relatorio.url) {
        rows.push({
          id: `relatorio:${relatorio.id}`,
          nome: relatorio.nome,
          categoria: "Relatório",
          campanhaId: campanha.id,
          campanhaNome: campanha.nome,
          url: relatorio.url,
          createdAt: relatorio.uploadedAt,
        });
      }
    }
  }
  return rows;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export type FileFilters = { query: string; campaignId: string; type: TypeFilter };
export const NO_FILE_FILTERS: FileFilters = { query: "", campaignId: "todas", type: "todos" };

export function hasActiveFileFilter(f: FileFilters): boolean {
  return f.query.trim().length > 0 || f.campaignId !== "todas" || f.type !== "todos";
}

/** Os três filtros valem juntos (E). Busca ignora acento/caixa e olha nome, categoria e campanha. */
export function filterFiles(files: readonly FileRow[], f: FileFilters): FileRow[] {
  const q = norm(f.query.trim());
  return files.filter((file) => {
    if (q && !norm(`${file.nome} ${file.categoria} ${file.campanhaNome}`).includes(q)) return false;
    if (f.campaignId !== "todas" && file.campanhaId !== f.campaignId) return false;
    if (f.type !== "todos") {
      if (f.type === "relatorios") return file.categoria === "Relatório";
      if (KIND_TO_FILTER[fileKindOf(file)] !== f.type) return false;
    }
    return true;
  });
}

export function availableTypeFilters(files: readonly FileRow[]): Set<TypeFilter> {
  const set = new Set<TypeFilter>();
  for (const f of files) set.add(KIND_TO_FILTER[fileKindOf(f)]);
  return set;
}

/** Tipo do arquivo para o ícone: o nome costuma ter a extensão; a URL assinada é o plano B. */
export function fileKindOf(f: Pick<FileRow, "nome" | "url">): ClientFileKind {
  const byName = inferFileKind(f.nome);
  return byName !== "unsupported" ? byName : inferFileKind(f.url);
}
