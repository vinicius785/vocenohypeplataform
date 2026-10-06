import { describe, expect, it } from "vitest";
import { entregaFeedback } from "./influencer-next-action";
import type { Entrega } from "./influencer-model";

const v = (respondedAt: string) => ({ motivo: "ajuste", respondedAt });
const e = (o: object) => ({ id: "e", tipo: "Reels", quantidade: 1, ...o }) as unknown as Entrega;

describe("feedback novo = ajuste solicitado e ainda não reconhecido (estado salvo)", () => {
  it("novo → reconhecido → novo de novo", () => {
    expect(entregaFeedback(e({ stage: "ROTEIRO_AJUSTES", roteiroReprovacao: v("1") }))?.phase).toBe(
      "solicitados",
    );
    expect(
      entregaFeedback(e({ stage: "ROTEIRO_PRODUCAO", roteiroReprovacao: v("1") }))?.phase,
    ).toBe("em_ajustes");
    expect(
      entregaFeedback(e({ stage: "ROTEIRO_APROVACAO", roteiroReprovacao: v("1") }))?.phase,
    ).toBe("reenviado");
    expect(entregaFeedback(e({ stage: "ROTEIRO_AJUSTES", roteiroReprovacao: v("2") }))?.phase).toBe(
      "solicitados",
    );
  });
  it("sem carimbo (aprovado) não há feedback vivo", () => {
    expect(entregaFeedback(e({ stage: "PRODUCAO" }))).toBeNull();
  });
});
