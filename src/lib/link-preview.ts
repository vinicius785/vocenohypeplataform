/**
 * Reconhecimento de link por PADRÃO conhecido — nunca busca metadados de
 * terceiros (decisão do usuário: evita abrir uma rota nova de SSRF e não
 * depende de site externo responder). Cobre só os casos citados no
 * pedido (Google Drive/Docs, YouTube, links internos da própria
 * plataforma) — qualquer URL fora desses padrões continua como link
 * compacto de sempre (`linkify.tsx`), sem preview nenhum.
 */

const URL_RE = /(https?:\/\/[^\s<>"')]+)/g;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE);
  if (!matches) return [];
  // Únicos, preservando a ordem de primeira aparição.
  return [...new Set(matches)];
}

export type LinkPreviewKind = "drive" | "youtube" | "internal_task" | "internal_scope" | "internal";

export type LinkPreview = {
  kind: LinkPreviewKind;
  url: string;
  domain: string;
  title: string;
};

/** Só reconhece o HOST/PATH — nunca faz fetch. Retorna `null` pra
 * qualquer URL fora dos padrões conhecidos (cai no link compacto). */
export function recognizeLinkPreview(url: string): LinkPreview | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "");

  if (host === "drive.google.com") {
    return { kind: "drive", url, domain: host, title: "Google Drive" };
  }
  if (host === "docs.google.com") {
    return { kind: "drive", url, domain: host, title: "Google Docs" };
  }
  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") {
    return { kind: "youtube", url, domain: host, title: "YouTube" };
  }

  // Links internos da própria plataforma — só quando o navegador já
  // resolveu a URL (mesma origem), nunca comparando string crua (evita
  // falso-positivo de um link EXTERNO que só contém o mesmo texto).
  if (typeof window !== "undefined" && parsed.origin === window.location.origin) {
    if (parsed.searchParams.has("taskId") || /\/tarefa\//.test(parsed.pathname)) {
      return { kind: "internal_task", url, domain: host, title: "Tarefa na plataforma" };
    }
    if (parsed.pathname.startsWith("/projeto/")) {
      return { kind: "internal_scope", url, domain: host, title: "Projeto na plataforma" };
    }
    const section = parsed.searchParams.get("section");
    if (section === "campanhas") {
      return { kind: "internal_scope", url, domain: host, title: "Campanha na plataforma" };
    }
    if (section === "reunioes") {
      return { kind: "internal_scope", url, domain: host, title: "Reunião na plataforma" };
    }
    if (section) {
      return { kind: "internal", url, domain: host, title: "Página na plataforma" };
    }
  }
  return null;
}
