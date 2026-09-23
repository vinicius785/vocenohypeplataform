import { describe, expect, it } from "vitest";
import { messagePreviewLabel } from "@/lib/voice-messages";

/**
 * Chat Fase 3: a navegação de conversas mostra uma prévia de uma linha só
 * da última mensagem — o pedido é explícito que ela nunca pode mostrar uma
 * URL gigante crua (ex: um link de OAuth/Drive/Meet facilmente passa de
 * 100 caracteres) nem ficar em branco quando a mensagem só compartilha uma
 * tarefa/projeto/campanha (sem texto livre, só uma menção).
 */
describe("messagePreviewLabel", () => {
  it("mostra o texto normal quando não é só um link", () => {
    expect(messagePreviewLabel({ text: "Bom dia, pessoal!" })).toBe("Bom dia, pessoal!");
  });

  it("resume uma mensagem que é SÓ um link, em vez de mostrar a URL crua", () => {
    expect(
      messagePreviewLabel({
        text: "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=xyz",
      }),
    ).toBe("🔗 enviou um link");
  });

  it("mantém o texto normal quando o link vem acompanhado de outro texto", () => {
    const text = "olha isso: https://exemplo.com/pagina";
    expect(messagePreviewLabel({ text })).toBe(text);
  });

  it("mostra 'Mensagem de voz' com duração pra anexo de áudio gravado", () => {
    expect(
      messagePreviewLabel({
        text: "",
        attachments: [
          {
            path: "p",
            url: "u",
            name: "audio.webm",
            size: 1,
            type: "audio/webm",
            durationMs: 65_000,
          },
        ],
      }),
    ).toBe("🎙 Mensagem de voz · 1:05");
  });

  it("mostra o nome do arquivo pra um anexo comum", () => {
    expect(
      messagePreviewLabel({
        text: "",
        attachments: [
          { path: "p", url: "u", name: "relatorio.pdf", size: 1, type: "application/pdf" },
        ],
      }),
    ).toBe("📎 relatorio.pdf");
  });

  it("resume como 'compartilhou uma tarefa' quando não há texto/anexo, só uma menção de tarefa", () => {
    expect(
      messagePreviewLabel({
        text: "",
        mentions: [{ kind: "task", id: "t1", label: "Revisar briefing" }],
      }),
    ).toBe("compartilhou uma tarefa");
  });

  it("resume como 'compartilhou uma campanha' pra menção de campanha", () => {
    expect(
      messagePreviewLabel({
        text: "",
        mentions: [{ kind: "campaign", id: "c1", label: "Campanha X" }],
      }),
    ).toBe("compartilhou uma campanha");
  });

  it("volta pra string vazia quando não há texto, anexo nem menção compartilhável", () => {
    expect(
      messagePreviewLabel({ text: "", mentions: [{ kind: "user", id: "u1", label: "Ana" }] }),
    ).toBe("");
    expect(messagePreviewLabel({ text: "" })).toBe("");
  });
});
