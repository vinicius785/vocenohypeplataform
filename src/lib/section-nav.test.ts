import { describe, expect, it } from "vitest";
import { resolveFinanceiroTab, resolveMetasTab, resolveReunioesView } from "./section-nav";

describe("resolveFinanceiroTab", () => {
  it("mantém um valor válido", () => {
    expect(resolveFinanceiroTab("a-receber")).toBe("a-receber");
  });

  it("cai para 'resumo' quando o valor é inválido ou ausente", () => {
    expect(resolveFinanceiroTab(undefined)).toBe("resumo");
    expect(resolveFinanceiroTab("visao-geral")).toBe("resumo");
  });
});

describe("resolveMetasTab", () => {
  it("mantém um valor válido", () => {
    expect(resolveMetasTab("indicadores")).toBe("indicadores");
  });

  it("cai para 'objetivos' quando inválido", () => {
    expect(resolveMetasTab("xyz")).toBe("objetivos");
  });
});

describe("resolveReunioesView", () => {
  it("mantém um valor válido", () => {
    expect(resolveReunioesView("calendario")).toBe("calendario");
  });

  it("um valor antigo removido ('disponibilidade') cai pro default 'agenda'", () => {
    expect(resolveReunioesView("disponibilidade")).toBe("agenda");
  });

  it("cai para 'agenda' quando ausente", () => {
    expect(resolveReunioesView(undefined)).toBe("agenda");
  });
});
