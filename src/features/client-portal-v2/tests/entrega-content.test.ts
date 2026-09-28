import { describe, expect, it } from "vitest";
import {
  anexosPorCategoria,
  arquivosDaEntrega,
  conteudoAtual,
  entregaTemDetalhes,
  roteiroAtual,
} from "../lib/entrega-content";

const entregaComVersoes = {
  anexos: [
    { id: "a1", categoria: "Conteúdo final", nome: "v1.mp4", url: "u1", versao: 1 },
    { id: "a2", categoria: "Conteúdo final", nome: "v2.mp4", url: "u2", versao: 2 },
    { id: "a3", categoria: "Roteiro", nome: "roteiro.pdf", url: "u3", versao: 1 },
    { id: "a4", categoria: "Gravação", nome: "bruta.mp4", url: "u4" },
    { id: "a5", categoria: "Outro", nome: "referencia.pdf", url: "u5" },
  ],
};

describe("anexosPorCategoria — nunca mistura categorias, ordena do mais recente pro mais antigo", () => {
  it("filtra só a categoria pedida e ordena por versão desc", () => {
    const versions = anexosPorCategoria(entregaComVersoes, "Conteúdo final");
    expect(versions.map((v) => v.id)).toEqual(["a2", "a1"]);
  });

  it("trata versão ausente como v1 pra ordenação", () => {
    const entrega = {
      anexos: [
        { id: "x1", categoria: "Outro", nome: "a", url: "u" },
        { id: "x2", categoria: "Outro", nome: "b", url: "u", versao: 2 },
      ],
    };
    expect(anexosPorCategoria(entrega, "Outro").map((v) => v.id)).toEqual(["x2", "x1"]);
  });
});

describe("conteudoAtual / roteiroAtual", () => {
  it("retorna a versão mais recente de cada categoria, nunca a mais antiga", () => {
    expect(conteudoAtual(entregaComVersoes)?.id).toBe("a2");
    expect(roteiroAtual(entregaComVersoes)?.id).toBe("a3");
  });

  it("retorna null quando a categoria não tem nenhum anexo", () => {
    expect(conteudoAtual({ anexos: [] })).toBeNull();
  });
});

describe("arquivosDaEntrega — nunca duplica roteiro/conteúdo, que já aparecem em suas próprias seções", () => {
  it("exclui Roteiro e Conteúdo final, mantém o resto", () => {
    const arquivos = arquivosDaEntrega(entregaComVersoes);
    expect(arquivos.map((a) => a.id).sort()).toEqual(["a4", "a5"]);
  });
});

describe("entregaTemDetalhes — nunca mostra chevron sem conteúdo real", () => {
  it("false sem prazo, publicação, decisão, anexo ou ajuste", () => {
    expect(
      entregaTemDetalhes(
        {
          dataPostagem: undefined,
          publicadoEm: undefined,
          url: undefined,
          anexos: [],
          roteiroReprovacao: undefined,
          conteudoReprovacao: undefined,
        },
        false,
      ),
    ).toBe(false);
  });

  it("true quando existe qualquer anexo", () => {
    expect(
      entregaTemDetalhes(
        {
          dataPostagem: undefined,
          publicadoEm: undefined,
          url: undefined,
          anexos: [{ id: "a", categoria: "Roteiro", nome: "x", url: "u" }],
          roteiroReprovacao: undefined,
          conteudoReprovacao: undefined,
        },
        false,
      ),
    ).toBe(true);
  });
});
