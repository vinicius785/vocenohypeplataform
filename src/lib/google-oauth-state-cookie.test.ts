import { describe, expect, it } from "vitest";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE_MAX_AGE_S,
  buildClearStateCookie,
  buildStateCookie,
  constantTimeEqual,
  readCookie,
} from "@/lib/google-oauth-state-cookie";

const TOKEN = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";

describe("buildStateCookie", () => {
  it("é HttpOnly, SameSite=Lax, curto (10 min), restrito a /api/google e Secure em HTTPS", () => {
    const c = buildStateCookie(TOKEN, { secure: true });
    expect(c).toContain(`${OAUTH_STATE_COOKIE}=${TOKEN}`);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Secure");
    expect(c).toContain("Path=/api/google");
    expect(c).toContain(`Max-Age=${OAUTH_STATE_COOKIE_MAX_AGE_S}`);
    expect(OAUTH_STATE_COOKIE_MAX_AGE_S).toBe(600);
    expect(c).not.toContain("Domain=");
  });

  it("em desenvolvimento (http://localhost) não marca Secure, mas mantém HttpOnly/Lax", () => {
    const c = buildStateCookie(TOKEN, { secure: false });
    expect(c).not.toContain("Secure");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
  });

  it.each(["", "a;b", "x y", "valor\\nquebra", "<script>", "a=b"])(
    "recusa valor que poderia injetar atributos ou cabeçalhos (%j)",
    (bad) => {
      expect(() => buildStateCookie(bad, { secure: true })).toThrow();
    },
  );
});

describe("buildClearStateCookie", () => {
  it("expira o cookie (Max-Age=0) com os mesmos atributos de escopo", () => {
    const c = buildClearStateCookie({ secure: true });
    expect(c).toContain(`${OAUTH_STATE_COOKIE}=;`);
    expect(c).toContain("Max-Age=0");
    expect(c).toContain("Path=/api/google");
    expect(c).toContain("HttpOnly");
  });
});

describe("readCookie", () => {
  it("lê o cookie certo entre vários", () => {
    expect(readCookie(`a=1; ${OAUTH_STATE_COOKIE}=${TOKEN}; b=2`, OAUTH_STATE_COOKIE)).toBe(TOKEN);
  });
  it("devolve null quando ausente, vazio ou sem cabeçalho", () => {
    expect(readCookie(null, OAUTH_STATE_COOKIE)).toBeNull();
    expect(readCookie("", OAUTH_STATE_COOKIE)).toBeNull();
    expect(readCookie("a=1", OAUTH_STATE_COOKIE)).toBeNull();
    expect(readCookie(`${OAUTH_STATE_COOKIE}=`, OAUTH_STATE_COOKIE)).toBeNull();
  });
  it("não confunde nomes que apenas terminam igual", () => {
    expect(readCookie(`x${OAUTH_STATE_COOKIE}=evil`, OAUTH_STATE_COOKIE)).toBeNull();
  });
});

describe("constantTimeEqual", () => {
  it("iguais → true; diferentes ou de tamanhos distintos → false", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "ab")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});
