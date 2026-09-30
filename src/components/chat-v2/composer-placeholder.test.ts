import { describe, expect, it } from "vitest";
import { computeComposerPlaceholder } from "./composer-placeholder";

describe("computeComposerPlaceholder", () => {
  it("usa o nome da conversa quando disponível (DM)", () => {
    expect(computeComposerPlaceholder({ conversationLabel: "Lucas Ragnoni" })).toBe(
      "Mensagem para Lucas Ragnoni",
    );
  });

  it("usa o nome do canal quando disponível", () => {
    expect(computeComposerPlaceholder({ conversationLabel: "#Poupatempo RJ" })).toBe(
      "Mensagem para #Poupatempo RJ",
    );
  });

  it("usa o placeholder fixo de thread quando há replyToId E isThread, mesmo com nome de conversa disponível", () => {
    expect(
      computeComposerPlaceholder({
        replyToId: "msg-1",
        conversationLabel: "Lucas Ragnoni",
        isThread: true,
      }),
    ).toBe("Responder nesta thread");
  });

  it("resposta inline (replyToId sem isThread) mantém o placeholder contextual — o contexto já aparece no banner 'Respondendo a X'", () => {
    expect(
      computeComposerPlaceholder({ replyToId: "msg-1", conversationLabel: "Lucas Ragnoni" }),
    ).toBe("Mensagem para Lucas Ragnoni");
  });

  it("cai no texto genérico só quando não há nome de conversa nem thread", () => {
    expect(computeComposerPlaceholder({})).toBe("Escreva uma mensagem…");
  });
});
