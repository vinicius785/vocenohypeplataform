import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalRedirectUrl,
  getAppUrl,
  getGoogleOAuthRedirectUri,
  isOAuthStateExpired,
} from "@/lib/google-oauth-config";

/**
 * Cobre a correção do `redirect_uri_mismatch`: o redirect_uri do OAuth do
 * Google precisa vir sempre de `APP_URL` (fixa por ambiente), nunca do
 * origin/host da requisição — a plataforma tem múltiplos domínios de
 * produção apontando pro mesmo deploy, e só um deles pode estar cadastrado
 * no Google Cloud Console.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAppUrl", () => {
  it("falha claramente quando APP_URL está ausente", () => {
    vi.stubEnv("APP_URL", "");
    expect(() => getAppUrl()).toThrow(/APP_URL não configurada/i);
  });

  it("falha quando APP_URL não é uma URL absoluta", () => {
    vi.stubEnv("APP_URL", "plataforma.vocenohype.com.br");
    expect(() => getAppUrl()).toThrow(/não é uma URL absoluta/i);
  });

  it("exige HTTPS fora de localhost", () => {
    vi.stubEnv("APP_URL", "http://plataforma.vocenohype.com.br");
    expect(() => getAppUrl()).toThrow(/HTTPS/i);
  });

  it("aceita http:// em localhost (desenvolvimento)", () => {
    vi.stubEnv("APP_URL", "http://localhost:8080");
    expect(getAppUrl()).toBe("http://localhost:8080");
  });

  it("remove a barra final antes de usar", () => {
    vi.stubEnv("APP_URL", "https://plataforma.vocenohype.com.br/");
    expect(getAppUrl()).toBe("https://plataforma.vocenohype.com.br");
  });
});

describe("getGoogleOAuthRedirectUri", () => {
  it("monta o callback canônico em produção", () => {
    vi.stubEnv("APP_URL", "https://plataforma.vocenohype.com.br");
    expect(getGoogleOAuthRedirectUri()).toBe(
      "https://plataforma.vocenohype.com.br/api/google/oauth-callback",
    );
  });

  it("monta o callback de localhost em desenvolvimento", () => {
    vi.stubEnv("APP_URL", "http://localhost:8080");
    expect(getGoogleOAuthRedirectUri()).toBe("http://localhost:8080/api/google/oauth-callback");
  });

  it("devolve exatamente o mesmo valor em chamadas repetidas — autorização e troca de tokens precisam usar o mesmo redirect_uri", () => {
    vi.stubEnv("APP_URL", "https://plataforma.vocenohype.com.br");
    const forAuthorize = getGoogleOAuthRedirectUri();
    const forTokenExchange = getGoogleOAuthRedirectUri();
    expect(forAuthorize).toBe(forTokenExchange);
  });
});

describe("canonicalRedirectUrl", () => {
  it("retorna null quando a requisição já está no domínio canônico", () => {
    vi.stubEnv("APP_URL", "https://plataforma.vocenohype.com.br");
    expect(
      canonicalRedirectUrl("https://plataforma.vocenohype.com.br/time?section=configuracoes"),
    ).toBeNull();
  });

  it("redireciona pro domínio canônico preservando caminho e query string, quando acessado por domínio alternativo", () => {
    vi.stubEnv("APP_URL", "https://plataforma.vocenohype.com.br");
    expect(
      canonicalRedirectUrl(
        "https://vocenohype-plataforma.vercel.app/time?section=configuracoes&x=1",
      ),
    ).toBe("https://plataforma.vocenohype.com.br/time?section=configuracoes&x=1");
  });
});

describe("isOAuthStateExpired", () => {
  it("aceita um state criado há pouco", () => {
    const now = Date.now();
    expect(isOAuthStateExpired(new Date(now - 60_000).toISOString(), now)).toBe(false);
  });

  it("rejeita um state criado há mais de 10 minutos", () => {
    const now = Date.now();
    expect(isOAuthStateExpired(new Date(now - 11 * 60_000).toISOString(), now)).toBe(true);
  });

  it("está no limite exatamente nos 10 minutos (exclusivo)", () => {
    const now = Date.now();
    expect(isOAuthStateExpired(new Date(now - 10 * 60_000).toISOString(), now)).toBe(false);
  });
});

/**
 * `google_oauth_states` garante uso único via `DELETE ... RETURNING`
 * (mesmo padrão de `acquireSyncLock` em `google-calendar.functions.ts`,
 * `UPDATE ... WHERE` atômico): a segunda tentativa de consumir o mesmo
 * `state` recebe 0 linhas do Postgres, não uma corrida entre um SELECT e um
 * DELETE separados. Isso é uma propriedade do SQL executado no callback
 * (`src/routes/api/google/oauth-callback.ts`), não uma função pura — sem
 * infraestrutura de teste pra rotas de arquivo (`createFileRoute`) já
 * existente neste repo, a garantia de reuso único fica coberta por revisão
 * de código deste arquivo em vez de um teste automatizado aqui.
 */
