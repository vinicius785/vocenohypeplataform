import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { DemoAssetSpec } from "./cenario-campanha-completa";
import {
  buildPlaceholderPng,
  buildSimplePdf,
  crc32,
  hueFromKey,
  renderDemoAsset,
} from "./demo-assets.server";

const latin1 = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("buildSimplePdf", () => {
  const pdf = buildSimplePdf("Roteiro — Reels (teste)", ["Linha 1", "", "Ação & emoção: 100%"]);
  const text = latin1(pdf);

  it("tem cabeçalho, trailer e EOF de um PDF válido", () => {
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Root 1 0 R");
  });

  it("a tabela xref aponta exatamente para o início de cada objeto", () => {
    const startxref = Number(/startxref\n(\d+)\n/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    );
    expect(entries).toHaveLength(6);
    entries.forEach((off, i) =>
      expect(text.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`),
    );
  });

  it("declara o tamanho do stream corretamente (em bytes)", () => {
    const m = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(text)!;
    expect(Buffer.byteLength(m[2], "latin1")).toBe(Number(m[1]));
  });

  it("escapa parênteses e mantém acentos do português", () => {
    expect(text).toContain("(Roteiro ? Reels \\(teste\\)) Tj");
    expect(text).toContain("Ação & emoção: 100%");
  });

  it("é determinístico", () => {
    expect(
      Buffer.from(buildSimplePdf("a", ["b"])).equals(Buffer.from(buildSimplePdf("a", ["b"]))),
    ).toBe(true);
  });

  it("trunca listas longas sem estourar a página", () => {
    const many = buildSimplePdf(
      "t",
      Array.from({ length: 200 }, (_, i) => `linha ${i}`),
    );
    expect(latin1(many)).not.toContain("linha 150");
  });
});

describe("buildPlaceholderPng", () => {
  const png = Buffer.from(buildPlaceholderPng("conteudo-x", 60, 40));

  it("assinatura PNG e chunks IHDR/IDAT/IEND com CRC válido", () => {
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    let off = 8;
    const types: string[] = [];
    while (off < png.length) {
      const len = png.readUInt32BE(off);
      const type = png.subarray(off + 4, off + 8).toString("ascii");
      const body = png.subarray(off + 4, off + 8 + len);
      expect(png.readUInt32BE(off + 8 + len), type).toBe(crc32(body));
      types.push(type);
      off += 12 + len;
    }
    expect(types).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(png.readUInt32BE(16)).toBe(60);
    expect(png.readUInt32BE(20)).toBe(40);
  });

  it("os dados descomprimidos têm exatamente altura × (1 + largura × 3) bytes", () => {
    const idatLen = png.readUInt32BE(33);
    const idat = png.subarray(41, 41 + idatLen);
    expect(inflateSync(idat).length).toBe(40 * (1 + 60 * 3));
  });

  it("cada chave gera uma cor própria; a mesma chave repete", () => {
    expect(hueFromKey("a")).not.toBe(hueFromKey("b"));
    expect(
      Buffer.from(buildPlaceholderPng("k", 20, 20)).equals(
        Buffer.from(buildPlaceholderPng("k", 20, 20)),
      ),
    ).toBe(true);
    expect(
      Buffer.from(buildPlaceholderPng("k1", 20, 20)).equals(
        Buffer.from(buildPlaceholderPng("k2", 20, 20)),
      ),
    ).toBe(false);
  });
});

describe("renderDemoAsset", () => {
  const base: DemoAssetSpec = {
    key: "k",
    kind: "pdf",
    bucket: "entrega-anexos",
    path: "demo/s/k.pdf",
    fileName: "k.pdf",
    title: "Título",
    lines: ["a"],
  };

  it("PDF e PNG com o content-type certo", () => {
    expect(renderDemoAsset(base).contentType).toBe("application/pdf");
    const png = renderDemoAsset({ ...base, kind: "png", path: "demo/s/k.png", fileName: "k.png" });
    expect(png.contentType).toBe("image/png");
    expect(png.bytes[1]).toBe(0x50);
  });
});
