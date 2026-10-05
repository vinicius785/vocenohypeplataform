import {
  detectSourceType,
  resolveTitle,
  type DocumentInput,
  type DocumentResource,
} from "@/lib/document-resources";
import type { DocCategory, DocItem } from "@/lib/projetos";

/** Adaptador Projetos → experiência única de documentos. Projetos guardam `project.docs` (só
 * links, com categoria e "fixar"); a persistência segue sendo `update({ docs })`. */
export const PROJECT_DOC_CATEGORIES: { value: DocCategory; label: string }[] = [
  { value: "briefing", label: "Briefing" },
  { value: "planejamento", label: "Planejamento" },
  { value: "apresentacao", label: "Apresentação" },
  { value: "relatorio", label: "Relatório" },
  { value: "contrato", label: "Contrato" },
  { value: "referencia", label: "Referência" },
  { value: "outro", label: "Outro" },
];

export function projectDocToResource(d: DocItem): DocumentResource {
  return {
    id: d.id,
    title: d.name,
    url: d.url,
    kind: "link",
    sourceType: d.sourceType ?? detectSourceType(d.url),
    category: d.category ?? "outro",
    pinned: !!d.isPinned,
  };
}

const asCategory = (v: string | undefined): DocCategory =>
  PROJECT_DOC_CATEGORIES.some((c) => c.value === v) ? (v as DocCategory) : "outro";

export function projectDocFromInput(input: DocumentInput): DocItem {
  return {
    id: crypto.randomUUID(),
    name: resolveTitle(input),
    url: input.url.trim(),
    category: asCategory(input.category),
    isPinned: false,
    sourceType: detectSourceType(input.url.trim()),
  };
}

export function applyProjectDocEdit(d: DocItem, input: DocumentInput): DocItem {
  return {
    ...d,
    name: resolveTitle(input),
    url: input.url.trim(),
    category: asCategory(input.category),
    sourceType: detectSourceType(input.url.trim()),
  };
}
