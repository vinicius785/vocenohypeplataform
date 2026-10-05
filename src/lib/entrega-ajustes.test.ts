import { describe, expect, it } from "vitest";
import type { Entrega } from "@/lib/influencer-model";
import {
  ajusteNextStep,
  anexoAtualizadoDesde,
  entregaAjusteView,
  entregaStatusLabel,
  feedbackExcerpt,
  formatFeedbackWhen,
  historyActionText,
} from "./entrega-ajustes";
import { applyEntregaAction, deriveEntregaNextStep } from "./entrega-engine";

const V = {
  motivo: "Falar o nome do Poupa Tempo RJ",
  respondedAt: "2026-10-05T19:04:00.000Z",
  autorNome: "Julia",
};
const base = (o: Partial<Entrega>): Entrega =>
  ({
    id: "e",
    tipo: "Reels",
    quantidade: 1,
    status: "combinado",
    stage: "ROTEIRO_PRODUCAO",
    ...o,
  }) as Entrega;

describe("ciclo de ajustes (apresentação sobre a máquina existente)", () => {
  it("sem feedback do cliente não há ciclo", () => {
    expect(entregaAjusteView(base({ stage: "ROTEIRO_PRODUCAO" }))).toBeNull();
    expect(entregaStatusLabel(base({ stage: "ROTEIRO_APROVACAO" }))).toBe(
      "Roteiro aguardando cliente",
    );
  });
  it("roteiro: solicitados → em ajustes → reenviado, pelo stage + feedback marcado", () => {
    expect(entregaAjusteView(base({ stage: "ROTEIRO_AJUSTES", roteiroReprovacao: V }))?.phase).toBe(
      "solicitados",
    );
    expect(
      entregaAjusteView(base({ stage: "ROTEIRO_PRODUCAO", roteiroReprovacao: V }))?.phase,
    ).toBe("em_ajustes");
    expect(
      entregaAjusteView(base({ stage: "ROTEIRO_APROVACAO", roteiroReprovacao: V }))?.phase,
    ).toBe("reenviado");
  });
  it("aprovado limpa o feedback e o ciclo some", () => {
    expect(entregaAjusteView(base({ stage: "PRODUCAO" }))).toBeNull();
  });
  it("conteúdo final segue o mesmo ciclo", () => {
    const a = entregaAjusteView(base({ stage: "CONTEUDO_AJUSTES", conteudoReprovacao: V }));
    expect(a).toMatchObject({
      phase: "solicitados",
      etapa: "conteudo",
      categoria: "Conteúdo final",
    });
    expect(entregaAjusteView(base({ stage: "PRODUCAO", conteudoReprovacao: V }))?.phase).toBe(
      "em_ajustes",
    );
  });
  it("rótulos do status", () => {
    expect(entregaStatusLabel(base({ stage: "ROTEIRO_AJUSTES", roteiroReprovacao: V }))).toBe(
      "Ajustes solicitados",
    );
    expect(entregaStatusLabel(base({ stage: "ROTEIRO_PRODUCAO", roteiroReprovacao: V }))).toBe(
      "Em ajustes",
    );
    expect(entregaStatusLabel(base({ stage: "ROTEIRO_APROVACAO", roteiroReprovacao: V }))).toBe(
      "Reenviado para aprovação",
    );
  });
});

