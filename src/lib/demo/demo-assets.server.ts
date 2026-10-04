import { deflateSync } from "node:zlib";
import type { DemoAssetSpec } from "./cenario-campanha-completa";

/**
 * Renderiza os arquivos de exemplo da Demo (PDF e PNG) a partir de um `DemoAssetSpec` —
 * determinístico e sem dependência externa. São arquivos de EXEMPLO, gerados pelo código do
 * repositório: nunca apontam para arquivo real de cliente. Podem ser trocados por peças
 * desenhadas sem mudar o contrato (basta `renderDemoAsset` devolver outros bytes).
 *
 * `.server.ts`: usa `node:zlib` e não deve entrar no bundle do navegador.
 */

export type RenderedAsset = { bytes: Uint8Array; contentType: string };

// ---------------------------------------------------------------------------------------
// PDF mínimo (1 página, Helvetica, WinAnsi ≈ Latin-1 — cobre o português)
// ---------------------------------------------------------------------------------------

function pdfText(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\" || ch === "(" || ch === ")") out += `\\${ch}`;
    else if (code >= 32 && code <= 255) out += ch;
    else out += "?";
  }
  return out;
}

export function buildSimplePdf(title: string, lines: string[]): Uint8Array {
  const ops: string[] = ["BT", "/F2 18 Tf", "50 780 Td", `(${pdfText(title)}) Tj`, "ET"];
  let y = 745;
  for (const line of lines) {
    if (line) ops.push("BT", "/F1 12 Tf", `50 ${y} Td`, `(${pdfText(line)}) Tj`, "ET");
    y -= 20;
    if (y < 60) break;
  }
  const stream = ops.join("\n");

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R " +
      "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets: number[] = [];
  let pos = chunks[0].length;
  objects.forEach((body, i) => {
    offsets.push(pos);
    const buf = Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, "latin1");
    chunks.push(buf);
    pos += buf.length;
  });
  const xrefStart = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return new Uint8Array(Buffer.concat(chunks));
}

// ---------------------------------------------------------------------------------------
// PNG (RGB, 8 bits) — faixas diagonais suaves, cor derivada da chave
// ---------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function hueFromKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 37 + key.charCodeAt(i)) % 360;
  return h;
}

export function buildPlaceholderPng(key: string, width = 540, height = 675): Uint8Array {
  const hue = hueFromKey(key);
  const raw = Buffer.alloc(height * (1 + width * 3));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filtro "None"
    for (let x = 0; x < width; x++) {
      const band = Math.floor((x + y) / 45) % 2;
      const [r, g, b] = hslToRgb(
        (hue + ((x + y) / (width + height)) * 40) % 360,
        0.55,
        band ? 0.62 : 0.56,
      );
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 2; // RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
  return new Uint8Array(png);
}

// ---------------------------------------------------------------------------------------

export function renderDemoAsset(spec: DemoAssetSpec): RenderedAsset {
  if (spec.kind === "pdf") {
    return { bytes: buildSimplePdf(spec.title, spec.lines), contentType: "application/pdf" };
  }
  return { bytes: buildPlaceholderPng(spec.key), contentType: "image/png" };
}
