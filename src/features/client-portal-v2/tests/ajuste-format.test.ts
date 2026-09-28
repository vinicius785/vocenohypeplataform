import { describe, expect, it } from "vitest";
import {
  activeAjuste,
  ajusteSemDetalheDisponivel,
  conteudoAindaNaoEnviado,
  entregaHasExpandableDetails,
  formatAjusteAutor,
  formatAjusteSummary,
} from "../lib/ajuste-format";

describe("formatAjusteAutor", () => {
  it("usa o nome real quando existe", () => {
    expect(formatAjusteAutor({ autorNome: "Vinícius Garcia" })).toBe("Vinícius Garcia");
  });

  it("nunca inventa um nome — cai num rótulo genérico quando ausente", () => {
    expect(formatAjusteAutor({})).toBe("Cliente");
    expect(formatAjusteAutor({ autorNome: "   " })).toBe("Cliente");
  });
});

describe("formatAjusteSummary", () => {
  it("combina autor + data/hora relativa", () => {
    const now = new Date();
    const summary = formatAjusteSummary({
      motivo: "x",
      respondedAt: now.toISOString(),
      autorNome: "Vinícius Garcia",
    });
    expect(summary).toContain("Solicitado por Vinícius Garcia");
    expect(summary).toContain("Hoje,");
  });
});

describe("activeAjuste — nunca mistura roteiro e conteúdo, nunca inventa dado", () => {
  it("retorna o ajuste de roteiro quando o estágio é ROTEIRO_AJUSTES e existe veredito", () => {
    const entrega = {
      stage: "ROTEIRO_AJUSTES",
      roteiroReprovacao: { motivo: "Trocar a abertura", respondedAt: "2026-09-24T16:42:00.000Z" },
      conteudoReprovacao: undefined,
    };
    const result = activeAjuste(entrega);
    expect(result?.kind).toBe("roteiro");
    expect(result?.veredito.motivo).toBe("Trocar a abertura");
  });

  it("retorna null quando o estágio não é de ajuste, mesmo com veredito antigo presente", () => {
    const entrega = {
      stage: "PRODUCAO",
      roteiroReprovacao: { motivo: "antigo", respondedAt: "2026-01-01T00:00:00.000Z" },
      conteudoReprovacao: undefined,
    };
    expect(activeAjuste(entrega)).toBeNull();
  });

  it("retorna null quando o estágio é de ajuste mas não há veredito gravado (dado histórico)", () => {
    const entrega = {
      stage: "CONTEUDO_AJUSTES",
      roteiroReprovacao: undefined,
      conteudoReprovacao: undefined,
    };
    expect(activeAjuste(entrega)).toBeNull();
  });
});

describe("ajusteSemDetalheDisponivel", () => {
  it("true quando o estágio pede ajuste mas não há veredito gravado", () => {
    expect(
      ajusteSemDetalheDisponivel({
        stage: "ROTEIRO_AJUSTES",
        roteiroReprovacao: undefined,
        conteudoReprovacao: undefined,
      }),
    ).toBe(true);
  });

  it("false quando existe o veredito", () => {
    expect(
      ajusteSemDetalheDisponivel({
        stage: "ROTEIRO_AJUSTES",
        roteiroReprovacao: { motivo: "x", respondedAt: "2026-01-01T00:00:00.000Z" },
        conteudoReprovacao: undefined,
      }),
    ).toBe(false);
  });

  it("false quando o estágio não é de ajuste", () => {
    expect(
      ajusteSemDetalheDisponivel({
        stage: "PRODUCAO",
        roteiroReprovacao: undefined,
        conteudoReprovacao: undefined,
      }),
    ).toBe(false);
  });
});

describe("entregaHasExpandableDetails — nunca mostra chevron sem conteúdo real", () => {
  it("false quando não há prazo, publicação, decisão pendente nem ajuste", () => {
    expect(
      entregaHasExpandableDetails(
        {
          dataPostagem: undefined,
          publicadoEm: undefined,
          url: undefined,
          stage: "PRODUCAO",
          roteiroReprovacao: undefined,
          conteudoReprovacao: undefined,
        },
        false,
      ),
    ).toBe(false);
  });

  it("true quando há uma decisão pendente do cliente (canDecide)", () => {
    expect(
      entregaHasExpandableDetails(
        {
          dataPostagem: undefined,
          publicadoEm: undefined,
          url: undefined,
          stage: "ROTEIRO_APROVACAO",
          roteiroReprovacao: undefined,
          conteudoReprovacao: undefined,
        },
        true,
      ),
    ).toBe(true);
  });

  it("true quando existe um ajuste ativo com veredito", () => {
    expect(
      entregaHasExpandableDetails(
        {
          dataPostagem: undefined,
          publicadoEm: undefined,
          url: undefined,
          stage: "CONTEUDO_AJUSTES",
          roteiroReprovacao: undefined,
          conteudoReprovacao: { motivo: "x", respondedAt: "2026-01-01T00:00:00.000Z" },
        },
        false,
      ),
    ).toBe(true);
  });
});

describe("conteudoAindaNaoEnviado", () => {
  it("true quando em produção sem link nem anexo", () => {
    expect(conteudoAindaNaoEnviado({ stage: "PRODUCAO", url: undefined, anexos: [] })).toBe(true);
  });

  it("false quando já existe um link", () => {
    expect(conteudoAindaNaoEnviado({ stage: "PRODUCAO", url: "https://x.com", anexos: [] })).toBe(
      false,
    );
  });

  it("false fora do estágio de produção", () => {
    expect(conteudoAindaNaoEnviado({ stage: "PUBLICADA", url: undefined, anexos: [] })).toBe(false);
  });
});
