import { describe, expect, it } from "vitest";
import { isVisibleToClientPortal } from "@/lib/cliente-link.functions";
import type { Campaign } from "@/components/VincularCampanhaDialog";

/**
 * Visibilidade no Portal do Cliente é decidida só aqui (servidor) — nunca
 * no frontend. Cobre a regra central: negociação/arquivada nunca aparecem;
 * ativa/concluída aparecem só quando `clientVisible` não for `false`
 * explicitamente (nunca derivado do `status`).
 */
function baseCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "c1",
    nome: "Campanha",
    briefing: "",
    prazo: "",
    linhas: [],
    valorCliente: "",
    orcamento: "",
    pagTipos: [],
    pagConfig: { Valor: {}, "Por Hora": {}, Comissão: {}, Permuta: {}, Outro: {} },
    prazoPag: "",
    ...overrides,
  };
}

describe("isVisibleToClientPortal", () => {
  it("campanha em negociação nunca aparece por padrão", () => {
    expect(isVisibleToClientPortal(baseCampaign({ status: "negotiation" }))).toBe(false);
  });

  it("campanha arquivada nunca aparece", () => {
    expect(isVisibleToClientPortal(baseCampaign({ status: "archived" }))).toBe(false);
  });

  it("campanha ativa aparece por padrão (clientVisible ausente = true)", () => {
    expect(isVisibleToClientPortal(baseCampaign({ status: "active" }))).toBe(true);
  });

  it("campanha concluída continua visível pra consulta", () => {
    expect(isVisibleToClientPortal(baseCampaign({ status: "completed" }))).toBe(true);
  });

  it("clientVisible=false esconde mesmo uma campanha ativa — visibilidade nunca é só o status", () => {
    expect(isVisibleToClientPortal(baseCampaign({ status: "active", clientVisible: false }))).toBe(
      false,
    );
  });

  it("sem status persistido (fallback negotiation) também não aparece", () => {
    expect(isVisibleToClientPortal(baseCampaign({ status: undefined }))).toBe(false);
  });
});
