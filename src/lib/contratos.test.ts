import { describe, expect, it } from "vitest";
import {
  clienteTemContratoVigente,
  contratoCobreCampanha,
  isContratoProximoDoVencimento,
  mapContratoRow,
  type Contrato,
  type ContratoRow,
} from "./contratos";

function baseRow(overrides: Partial<ContratoRow> = {}): ContratoRow {
  return {
    id: "c1",
    cliente_id: "cl1",
    nome: "Contrato de prestação de serviço",
    tipo: null,
    status: "rascunho",
    vigencia_inicio: null,
    vigencia_fim: null,
    data_assinatura: null,
    valor: null,
    arquivo_url: null,
    campanha_ids: null,
    responsavel_interno: null,
    observacoes: null,
    renovacao: null,
    criado_por: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function baseContrato(overrides: Partial<Contrato> = {}): Contrato {
  return {
    id: "c1",
    clienteId: "cl1",
    nome: "Contrato",
    tipo: null,
    status: "vigente",
    vigenciaInicio: null,
    vigenciaFim: null,
    dataAssinatura: null,
    valor: null,
    arquivoUrl: null,
    campanhaIds: [],
    responsavelInterno: null,
    observacoes: null,
    renovacao: null,
    criadoPor: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("mapContratoRow", () => {
  it("mapeia a linha do banco preservando null (nunca inventa 0/string vazia)", () => {
    const c = mapContratoRow(baseRow());
    expect(c.valor).toBeNull();
    expect(c.vigenciaFim).toBeNull();
    expect(c.campanhaIds).toEqual([]);
  });

  it("cai em 'rascunho' se o status vier fora da lista conhecida (defensivo)", () => {
    const c = mapContratoRow(baseRow({ status: "algo-invalido" }));
    expect(c.status).toBe("rascunho");
  });

  it("preserva campanha_ids quando presente", () => {
    const c = mapContratoRow(baseRow({ campanha_ids: ["camp1", "camp2"] }));
    expect(c.campanhaIds).toEqual(["camp1", "camp2"]);
  });
});

describe("isContratoProximoDoVencimento", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("é true quando vigente e vence dentro da janela", () => {
    const c = baseContrato({ status: "vigente", vigenciaFim: "2026-06-10" });
    expect(isContratoProximoDoVencimento(c, 30, now)).toBe(true);
  });

  it("é false quando o vencimento está fora da janela", () => {
    const c = baseContrato({ status: "vigente", vigenciaFim: "2026-12-31" });
    expect(isContratoProximoDoVencimento(c, 30, now)).toBe(false);
  });

  it("é false sem vigenciaFim (nunca inventa vencimento)", () => {
    const c = baseContrato({ status: "vigente", vigenciaFim: null });
    expect(isContratoProximoDoVencimento(c, 30, now)).toBe(false);
  });

  it("é false para contrato não vigente, mesmo com data próxima", () => {
    const c = baseContrato({ status: "encerrado", vigenciaFim: "2026-06-05" });
    expect(isContratoProximoDoVencimento(c, 30, now)).toBe(false);
  });

  it("é false para vencimento já no passado", () => {
    const c = baseContrato({ status: "vigente", vigenciaFim: "2026-01-01" });
    expect(isContratoProximoDoVencimento(c, 30, now)).toBe(false);
  });
});

describe("contratoCobreCampanha", () => {
  it("true quando a campanha está na lista", () => {
    const c = baseContrato({ campanhaIds: ["camp1"] });
    expect(contratoCobreCampanha(c, "camp1")).toBe(true);
  });

  it("false quando não está", () => {
    const c = baseContrato({ campanhaIds: ["camp1"] });
    expect(contratoCobreCampanha(c, "camp2")).toBe(false);
  });
});

describe("clienteTemContratoVigente", () => {
  it("true se algum contrato está vigente", () => {
    expect(
      clienteTemContratoVigente([
        baseContrato({ status: "rascunho" }),
        baseContrato({ status: "vigente" }),
      ]),
    ).toBe(true);
  });

  it("false sem nenhum contrato vigente", () => {
    expect(
      clienteTemContratoVigente([
        baseContrato({ status: "rascunho" }),
        baseContrato({ status: "encerrado" }),
      ]),
    ).toBe(false);
  });

  it("false com lista vazia", () => {
    expect(clienteTemContratoVigente([])).toBe(false);
  });
});
