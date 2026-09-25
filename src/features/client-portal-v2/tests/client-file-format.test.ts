import { describe, expect, it } from "vitest";
import {
  fileKindLabel,
  formatFileSize,
  inferFileKind,
  isSafeTextKind,
} from "../lib/client-file-format";

describe("inferFileKind", () => {
  it("reconhece PDF, imagem, vídeo, áudio e texto pela extensão", () => {
    expect(inferFileKind("relatorio.pdf")).toBe("pdf");
    expect(inferFileKind("foto.PNG")).toBe("image");
    expect(inferFileKind("reel.mp4")).toBe("video");
    expect(inferFileKind("audio.mp3")).toBe("audio");
    expect(inferFileKind("dados.csv")).toBe("text");
  });

  it("lida com URLs assinadas com query string, não só nomes crus", () => {
    expect(inferFileKind("https://x.supabase.co/storage/v1/object/sign/file.pdf?token=abc")).toBe(
      "pdf",
    );
  });

  it("formato desconhecido/sem extensão cai em 'unsupported', nunca quebra", () => {
    expect(inferFileKind("apresentacao.pptx")).toBe("unsupported");
    expect(inferFileKind("sem-extensao")).toBe("unsupported");
    expect(inferFileKind("")).toBe("unsupported");
  });
});

describe("fileKindLabel", () => {
  it("mapeia cada kind pro rótulo em português", () => {
    expect(fileKindLabel("pdf")).toBe("PDF");
    expect(fileKindLabel("unsupported")).toBe("Arquivo");
  });
});

describe("formatFileSize — sempre pt-BR, nunca bytes crus", () => {
  it("formata KB/MB corretamente", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2_400_000)).toBe("2,3 MB");
  });

  it("retorna undefined quando o tamanho não é conhecido — nunca inventa 0", () => {
    expect(formatFileSize(undefined)).toBeUndefined();
    expect(formatFileSize(null)).toBeUndefined();
  });
});

describe("isSafeTextKind", () => {
  it("só 'text' é seguro pra renderizar como texto puro", () => {
    expect(isSafeTextKind("text")).toBe(true);
    expect(isSafeTextKind("pdf")).toBe(false);
    expect(isSafeTextKind("unsupported")).toBe(false);
  });
});
