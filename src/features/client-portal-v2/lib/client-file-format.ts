/**
 * Detecção de formato pro viewer compartilhado — baseada em extensão do
 * nome do arquivo (nunca confiamos SÓ na extensão pra decidir se um
 * upload é seguro em outros pontos do app — ver `avatar-upload.ts`'s
 * `sniffImageType`, que lê os bytes reais — mas aqui é só decoração de
 * lista: qual ícone/qual sub-viewer mostrar. O navegador respeita o
 * `Content-Type` real da resposta HTTP quando o arquivo é efetivamente
 * carregado num `<img>`/`<video>`/`<iframe>`, então um "type" errado
 * aqui no máximo escolhe o sub-viewer errado, nunca executa nada).
 */
export type ClientFileKind = "pdf" | "image" | "video" | "audio" | "text" | "unsupported";

const EXTENSION_KIND: Record<string, ClientFileKind> = {
  pdf: "pdf",
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  gif: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  ogg: "audio",
  txt: "text",
  csv: "text",
  json: "text",
};

function extensionOf(nameOrUrl: string): string {
  const clean = nameOrUrl.split("?")[0].split("#")[0];
  const match = /\.([a-z0-9]+)$/i.exec(clean);
  return match ? match[1].toLowerCase() : "";
}

export function inferFileKind(nameOrUrl: string): ClientFileKind {
  const ext = extensionOf(nameOrUrl);
  return EXTENSION_KIND[ext] ?? "unsupported";
}

const KIND_LABEL: Record<ClientFileKind, string> = {
  pdf: "PDF",
  image: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  text: "Texto",
  unsupported: "Arquivo",
};

export function fileKindLabel(kind: ClientFileKind): string {
  return KIND_LABEL[kind];
}

/** "878.8 KB"/"2,4 MB" — sempre pt-BR, nunca bytes crus. */
export function formatFileSize(bytes: number | undefined | null): string | undefined {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const formatted = value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${formatted} ${units[unitIndex]}`;
}

/** Extensão TXT/CSV/JSON são seguras pra mostrar como texto puro (nunca
 * HTML/scripts executáveis) — usado pra decidir se o viewer de texto
 * tenta buscar o conteúdo. */
export function isSafeTextKind(kind: ClientFileKind): boolean {
  return kind === "text";
}
