import type { JSONContent } from "@tiptap/core";

/** Doc estruturado do editor (TipTap/ProseMirror JSON) — o novo formato de
 * `Task.description`. Substitui o antigo `string` puro, mas o schemaless
 * `data JSONB` das tabelas de tarefas não precisa de nenhuma migração pra
 * aceitar isso (ver `src/lib/rich-text.ts` no plano). */
export type RichDoc = JSONContent;

function nodeHasContent(node: JSONContent): boolean {
  if (node.type === "text") return !!node.text?.trim();
  // Nodes "de conteúdo" que valem mesmo sem texto (imagem seria um exemplo
  // futuro) — hoje só o divisor e o checklist (mesmo com itens vazios, o
  // usuário já criou uma estrutura visível).
  if (node.type === "horizontalRule" || node.type === "taskList") return true;
  return (node.content ?? []).some(nodeHasContent);
}

/** Um doc só com parágrafos vazios (ou nenhum node de conteúdo real) conta
 * como "sem descrição" — objeto JS é sempre truthy, então os truthy-checks
 * antigos (`!!t.description`) quebrariam com o novo formato sem isso. Aceita
 * tanto o doc novo quanto a string antiga (normaliza via `toRichDoc`), pra
 * servir de substituto direto de `!!t.description` em qualquer call-site. */
export function isDescriptionEmpty(value: RichDoc | string | null | undefined): boolean {
  if (!value) return true;
  const doc = typeof value === "string" ? legacyTextToDoc(value) : value;
  return !(doc.content ?? []).some(nodeHasContent);
}

/** Migração de descrições antigas (string simples) pro doc estruturado —
 * único ponto de conversão, roda no carregamento. Cada linha vira um
 * parágrafo (preserva quebras de linha existentes); linhas em branco viram
 * parágrafos vazios. Nunca descarta conteúdo — inclusive "@Nome" solto de
 * menções antigas (que nunca guardaram id de verdade) entra como texto puro. */
export function legacyTextToDoc(text: string): RichDoc {
  const lines = text.split("\n");
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : undefined,
    })),
  };
}

/** Aceita tanto o formato antigo (string) quanto o novo (doc) — usado no
 * único ponto de carregamento da descrição em `TaskBoard.tsx`. */
export function toRichDoc(value: RichDoc | string | null | undefined): RichDoc {
  if (!value) return { type: "doc", content: [{ type: "paragraph" }] };
  if (typeof value === "string") return legacyTextToDoc(value);
  return value;
}
