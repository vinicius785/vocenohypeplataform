import { describe, expect, it } from "vitest";
import {
  resolveFinanceiroLegacyTarget,
  resolveFinanceiroTab,
  resolveMetasTab,
  resolveReunioesView,
} from "./section-nav";

describe("resolveFinanceiroTab", () => {
  it("mantém um valor válido", () => {
    expect(resolveFinanceiroTab("lancamentos")).toBe("lancamentos");
    expect(resolveFinanceiroTab("analises")).toBe("analises");
  });

  it("links antigos caem na área nova equivalente", () => {
    expect(resolveFinanceiroTab("movimentacoes")).toBe("lancamentos");
    expect(resolveFinanceiroTab("a-receber")).toBe("lancamentos");
    expect(resolveFinanceiroTab("a-pagar")).toBe("lancamentos");
    expect(resolveFinanceiroTab("campanhas")).toBe("analises");
    expect(resolveFinanceiroTab("relatorios")).toBe("analises");
    expect(resolveFinanceiroLegacyTarget("a-pagar")).toMatchObject({
      segment: "saidas",
      preset: "a-pagar",
    });
    expect(resolveFinanceiroLegacyTarget("campanhas").view).toBe("campanhas");
    expect(resolveFinanceiroLegacyTarget(undefined)).toEqual({
      segment: "todos",
      view: "geral",
      preset: undefined,
    });
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
    expect(resolveReunioesView("calendar")).toBe("calendar");
    expect(resolveReunioesView("requests")).toBe("requests");
  });

  it("um valor antigo removido ('disponibilidade') cai pro default 'agenda'", () => {
    expect(resolveReunioesView("disponibilidade")).toBe("agenda");
  });

  it("cai para 'agenda' quando ausente", () => {
    expect(resolveReunioesView(undefined)).toBe("agenda");
  });

  // Fase 3 da reconstrução de Reuniões: o subnav de sidebar (valores em
  // português) saiu, virou SegmentedControl + botão com valores em
  // inglês — um link antigo salvo/compartilhado antes disso não pode
  // quebrar, só cair no equivalente novo.
  it("traduz valores antigos em português (de antes da Fase 3) pros novos em inglês", () => {
    expect(resolveReunioesView("calendario")).toBe("calendar");
    expect(resolveReunioesView("solicitacoes")).toBe("requests");
  });
});
