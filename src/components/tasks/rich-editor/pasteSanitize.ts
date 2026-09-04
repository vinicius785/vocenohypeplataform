import DOMPurify from "dompurify";

/** Tags/atributos permitidos ao colar de fora (Google Docs, Notion,
 * ClickUp, Word, web) — só o que mapeia pra alguma extensão habilitada no
 * editor. Remove fontes/cores/backgrounds/tamanhos arbitrários do documento
 * de origem (item 20 do pedido): nada de `style`/`class`/`font` sobrevive. */
const ALLOWED_TAGS = [
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "strike",
  "u",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "hr",
];

export function sanitizePastedHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href"],
    KEEP_CONTENT: true,
  });
}
