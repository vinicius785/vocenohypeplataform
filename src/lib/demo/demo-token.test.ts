import { describe, expect, it } from "vitest";
import {
  DEMO_LAST_ACCESS_MIN_GAP_MS,
  DEMO_TOKEN_TTL_DAYS,
  computeAccessState,
  demoTokenExpiry,
  generateDemoToken,
  isWellFormedDemoToken,
  shouldTouchLastAccess,
} from "./demo-token";

const NOW = new Date("2026-10-05T12:00:00.000Z");

describe("generateDemoToken", () => {
  it("gera 43 caracteres base64url (32 bytes) bem formados", () => {
    const t = generateDemoToken();
    expect(t).toHaveLength(43);
    expect(isWellFormedDemoToken(t)).toBe(true);
    expect(t).not.toMatch(/[+/=]/);
  });

  it("não repete (entropia): 500 tokens distintos", () => {
    const set = new Set(Array.from({ length: 500 }, () => generateDemoToken()));
    expect(set.size).toBe(500);
  });
});

describe("isWellFormedDemoToken", () => {
  it("recusa lixo antes de tocar o banco", () => {
    for (const bad of [
      "",
      "abc",
      "a".repeat(42),
      "a".repeat(44),
      `${"a".repeat(42)}=`,
      `${"a".repeat(42)} `,
      `${"a".repeat(42)}/`,
      "../../etc/passwd".padEnd(43, "x"),
      null,
      undefined,
      42,
      {},
    ]) {
      expect(isWellFormedDemoToken(bad), String(bad)).toBe(false);
    }
  });

  it("aceita o alfabeto base64url completo", () => {
    expect(isWellFormedDemoToken(`${"A-Z_a-z0-9".padEnd(43, "x")}`)).toBe(true);
  });
});

describe("demoTokenExpiry", () => {
  it("validade padrão de 14 dias", () => {
    expect(DEMO_TOKEN_TTL_DAYS).toBe(14);
    expect(demoTokenExpiry(NOW).toISOString()).toBe("2026-10-19T12:00:00.000Z");
  });

  it("aceita outro prazo", () => {
    expect(demoTokenExpiry(NOW, 1).toISOString()).toBe("2026-10-06T12:00:00.000Z");
  });
});

describe("computeAccessState", () => {
  const base = {
    status: "active" as const,
    access_revoked_at: null,
    token_expires_at: "2026-10-19T12:00:00.000Z",
  };

  it("ativo dentro do prazo, sem revogação", () => {
    expect(computeAccessState(base, NOW)).toBe("ativo");
  });

  it("expira exatamente no instante do prazo (fronteira fechada)", () => {
    expect(computeAccessState(base, new Date("2026-10-19T11:59:59.999Z"))).toBe("ativo");
    expect(computeAccessState(base, new Date("2026-10-19T12:00:00.000Z"))).toBe("expirado");
    expect(computeAccessState(base, new Date("2026-10-20T00:00:00.000Z"))).toBe("expirado");
  });

  it("revogado vence o prazo que ainda sobra", () => {
    expect(
      computeAccessState({ ...base, access_revoked_at: "2026-10-06T00:00:00.000Z" }, NOW),
    ).toBe("revogado");
  });

  it("encerrado vence tudo — mesmo com prazo sobrando e sem revogação", () => {
    expect(computeAccessState({ ...base, status: "closed" }, NOW)).toBe("encerrado");
    expect(
      computeAccessState(
        { ...base, status: "closed", access_revoked_at: "2026-10-06T00:00:00.000Z" },
        NOW,
      ),
    ).toBe("encerrado");
  });

  it("data de validade inválida nunca libera o acesso (fail-closed)", () => {
    expect(computeAccessState({ ...base, token_expires_at: "lixo" }, NOW)).toBe("expirado");
    expect(computeAccessState({ ...base, token_expires_at: "" }, NOW)).toBe("expirado");
  });
});

describe("shouldTouchLastAccess", () => {
  it("primeiro acesso sempre grava", () => {
    expect(shouldTouchLastAccess(null, NOW)).toBe(true);
  });

  it("não grava dentro da janela mínima; grava depois dela", () => {
    const justNow = new Date(NOW.getTime() - (DEMO_LAST_ACCESS_MIN_GAP_MS - 1)).toISOString();
    const old = new Date(NOW.getTime() - DEMO_LAST_ACCESS_MIN_GAP_MS).toISOString();
    expect(shouldTouchLastAccess(justNow, NOW)).toBe(false);
    expect(shouldTouchLastAccess(old, NOW)).toBe(true);
  });

  it("valor inválido grava (corrige o dado)", () => {
    expect(shouldTouchLastAccess("lixo", NOW)).toBe(true);
  });
});
