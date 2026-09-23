import { describe, expect, it } from "vitest";
import { extractUrls, recognizeLinkPreview } from "@/lib/link-preview";

describe("extractUrls", () => {
  it("extrai todas as URLs http(s) de um texto, sem duplicar", () => {
    const text = "veja https://a.com e também https://b.com e de novo https://a.com";
    expect(extractUrls(text)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("retorna vazio quando não há URL", () => {
    expect(extractUrls("nenhum link aqui")).toEqual([]);
  });
});

describe("recognizeLinkPreview", () => {
  it("reconhece Google Drive", () => {
    expect(recognizeLinkPreview("https://drive.google.com/file/d/123")?.kind).toBe("drive");
  });

  it("reconhece Google Docs", () => {
    expect(recognizeLinkPreview("https://docs.google.com/document/d/123")?.kind).toBe("drive");
  });

  it("reconhece YouTube (domínio completo e encurtado)", () => {
    expect(recognizeLinkPreview("https://youtube.com/watch?v=abc")?.kind).toBe("youtube");
    expect(recognizeLinkPreview("https://youtu.be/abc")?.kind).toBe("youtube");
  });

  it("reconhece Google Meet — Fase 4/6 (faltava esse domínio na lista)", () => {
    const preview = recognizeLinkPreview("https://meet.google.com/abc-defg-hij");
    expect(preview?.kind).toBe("meet");
    expect(preview?.title).toBe("Google Meet");
  });

  it("retorna null pra URL fora dos padrões reconhecidos", () => {
    expect(recognizeLinkPreview("https://exemplo.com/pagina")).toBeNull();
  });

  it("retorna null pra uma string que não é uma URL válida", () => {
    expect(recognizeLinkPreview("não é url")).toBeNull();
  });
});
