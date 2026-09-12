import { describe, expect, it } from "vitest";
import {
  parseHypitoMessage,
  HYPITO_MESSAGE_VERSION,
  type HypitoMessage,
} from "@/lib/hypito-messages";

function base(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    version: HYPITO_MESSAGE_VERSION,
    kind: "text",
    textFallback: "Olá!",
    state: "default",
    timestamp: new Date().toISOString(),
    actions: [],
    ...overrides,
  };
}

describe("parseHypitoMessage", () => {
  it("aceita um payload de texto simples válido", () => {
    const parsed = parseHypitoMessage(base());
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("text");
  });

  it("aceita um payload com `data` (task_draft) válido", () => {
    const payload = base({
      kind: "task_draft",
      pendingActionId: "11111111-1111-1111-1111-111111111111",
      data: {
        title: "Cobrar métricas",
        assignee: null,
        assigneeIsRequester: false,
        scope: null,
        dueAtIso: null,
        priority: "Normal",
        description: null,
      },
    });
    const parsed = parseHypitoMessage(payload);
    expect(parsed?.kind).toBe("task_draft");
  });

  it("rejeita versão desconhecida — cai pro fallback textual de quem chama", () => {
    expect(parseHypitoMessage(base({ version: 999 }))).toBeNull();
  });

  it("rejeita payload sem textFallback", () => {
    const p = base();
    delete (p as Record<string, unknown>).textFallback;
    expect(parseHypitoMessage(p)).toBeNull();
  });

  it("rejeita payload sem `actions` (array)", () => {
    const p = base({ actions: undefined });
    expect(parseHypitoMessage(p)).toBeNull();
  });

  it("rejeita kind com `data` ausente (exceto 'text')", () => {
    expect(parseHypitoMessage(base({ kind: "task_created", data: undefined }))).toBeNull();
  });

  it("rejeita null/undefined/tipos primitivos sem quebrar", () => {
    expect(parseHypitoMessage(null)).toBeNull();
    expect(parseHypitoMessage(undefined)).toBeNull();
    expect(parseHypitoMessage("mensagem antiga em texto puro")).toBeNull();
    expect(parseHypitoMessage(42)).toBeNull();
  });

  it("mensagem antiga (sem hypito_payload nenhum) é representada como null, nunca lança erro", () => {
    expect(() => parseHypitoMessage(undefined)).not.toThrow();
  });

  it("tipagem: um HypitoMessage válido satisfaz o discriminated union em tempo de compilação", () => {
    const msg: HypitoMessage = base() as HypitoMessage;
    expect(msg.kind).toBe("text");
  });
});
