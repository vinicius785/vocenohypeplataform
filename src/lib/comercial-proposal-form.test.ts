import { describe, expect, it } from "vitest";
import type { PropostaSnapshot } from "@/lib/comercial";
import { isProposalDirty, proposalBaseline, valueImpactMessage } from "./comercial-proposal-form";

const DEFAULT = { tier: "nano", formato: "feed_post", qtd: 1 };
const saved: PropostaSnapshot = {
  linhas: [
    { tier: "micro", formato: "reels_video", qtd: 2 },
    { tier: "nano", formato: "stories_3x", qtd: 1 },
  ],
  percentuais: { imposto: 0.085, comissao: 0.05, bonificacao: 0.03, margem: 0.3 },
  custoTotal: 1000,
  precoFinal: 1869,
  precoCalculado: 1869,
  ajustadoManualmente: false,
  calculadoEm: 1,
};

describe("proposalBaseline / isProposalDirty", () => {
  it("sem proposta salva, a base é a linha padrão e nada manual", () => {
    const base = proposalBaseline(undefined, DEFAULT);
    expect(base).toEqual({ linhas: [DEFAULT], precoManual: null });
    expect(isProposalDirty({ linhas: [DEFAULT], precoManual: null }, base)).toBe(false);
  });

  it("igual à salva não é alteração (inclusive depois de aplicar)", () => {
    const base = proposalBaseline(saved, DEFAULT);
    expect(isProposalDirty({ linhas: saved.linhas, precoManual: null }, base)).toBe(false);
  });

  it("mudar tier, formato, quantidade, adicionar ou remover linha é alteração", () => {
    const base = proposalBaseline(saved, DEFAULT);
    const l = saved.linhas;
    expect(
      isProposalDirty({ linhas: [{ ...l[0], tier: "macro" }, l[1]], precoManual: null }, base),
    ).toBe(true);
    expect(
      isProposalDirty({ linhas: [{ ...l[0], formato: "live" }, l[1]], precoManual: null }, base),
    ).toBe(true);
    expect(isProposalDirty({ linhas: [{ ...l[0], qtd: 3 }, l[1]], precoManual: null }, base)).toBe(
      true,
    );
    expect(isProposalDirty({ linhas: [...l, DEFAULT], precoManual: null }, base)).toBe(true);
    expect(isProposalDirty({ linhas: [l[0]], precoManual: null }, base)).toBe(true);
  });

  it("preço manual: digitar é alteração; proposta salva como ajustada tem o manual como base", () => {
    const base = proposalBaseline(saved, DEFAULT);
    expect(isProposalDirty({ linhas: saved.linhas, precoManual: 2000 }, base)).toBe(true);
    const adjusted = { ...saved, ajustadoManualmente: true, precoFinal: 2000 };
    const baseAdj = proposalBaseline(adjusted, DEFAULT);
    expect(baseAdj.precoManual).toBe(2000);
    expect(isProposalDirty({ linhas: saved.linhas, precoManual: 2000 }, baseAdj)).toBe(false);
    expect(isProposalDirty({ linhas: saved.linhas, precoManual: null }, baseAdj)).toBe(true);
  });
});

describe("valueImpactMessage", () => {
  const norm = (s: string | null) => s?.replace(/\u00a0/g, " ");
  it("de X para Y, ou 'será Y' quando o valor atual é zero", () => {
    expect(norm(valueImpactMessage(100000, 374))).toBe(
      "O valor do negócio passa de R$ 100.000 para R$ 374.",
    );
    expect(norm(valueImpactMessage(0, 374))).toBe("O valor do negócio será R$ 374.");
  });
  it("sem mudança (mesmo valor arredondado) → null", () => {
    expect(valueImpactMessage(374, 373.83)).toBeNull();
  });
});
