import { describe, expect, it } from "vitest";
import {
  FLUXO_MIN_AVALIAVEIS,
  approvalFlowByPerson,
  computeFluxo,
  evaluateTaskApproval,
  type FlowTaskNode,
} from "./approval-flow";
import {
  combineScoreV2,
  computeCompromissos,
  computeEntrega,
  computeMemberScoreV2,
  computePrevisibilidade,
  sampleConfidence,
} from "./performance-engine";
import { explainScore, scoreDimensionRows } from "./score-explanation";

const st = (status: string, at: string) => ({
  action: `mudou status para ${status}`,
  createdAt: at,
});

describe("transições reais → fluxo sem retrabalho", () => {
  it("produção → aprovação → aprovado = SEM retrabalho", () => {
    const r = evaluateTaskApproval([
      st("Em andamento", "2026-10-01T10:00:00"),
      st("Em aprovação", "2026-10-02T10:00:00"),
      st("Aprovado", "2026-10-03T10:00:00"),
    ]);
    expect(r).toEqual({ resolvedAt: "2026-10-03T10:00:00", cycles: 0 });
  });
  it("produção → aprovação → ajustes → aprovação → aprovado = 1 retrabalho", () => {
    const r = evaluateTaskApproval([
      st("Em andamento", "2026-10-01T10:00:00"),
      st("Em aprovação", "2026-10-02T10:00:00"),
      st("Em ajustes", "2026-10-03T10:00:00"),
      st("Em aprovação", "2026-10-04T10:00:00"),
      st("Aprovado", "2026-10-05T10:00:00"),
    ]);
    expect(r?.cycles).toBe(1);
  });
  it("vários ciclos de ajuste: continua 1 entrega com retrabalho, ciclos registrados", () => {
    const node: FlowTaskNode = {
      id: "t",
      assignees: ["Ana"],
      activity: [
        st("Em aprovação", "2026-10-02T10:00:00"),
        st("Em ajustes", "2026-10-03T10:00:00"),
        st("Em aprovação", "2026-10-04T10:00:00"),
        st("Em ajustes", "2026-10-05T10:00:00"),
        st("Em aprovação", "2026-10-06T10:00:00"),
        st("Em ajustes", "2026-10-07T10:00:00"),
        st("Em aprovação", "2026-10-08T10:00:00"),
        st("Concluído", "2026-10-09T10:00:00"),
      ],
    };
    const s = approvalFlowByPerson([node], { from: "2026-10-01", to: "2026-10-31" }).get("Ana")!;
    expect(s).toEqual({ evaluated: 1, withAdjustments: 1, cycles: 3 });
    expect(computeFluxo({ ...s, evaluated: 3, withAdjustments: 1 }).avgCycles).toBe(3);
  });
  it("entrega que nunca passou por aprovação, ou ainda não foi resolvida, NÃO entra", () => {
    expect(
      evaluateTaskApproval([
        st("Em andamento", "2026-10-01T10:00:00"),
        st("Concluído", "2026-10-02T10:00:00"),
      ]),
    ).toBeNull();
    expect(evaluateTaskApproval([st("Em aprovação", "2026-10-02T10:00:00")])).toBeNull();
    expect(
      evaluateTaskApproval([
        st("Em aprovação", "2026-10-02T10:00:00"),
        st("Em ajustes", "2026-10-03T10:00:00"),
      ]),
    ).toBeNull();
    expect(evaluateTaskApproval(undefined)).toBeNull();
  });
  it("só TRANSIÇÃO de status conta: texto de comentário/atividade parecida não vira ajuste", () => {
    const r = evaluateTaskApproval([
      st("Em aprovação", "2026-10-02T10:00:00"),
      { action: "comentou: precisa de ajustes no roteiro", createdAt: "2026-10-02T12:00:00" },
      { action: "mudou o prazo para Em ajustes", createdAt: "2026-10-02T13:00:00" },
      st("Aprovado", "2026-10-03T10:00:00"),
    ]);
    expect(r?.cycles).toBe(0);
  });
  it("ajuste ANTES da primeira aprovação (produção) não é retrabalho de aprovação", () => {
    const r = evaluateTaskApproval([
      st("Em ajustes", "2026-10-01T10:00:00"),
      st("Em aprovação", "2026-10-02T10:00:00"),
      st("Aprovado", "2026-10-03T10:00:00"),
    ]);
    expect(r?.cycles).toBe(0);
  });
  it("Aprovado seguido de Concluído não vira segunda avaliação; vale o 1º momento aprovado", () => {
    const r = evaluateTaskApproval([
      st("Em aprovação", "2026-10-02T10:00:00"),
      st("Aprovado", "2026-10-03T10:00:00"),
      st("Concluído", "2026-10-20T10:00:00"),
    ]);
    expect(r?.resolvedAt).toBe("2026-10-03T10:00:00");
  });
  it("só entram as resolvidas dentro do período; responsável principal recebe, colaboradores não", () => {
    const mk = (id: string, resolved: string, extra: Partial<FlowTaskNode> = {}): FlowTaskNode => ({
      id,
      assignees: ["Ana", "Bia"],
      primaryAssignee: "Ana",
      activity: [st("Em aprovação", "2026-09-01T10:00:00"), st("Aprovado", resolved)],
      ...extra,
    });
    const by = approvalFlowByPerson(
      [
        mk("a", "2026-10-05T10:00:00"),
        mk("b", "2026-09-05T10:00:00"),
        mk("c", "2026-10-06T10:00:00", { primaryAssignee: undefined }),
      ],
      { from: "2026-10-01", to: "2026-10-31" },
    );
    expect(by.get("Ana")?.evaluated).toBe(2); // a (principal) + c (sem principal → todos)
    expect(by.get("Bia")?.evaluated).toBe(1); // só c
  });
  it("tipos diferentes de tarefa (subtarefa) são avaliados com o mesmo fluxo", () => {
    const by = approvalFlowByPerson(
      [
        {
          id: "mae",
          assignees: ["Ana"],
          activity: [],
          subtasks: [
            {
              id: "sub",
              assignees: ["Ana"],
              activity: [
                st("Em aprovação", "2026-10-02T10:00:00"),
                st("Em ajustes", "2026-10-03T10:00:00"),
                st("Aprovado", "2026-10-04T10:00:00"),
              ],
            },
          ],
        },
      ],
      { from: "2026-10-01", to: "2026-10-31" },
    );
    expect(by.get("Ana")).toEqual({ evaluated: 1, withAdjustments: 1, cycles: 1 });
  });
});

