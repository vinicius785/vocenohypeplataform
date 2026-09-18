import DOMPurify from "dompurify";

/** Conversor bem simples de markdown pra HTML — só o suficiente pra
 * pré-visualização (títulos, negrito, itálico, listas, parágrafos). Não é
 * pra ser um parser completo, só dar uma ideia real de como o texto digitado
 * vai ficar formatado, sem precisar de uma lib externa. */
export function renderMarkdownLite(md: string): string {
  // Escapar HTML só dentro de `inline()` (aplicado ao texto já sem os
  // prefixos estruturais tipo "# "/"> "/"- ") — escapar a string inteira
  // antes de procurar esses prefixos faria `>` virar `&gt;` e a citação
  // nunca ser reconhecida.
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  // Só http(s) — bloqueia `javascript:`/`data:`/outros esquemas que
  // executariam código ao serem clicados, já que o link vem de texto
  // digitado (potencialmente por qualquer autor interno) e é renderizado
  // depois pra clientes externos no Portal.
  const isSafeUrl = (url: string) => /^https?:\/\//i.test(url.trim());
  const lines = md.split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let inQuote = false;
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };
  const closeQuote = () => {
    if (inQuote) {
      html.push("</blockquote>");
      inQuote = false;
    }
  };
  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/\[(.+?)\]\((.+?)\)/g, (match, text: string, url: string) =>
        isSafeUrl(url)
          ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
          : text,
      );
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      closeQuote();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)/.exec(line);
    if (heading) {
      closeList();
      closeQuote();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const quote = /^>\s+(.*)/.exec(line);
    if (quote) {
      closeList();
      if (!inQuote) {
        html.push("<blockquote>");
        inQuote = true;
      }
      html.push(`<p>${inline(quote[1])}</p>`);
      continue;
    }
    // Lista numerada ("1. ", "2) ") — antes só listas com marcador (-/*)
    // eram reconhecidas, então qualquer passo-a-passo numerado (comum em
    // "como fazer X") virava parágrafo corrido em vez de lista.
    const ordered = /^\d+[.)]\s+(.*)/.exec(line);
    if (ordered) {
      closeQuote();
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inline(ordered[1])}</li>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      closeQuote();
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    closeList();
    closeQuote();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  closeQuote();
  // Segunda camada de defesa: mesmo com `escape`/`isSafeUrl` acima, uma
  // sanitização final via DOMPurify protege contra qualquer bug futuro
  // nesse conversor artesanal — o conteúdo é escrito por um membro do
  // time e depois exibido pra clientes externos no Portal, então não pode
  // depender só da lógica manual de escape ficar sempre correta.
  return typeof window === "undefined"
    ? html.join("\n")
    : DOMPurify.sanitize(html.join("\n"), {
        ALLOWED_TAGS: [
          "h1",
          "h2",
          "h3",
          "p",
          "strong",
          "em",
          "code",
          "a",
          "ul",
          "ol",
          "li",
          "blockquote",
        ],
        ALLOWED_ATTR: ["href", "target", "rel"],
        ALLOWED_URI_REGEXP: /^https?:\/\//i,
      });
}

/** Classes compartilhadas por qualquer lugar que renderize
 * `renderMarkdownLite` (editor de blog e o dialog do Mural de novidades) —
 * define como cada tag HTML gerada aparece: espaçamento de parágrafo,
 * marcador de lista (bolinha vs. número), tamanho de título, etc. */
export const MARKDOWN_LITE_CLASSES =
  "text-[15px] leading-[1.75] text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:mb-3 [&_h1]:mt-8 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2.5 [&_h2]:mt-7 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:my-4 [&_ul]:list-disc [&_ol]:my-4 [&_ol]:list-decimal [&_li]:ml-5 [&_li]:mb-2 [&_li]:pl-1 [&_p]:my-4 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_em]:italic [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote>p]:my-1";
