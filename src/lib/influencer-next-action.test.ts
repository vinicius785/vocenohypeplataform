import { describe, expect, it } from "vitest";
import type { Entrega, Influ } from "./influencer-model";
import { clientFeedbacks, entregaTone, nextBestAction } from "./influencer-next-action";

const ent = (o: Partial<Entrega> = {}): Entrega =>
  ({
    id: "e1",
    tipo: "Reels",
    quantidade: 1,
    status: "combinado",
    stage: "ROTEIRO_PRODUCAO",
    ...o,
  }) as Entrega;
const influ = (o: Partial<Influ> = {}): Influ =>
  ({ id: "i", nome: "Ana", status: "APROVADO", entregas: [], redes: [], ...o }) as Influ;

describe("próxima melhor ação", () => {
  it("recém-aprovado sem entregas → adicionar entrega", () => {
    expect(nextBestAction(influ()).kind).toBe("adicionar_entrega");
  });
  it("em curadoria → enviar ao cliente; inscrito → mover; enviado → aguardando", () => {
    expect(nextBestAction(influ({ status: "EM_CURADORIA" })).kind).toBe("enviar_cliente");
    expect(nextBestAction(influ({ status: "INSCRITO" })).kind).toBe("avancar_status");
    expect(nextBestAction(influ({ status: "ENVIADO_AO_CLIENTE" })).kind).toBe("aguardando");
    expect(nextBestAction(influ({ status: "RECUSADO" })).kind).toBe("nenhuma");
  });
  it("sem roteiro → anexar roteiro (uma só ação, com contagem das outras)", () => {
    const a = nextBestAction(influ({ entregas: [ent(), ent({ id: "e2" })] }));
    expect(a).toMatchObject({
      kind: "entrega",
      action: "anexar_roteiro",
      area: "Roteiro",
      others: 1,
    });
  });
  it("cliente pediu ajuste vence prazo mais próximo", () => {
    const a = nextBestAction(
      influ({
        entregas: [
          ent({ id: "a", dataPostagem: "2026-10-01" }),
          ent({
            id: "b",
            stage: "ROTEIRO_AJUSTES",
            roteiroReprovacao: { motivo: "x", respondedAt: "2026-10-05T10:00:00Z" },
          }),
        ],
      }),
    );
    expect(a).toMatchObject({
      kind: "entrega",
      entregaId: "b",
      action: "reconhecer_ajustes_roteiro",
    });
  });
  it("aguardando aprovação do cliente → aguardando com 'Ver roteiro'", () => {
    const a = nextBestAction(influ({ entregas: [ent({ stage: "ROTEIRO_APROVACAO" })] }));
    expect(a).toMatchObject({ kind: "aguardando", label: "Ver roteiro", entregaId: "e1" });
  });
  it("o financeiro não gera próxima ação (ele vive em Recursos → Financeiro)", () => {
    const e = [ent({ stage: "ROTEIRO_APROVACAO" })];
    expect(nextBestAction(influ({ entregas: e })).kind).toBe("aguardando");
    expect(nextBestAction(influ({ entregas: [ent({ stage: "PUBLICADA" })] })).kind).toBe("nenhuma");
  });
  it("tudo publicado → nenhuma", () => {
    expect(nextBestAction(influ({ entregas: [ent({ stage: "PUBLICADA" })] })).kind).toBe("nenhuma");
  });
});

describe("tom da entrega e feedback", () => {
  it("tons", () => {
    expect(entregaTone(ent({ stage: "PUBLICADA" }))).toBe("ok");
    expect(entregaTone(ent({ stage: "ROTEIRO_APROVACAO" }))).toBe("waiting");
    expect(entregaTone(ent({ stage: "PRODUCAO" }))).toBe("progress");
    expect(
      entregaTone(
        ent({ stage: "CONTEUDO_AJUSTES", conteudoReprovacao: { motivo: "m", respondedAt: "x" } }),
      ),
    ).toBe("alert");
  });
  it("feedback vivo, mais recente primeiro; sem feedback → lista vazia", () => {
    expect(clientFeedbacks(influ({ entregas: [ent()] }))).toEqual([]);
    const f = clientFeedbacks(
      influ({
        entregas: [
          ent({
            id: "a",
            stage: "ROTEIRO_AJUSTES",
            roteiroReprovacao: { motivo: "velho", respondedAt: "2026-10-01T10:00:00Z" },
          }),
          ent({
            id: "b",
            stage: "CONTEUDO_AJUSTES",
            conteudoReprovacao: {
              motivo: "novo",
              respondedAt: "2026-10-05T10:00:00Z",
              autorNome: "Julia",
            },
          }),
        ],
      }),
    );
    expect(f.map((x) => x.entregaId)).toEqual(["b", "a"]);
    expect(f[0]).toMatchObject({
      etapaLabel: "Conteúdo",
      statusLabel: "Aguardando novo envio",
      autorNome: "Julia",
    });
  });
});