describe("fluxo → pontos e score v3", () => {
  it("80% sem ajustes = 8/10 pontos (16 de 20)", () => {
    const f = computeFluxo({ evaluated: 20, withAdjustments: 4, cycles: 5 });
    expect(f.rate).toBe(0.8);
    expect(f.value).toBe(8);
    expect(f.clean).toBe(16);
    expect(f.avgCycles).toBe(1.25);
  });
  it("amostra mínima: abaixo disso a dimensão não pontua (peso redistribuído)", () => {
    const f = computeFluxo({ evaluated: FLUXO_MIN_AVALIAVEIS - 1, withAdjustments: 0, cycles: 0 });
    expect(f.value).toBeNull();
    expect(f.insufficient).toBe(true);
    expect(computeFluxo(undefined).value).toBeNull();
  });
  const base = () => {
    const entrega = computeEntrega(
      Array.from({ length: 10 }, () => ({ outcome: "on_time" as const, hasDeadline: true })),
      [],
      new Date("2026-10-06T10:00:00"),
    );
    return {
      entrega,
      prev: computePrevisibilidade([], entrega.periodTaskBase),
      comp: computeCompromissos([{ attended: true }]),
    };
  };
  it("4 dimensões aplicáveis: pesos 50/25/15/10 somam 100 e os pontos exibidos somam o score", () => {
    const { entrega, prev, comp } = base();
    const s = combineScoreV2(
      entrega,
      prev,
      comp,
      computeFluxo({ evaluated: 10, withAdjustments: 2, cycles: 2 }),
    );
    expect(
      s.entregaPontos! + s.previsibilidadePontos! + s.compromissosPontos! + s.fluxoPontos!,
    ).toBe(s.score);
    expect(s.score).toBe(98); // 100% prazo, 100% previsib., 100% compromissos, 80% fluxo
    expect(s.version).toBe(3);
  });
  it("sem dados de fluxo: dimensão fora e demais redistribuídas para 100", () => {
    const { entrega, prev, comp } = base();
    const s = combineScoreV2(
      entrega,
      prev,
      comp,
      computeFluxo({ evaluated: 1, withAdjustments: 1, cycles: 1 }),
    );
    expect(s.fluxoAplicavel).toBe(false);
    expect(s.score).toBe(100);
  });
  it("nenhuma dimensão com dado: sem score; confiança da amostra continua separada do número", () => {
    const s = computeMemberScoreV2([], [], 19, new Date("2026-10-06T10:00:00"));
    expect(s.score).toBeNull();
    expect(s.dataState).toBe("sem_dados");
    expect(sampleConfidence(25)).toBe("media");
    const { entrega, prev, comp } = base();
    const x = combineScoreV2(
      entrega,
      prev,
      comp,
      computeFluxo({ evaluated: 4, withAdjustments: 1, cycles: 1 }),
    );
    expect(x.confidence).toBe(sampleConfidence(entrega.periodTaskBase));
  });
  it("carga ≠ desempenho: 20 e 5 tarefas com o mesmo perfil têm o mesmo score", () => {
    const mk = (n: number) =>
      combineScoreV2(
        computeEntrega(
          Array.from({ length: n }, () => ({ outcome: "on_time" as const, hasDeadline: true })),
          [],
          new Date(),
        ),
        computePrevisibilidade([], n),
        computeCompromissos([]),
        computeFluxo({ evaluated: 4, withAdjustments: 0, cycles: 0 }),
      );
    expect(mk(20).score).toBe(mk(5).score);
  });
});