describe("próximo passo = ação que o motor já considera válida", () => {
  const anexos = [{ id: "a", categoria: "Roteiro" as const, nome: "r.pdf", url: "u" }];
  it("ajustes solicitados: 'Editar roteiro' (reconhece o ajuste)", () => {
    const e = base({ stage: "ROTEIRO_AJUSTES", roteiroReprovacao: V, anexos });
    const a = entregaAjusteView(e)!;
    const step = ajusteNextStep(a, deriveEntregaNextStep(e).action);
    expect(step).toMatchObject({
      label: "Editar roteiro",
      action: "reconhecer_ajustes_roteiro",
      kind: "editar",
    });
    expect(applyEntregaAction(e, step!.action)).toEqual({ stage: "ROTEIRO_PRODUCAO" });
  });
  it("em ajustes: 'Enviar novamente para aprovação' (enviar_roteiro volta a aguardando)", () => {
    const e = base({ stage: "ROTEIRO_PRODUCAO", roteiroReprovacao: V, anexos });
    const step = ajusteNextStep(entregaAjusteView(e)!, deriveEntregaNextStep(e).action);
    expect(step).toMatchObject({
      label: "Enviar novamente para aprovação",
      action: "enviar_roteiro",
    });
    expect(applyEntregaAction(e, step!.action)).toEqual({ stage: "ROTEIRO_APROVACAO" });
  });
  it("em ajustes sem arquivo de roteiro: o motor pede para adicionar, então não há 'reenviar'", () => {
    const e = base({ stage: "ROTEIRO_PRODUCAO", roteiroReprovacao: V, anexos: [] });
    expect(ajusteNextStep(entregaAjusteView(e)!, deriveEntregaNextStep(e).action)).toBeNull();
  });
  it("reenviado: nada a fazer (aguarda o cliente)", () => {
    const e = base({ stage: "ROTEIRO_APROVACAO", roteiroReprovacao: V, anexos });
    expect(ajusteNextStep(entregaAjusteView(e)!, deriveEntregaNextStep(e).action)).toBeNull();
  });
});

describe("arquivo novo desde o feedback", () => {
  const mk = (o: { criadoEm?: string; criadoEmTs?: string }) => ({
    anexos: [{ id: "a", categoria: "Roteiro" as const, nome: "r", url: "u", ...o }],
  });
  it("com instante exato, compara no mesmo dia", () => {
    expect(
      anexoAtualizadoDesde(
        mk({ criadoEmTs: "2026-10-05T20:00:00.000Z" }),
        "Roteiro",
        V.respondedAt,
      ),
    ).toBe(true);
    expect(
      anexoAtualizadoDesde(
        mk({ criadoEmTs: "2026-10-05T10:00:00.000Z" }),
        "Roteiro",
        V.respondedAt,
      ),
    ).toBe(false);
  });
  it("anexo antigo (só o dia): só conta dia posterior ao do feedback", () => {
    expect(anexoAtualizadoDesde(mk({ criadoEm: "2026-10-06" }), "Roteiro", V.respondedAt)).toBe(
      true,
    );
    expect(anexoAtualizadoDesde(mk({ criadoEm: "2026-10-05" }), "Roteiro", V.respondedAt)).toBe(
      false,
    );
    expect(anexoAtualizadoDesde(mk({}), "Roteiro", V.respondedAt)).toBe(false);
  });
  it("só da categoria pedida", () => {
    expect(
      anexoAtualizadoDesde(
        mk({ criadoEmTs: "2026-10-05T20:00:00.000Z" }),
        "Conteúdo final",
        V.respondedAt,
      ),
    ).toBe(false);
  });
});

describe("textos", () => {
  it("quando", () => {
    const now = new Date(2026, 9, 5, 18, 0);
    expect(formatFeedbackWhen(new Date(2026, 9, 5, 16, 4).toISOString(), now)).toBe(
      "hoje às 16:04",
    );
    expect(formatFeedbackWhen(new Date(2026, 9, 4, 9, 30).toISOString(), now)).toBe(
      "ontem às 09:30",
    );
    expect(formatFeedbackWhen(new Date(2026, 8, 1, 9, 30).toISOString(), now)).toBe(
      "01/09 às 09:30",
    );
  });
  it("resumo do feedback", () => {
    expect(feedbackExcerpt("curto")).toEqual({ text: "curto", truncated: false });
    const long = feedbackExcerpt("x".repeat(300), 100);
    expect(long.truncated).toBe(true);
    expect(long.text.length).toBeLessThanOrEqual(101);
  });
  it("histórico não repete o feedback inteiro", () => {
    expect(
      historyActionText("solicitou ajustes em o roteiro de uma entrega — falar o nome do Poupa"),
    ).toBe("solicitou ajustes no roteiro");
    expect(historyActionText("solicitou ajustes em o conteúdo de uma entrega — outra coisa")).toBe(
      "solicitou ajustes no conteúdo",
    );
    expect(historyActionText("anexou o roteiro")).toBe("anexou o roteiro");
  });
});
