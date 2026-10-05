import type { CampaignDoc } from "@/lib/campanha-scoped-store";
import {
  detectSourceType,
  resolveTitle,
  type DocumentInput,
  type DocumentResource,
} from "@/lib/document-resources";

/** Adaptador `CampaignDoc` (Campanhas e Comercial) ↔ modelo compartilhado de documentos. O formato
 * persistido (`tipo`, `titulo`, `url`, `arquivoNome`, `criadoEm`) não muda. */
export function campaignDocToResource(d: CampaignDoc): DocumentResource {
  const isLink = d.tipo === "link";
  return {
    id: d.id,
    title: d.titulo,
    url: d.url,
    kind: isLink ? "link" : "file",
    fileName: d.arquivoNome,
    sourceType: isLink ? detectSourceType(d.url) : "file",
    createdAt: d.criadoEm,
  };
}

export function campaignDocFromInput(input: DocumentInput, now = new Date()): CampaignDoc {
  const isLink = input.kind === "link";
  return {
    id: crypto.randomUUID(),
    tipo: isLink ? "link" : "anexo",
    titulo: resolveTitle(input),
    url: input.url.trim(),
    ...(isLink ? {} : { arquivoNome: input.fileName }),
    criadoEm: now.toISOString(),
  };
}

/** Aplica a edição (nome e, para links, o endereço). Anexo mantém arquivo e URL de dados. */
export function applyCampaignDocEdit(doc: CampaignDoc, input: DocumentInput): CampaignDoc {
  if (doc.tipo === "anexo") {
    return {
      ...doc,
      titulo: input.title.trim() || doc.arquivoNome || doc.titulo,
      ...(input.fileName ? { arquivoNome: input.fileName, url: input.url } : {}),
    };
  }
  return { ...doc, titulo: resolveTitle(input), url: input.url.trim() };
}