describe("explicação: sempre os mesmos números do motor", () => {
  it("frase e linhas derivam do ScoreOperacionalV2", () => {
    const { entrega, prev, comp } = (() => {
      const e = computeEntrega(
        [
          ...Array.from({ length: 9 }, () => ({ outcome: "on_time" as const, hasDeadline: true })),
          { outcome: "late" as const, hasDeadline: true },
        ],
        [],
        new Date("2026-10-06T10:00:00"),
      );
      return {
        entrega: e,
        prev: computePrevisibilidade(
          [
            { taskId: "a", from: "2026-10-06", occurredAt: "2026-10-03T10:00:00" },
            { taskId: "b", from: "2026-10-06", occurredAt: "2026-10-06T10:00:00" },
          ],
          e.periodTaskBase,
        ),
        comp: computeCompromissos([{ attended: true }, { attended: true }]),
      };
    })();
    const s = combineScoreV2(
      entrega,
      prev,
      comp,
      computeFluxo({ evaluated: 20, withAdjustments: 4, cycles: 5 }),
    );
    const rows = scoreDimensionRows(s);
    expect(rows.map((r) => r.key)).toEqual(["prazo", "previsibilidade", "compromissos", "fluxo"]);
    expect(rows.map((r) => r.max)).toEqual([50, 25, 15, 10]);
    expect(rows[3].points).toBe(s.fluxoPontos);
    expect(rows[3].detail).toBe("80% · 16 de 20 entregas sem ajustes · 4 passaram por ajustes");
    const text = explainScore(s);
    expect(text).toContain("90% das conclusões foram entregues no prazo");
    expect(text).toContain("houve 2 replanejamentos no período");
    expect(text).toContain("4 das 20 entregas passaram por ajustes");
    expect(text.endsWith(".")).toBe(true);
  });
  it("sem dados: nenhuma explicação inventada", () => {
    expect(explainScore(computeMemberScoreV2([], [], 19, new Date()))).toBe("");
  });
});
