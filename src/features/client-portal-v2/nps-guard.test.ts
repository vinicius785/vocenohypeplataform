import { describe, expect, it } from "vitest";
import { decideNpsGuard, sanitizeNpsReturnTo } from "./nps-guard";

describe("sanitizeNpsReturnTo", () => {
  it("aceita rotas internas do portal v2 (com query)", () => {
    expect(sanitizeNpsReturnTo("/portal-v2/campanhas?x=1")).toBe("/portal-v2/campanhas?x=1");
  });
  it("rejeita externo, loop e lixo", () => {
    for (const v of [
      "https://evil.com",
      "//evil.com",
      "/portal-v2/nps",
      "/portal-v2/nps/",
      "/portal-v2x",
      "/time",
      5,
      undefined,
    ]) {
      expect(sanitizeNpsReturnTo(v)).toBe("/portal-v2/inicio");
    }
  });
});

describe("decideNpsGuard", () => {
  it("com pendência fora da rota de NPS → redireciona preservando a rota", () => {
    expect(
      decideNpsGuard({
        pathname: "/portal-v2/aprovacoes",
        href: "/portal-v2/aprovacoes?a=1",
        hasPending: true,
      }),
    ).toEqual({ action: "toNps", returnTo: "/portal-v2/aprovacoes?a=1" });
  });
  it("com pendência na rota de NPS → permite", () => {
    expect(
      decideNpsGuard({ pathname: "/portal-v2/nps", href: "/portal-v2/nps", hasPending: true }),
    ).toEqual({ action: "allow" });
  });
  it("sem pendência na rota de NPS → volta pro returnTo", () => {
    expect(
      decideNpsGuard({
        pathname: "/portal-v2/nps",
        href: "",
        hasPending: false,
        returnTo: "/portal-v2/relatorios",
      }),
    ).toEqual({ action: "leaveNps", href: "/portal-v2/relatorios" });
  });
  it("sem pendência fora do NPS → permite", () => {
    expect(
      decideNpsGuard({
        pathname: "/portal-v2/inicio",
        href: "/portal-v2/inicio",
        hasPending: false,
      }),
    ).toEqual({ action: "allow" });
  });
});
