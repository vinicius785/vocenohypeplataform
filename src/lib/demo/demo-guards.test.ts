import { describe, expect, it } from "vitest";
import {
  DEMO_ORG_NO_INVITE_MESSAGE,
  assertOrganizationIsNotDemo,
  isDemoRecipient,
} from "./demo-guards";

describe("isDemoRecipient", () => {
  it("domínio .invalid (RFC 2606) é de demonstração, em qualquer caixa", () => {
    for (const e of [
      "contato@demo.invalid",
      "A@B.INVALID",
      "x@invalid",
      " y@sub.demo.invalid",
      "z@demo.invalid ",
    ]) {
      expect(isDemoRecipient(e), e).toBe(true);
    }
  });

  it("endereços reais, vazios e malformados NÃO são bloqueados por esta regra", () => {
    for (const e of [
      "ana@praiabonita.com.br",
      "invalid@gmail.com",
      "x@invalid.com",
      "x@notinvalid",
      "sem-arroba",
      "",
      null,
      undefined,
    ]) {
      expect(isDemoRecipient(e), String(e)).toBe(false);
    }
  });
});

function adminWith(result: {
  data: Array<{ data: unknown }> | null;
  error: { message: string } | null;
}) {
  const calls: string[][] = [];
  const admin = {
    from: (t: "clientes") => ({
      select: (c: "data") => ({
        eq: (col: "organization_id", v: string) => {
          calls.push([t, c, col, v]);
          return Promise.resolve(result);
        },
      }),
    }),
  };
  return { admin, calls };
}

describe("assertOrganizationIsNotDemo", () => {
  it("organização de cliente real passa", async () => {
    const { admin, calls } = adminWith({ data: [{ data: { empresa: "X" } }], error: null });
    await expect(assertOrganizationIsNotDemo(admin, "org-1")).resolves.toBeUndefined();
    expect(calls).toEqual([["clientes", "data", "organization_id", "org-1"]]);
  });

  it("organização sem cliente (ou resposta vazia) passa", async () => {
    await expect(
      assertOrganizationIsNotDemo(adminWith({ data: [], error: null }).admin, "o"),
    ).resolves.toBeUndefined();
    await expect(
      assertOrganizationIsNotDemo(adminWith({ data: null, error: null }).admin, "o"),
    ).resolves.toBeUndefined();
  });

  it("organização de uma demo é recusada", async () => {
    const { admin } = adminWith({ data: [{ data: { demoSessionId: "s" } }], error: null });
    await expect(assertOrganizationIsNotDemo(admin, "org-demo")).rejects.toThrow(
      DEMO_ORG_NO_INVITE_MESSAGE,
    );
  });

  it("erro ao consultar recusa (fail-closed) sem vazar o detalhe", async () => {
    const { admin } = adminWith({ data: null, error: { message: "relation clientes: segredo" } });
    const err = await assertOrganizationIsNotDemo(admin, "o").catch((e: Error) => e);
    expect((err as Error).message).toBe("Não foi possível validar a organização.");
  });
});
