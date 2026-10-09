import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OAUTH_RETURN_PATH,
  canonicalOriginRedirect,
  canonicalRedirectUrl,
  originOf,
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

describe("originOf", () => {
  it("extrai a origem de Origin e de Referer", () => {
    expect(originOf("https://plataforma.vocenohype.com.br")).toBe(
      "https://plataforma.vocenohype.com.br",
    );
    expect(originOf("https://x.vercel.app/time?section=configuracoes")).toBe(
      "https://x.vercel.app",
    );
  });

  it("devolve null para ausente, 'null' (origem opaca) e inválido", () => {
    expect(originOf(null)).toBeNull();
    expect(originOf("")).toBeNull();
    expect(originOf("null")).toBeNull();
    expect(originOf("não é url")).toBeNull();
  });
});

describe("canonicalOriginRedirect (início do OAuth; a request.url de uma server function é /_serverFn/…)", () => {
  it("segue (null) quando a origem da página já é a canônica", () => {
    vi.stubEnv("APP_URL", "https://plataforma.vocenohype.com.br");
    expect(canonicalOriginRedirect("https://plataforma.vocenohype.com.br")).toBeNull();
  });

  it("segue (null) quando não há cabeçalho confiável para comparar — não bloqueia o usuário", () => {
    vi.stubEnv("APP_URL", "https://plataforma.vocenohype.com.br");
    expect(canonicalOriginRedirect(null)).toBeNull();
  });

  it("fora do domínio canônico, devolve SÓ origem canônica + caminho fixo (nunca algo do navegador)", () => {
    vi.stubEnv("APP_URL", "https://plataforma.vocenohype.com.br/");
    const url = canonicalOriginRedirect("https://vocenohype-plataforma.vercel.app");
    expect(url).toBe(`https://plataforma.vocenohype.com.br${OAUTH_RETURN_PATH}`);
    expect(url).not.toContain("_serverFn");
    expect(url).not.toContain("vercel.app");
  });

  it("uma origem forjada com caminho/credenciais não vaza para a URL de destino", () => {
    vi.stubEnv("APP_URL", "https://plataforma.vocenohype.com.br");
    const url = canonicalOriginRedirect(originOf("https://evil.example/a?next=//evil.example"));
    expect(url).toBe(`https://plataforma.vocenohype.com.br${OAUTH_RETURN_PATH}`);
  });

  it("lança erro claro quando APP_URL está ausente (quem chama devolve erro controlado)", () => {
    vi.stubEnv("APP_URL", "");
    expect(() => canonicalOriginRedirect("https://x.vercel.app")).toThrow(/APP_URL/);
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
