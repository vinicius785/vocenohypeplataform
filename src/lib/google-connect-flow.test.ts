import { describe, expect, it } from "vitest";
import {
  CONNECT_ERROR_MESSAGES,
  messageForCallbackReason,
  reasonForErrorCode,
  runGoogleConnect,
  type StartGoogleOAuthResult,
} from "@/lib/google-connect-flow";

describe("runGoogleConnect — botão Conectar/Reconectar", () => {
  it("sucesso: devolve o destino para redirecionar", async () => {
    const out = await runGoogleConnect(async () => ({
      ok: true,
      url: "https://accounts.google.com/o/oauth2/v2/auth?x=1",
    }));
    expect(out).toEqual({
      kind: "redirect",
      url: "https://accounts.google.com/o/oauth2/v2/auth?x=1",
    });
  });

  it("redirecionamento ao domínio canônico também é aceito", async () => {
    const out = await runGoogleConnect(async () => ({
      ok: true,
      url: "https://plataforma.vocenohype.com.br/time?section=configuracoes",
    }));
    expect(out.kind).toBe("redirect");
  });

  it.each(["forbidden", "not_configured", "unavailable"] as const)(
    "erro controlado '%s' → mensagem clara (não fica em silêncio)",
    async (error) => {
      const result: StartGoogleOAuthResult = { ok: false, error };
      const out = await runGoogleConnect(async () => result);
      expect(out).toEqual({ kind: "error", message: CONNECT_ERROR_MESSAGES[error] });
      expect((out as { message: string }).message.length).toBeGreaterThan(10);
    },
  );

  it("a chamada lança (rede/servidor) → mensagem de rede, sem detalhe técnico", async () => {
    const out = await runGoogleConnect(async () => {
      throw new Error("TypeError: fetch failed at https://interno/stack");
    });
    expect(out).toEqual({ kind: "error", message: CONNECT_ERROR_MESSAGES.network });
    expect(JSON.stringify(out)).not.toContain("interno");
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "não é url", ""])(
    "destino inseguro ou inválido (%s) não é seguido",
    async (url) => {
      const out = await runGoogleConnect(async () => ({ ok: true, url }));
      expect(out).toEqual({ kind: "error", message: CONNECT_ERROR_MESSAGES.invalid_destination });
    },
  );

  it("pode ser repetido após uma falha (recuperação)", async () => {
    let calls = 0;
    const start = async (): Promise<StartGoogleOAuthResult> =>
      ++calls === 1
        ? { ok: false, error: "unavailable" }
        : { ok: true, url: "https://accounts.google.com/x" };
    expect((await runGoogleConnect(start)).kind).toBe("error");
    expect((await runGoogleConnect(start)).kind).toBe("redirect");
  });
});

describe("mensagens do retorno do callback (?reason=)", () => {
  it.each(["denied", "state", "config", "exchange", "no_refresh", "save"])(
    "reason '%s' tem mensagem própria",
    (reason) => {
      expect(messageForCallbackReason(reason)).not.toBe(messageForCallbackReason(null));
    },
  );

  it("valor desconhecido ou malicioso cai na mensagem genérica", () => {
    const generic = messageForCallbackReason(null);
    for (const reason of ["xyz", "constructor", "__proto__", "<script>", "toString", ""]) {
      expect(messageForCallbackReason(reason)).toBe(generic);
    }
    expect(typeof messageForCallbackReason("constructor")).toBe("string");
  });

  it("todo código de erro do callback mapeia para um reason conhecido", () => {
    const codes = [
      "app_url_invalid",
      "google_denied_or_missing_params",
      "state_invalid_or_reused",
      "state_expired",
      "state_not_bound_to_browser",
      "env_missing",
      "token_exchange_failed",
      "no_refresh_token",
      "db_upsert_failed",
    ];
    for (const code of codes) {
      const reason = reasonForErrorCode(code);
      expect(messageForCallbackReason(reason)).not.toBe(messageForCallbackReason(null));
    }
  });
});
