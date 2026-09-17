import { describe, expect, it } from "vitest";
import {
  isValidTaskBlockCategory,
  isValidBlockReason,
  decidesPausesDeadlineByCategory,
  resolvePausesDeadline,
  computeEligibleBlockDurationMs,
  computeEffectivePerformanceDueDate,
} from "./task-blocks-rules";

describe("isValidTaskBlockCategory", () => {
  it("aceita só as 8 categorias fechadas", () => {
    expect(isValidTaskBlockCategory("aguardando_cliente")).toBe(true);
    expect(isValidTaskBlockCategory("qualquer_coisa")).toBe(false);
    expect(isValidTaskBlockCategory(undefined)).toBe(false);
  });
});

describe("isValidBlockReason", () => {
  it("rejeita vazio, só espaços e texto curto demais", () => {
    expect(isValidBlockReason("")).toBe(false);
    expect(isValidBlockReason("   ")).toBe(false);
    expect(isValidBlockReason("curto")).toBe(false);
    expect(isValidBlockReason("Aguardando aprovação do roteiro pelo cliente")).toBe(true);
  });
});

describe("decidesPausesDeadlineByCategory", () => {
  it("pausa por padrão pras categorias de causa externa", () => {
    expect(decidesPausesDeadlineByCategory("dependencia_tarefa")).toBe(true);
    expect(decidesPausesDeadlineByCategory("aguardando_time")).toBe(true);
    expect(decidesPausesDeadlineByCategory("aguardando_cliente")).toBe(true);
    expect(decidesPausesDeadlineByCategory("aguardando_fornecedor")).toBe(true);
    expect(decidesPausesDeadlineByCategory("aguardando_aprovacao")).toBe(true);
    expect(decidesPausesDeadlineByCategory("problema_tecnico")).toBe(true);
    expect(decidesPausesDeadlineByCategory("falta_informacao")).toBe(true);
  });

  it("não pausa por padrão pra 'outro' (genérico demais)", () => {
    expect(decidesPausesDeadlineByCategory("outro")).toBe(false);
  });
});

describe("resolvePausesDeadline", () => {
  it("usa a regra da categoria quando não há override", () => {
    expect(resolvePausesDeadline("outro", false)).toBe(false);
    expect(resolvePausesDeadline("aguardando_cliente", false)).toBe(true);
  });

  it("ignora override de quem não tem permissão", () => {
    expect(
      resolvePausesDeadline("outro", false, { approvedByUserId: "u1", reason: "justificativa" }),
    ).toBe(false);
  });

  it("ignora override sem justificativa", () => {
    expect(resolvePausesDeadline("outro", true, { approvedByUserId: "u1", reason: "  " })).toBe(
      false,
    );
  });

  it("override de líder/admin pode LIGAR a pausa pra 'outro'", () => {
    expect(
      resolvePausesDeadline("outro", true, {
        approvedByUserId: "u1",
        reason: "Impedimento real, aprovado pelo líder",
      }),
    ).toBe(true);
  });

  it("override nunca desliga uma pausa devida por categoria", () => {
    expect(
      resolvePausesDeadline("aguardando_cliente", true, {
        approvedByUserId: "u1",
        reason: "tentativa de desligar",
      }),
    ).toBe(true);
  });
});

describe("computeEligibleBlockDurationMs", () => {
  it("soma só intervalos elegíveis (pausesDeadline=true)", () => {
    const ms = computeEligibleBlockDurationMs(
      [
        {
          pausesDeadline: true,
          blockedAt: "2026-09-01T00:00:00.000Z",
          unblockedAt: "2026-09-03T00:00:00.000Z",
        },
        {
          pausesDeadline: false,
          blockedAt: "2026-09-05T00:00:00.000Z",
          unblockedAt: "2026-09-10T00:00:00.000Z",
        },
      ],
      "2026-09-16T00:00:00.000Z",
    );
    expect(ms).toBe(2 * 86_400_000);
  });

  it("não conta um bloqueio ainda ativo além de 'now'", () => {
    const ms = computeEligibleBlockDurationMs(
      [{ pausesDeadline: true, blockedAt: "2026-09-14T00:00:00.000Z" }],
      "2026-09-16T00:00:00.000Z",
    );
    expect(ms).toBe(2 * 86_400_000);
  });

  it("funde intervalos sobrepostos em vez de somar duas vezes", () => {
    const ms = computeEligibleBlockDurationMs(
      [
        {
          pausesDeadline: true,
          blockedAt: "2026-09-01T00:00:00.000Z",
          unblockedAt: "2026-09-05T00:00:00.000Z",
        },
        {
          pausesDeadline: true,
          blockedAt: "2026-09-03T00:00:00.000Z",
          unblockedAt: "2026-09-07T00:00:00.000Z",
        },
      ],
      "2026-09-16T00:00:00.000Z",
    );
    // sobreposto: 01→07 = 6 dias, não 4+4=8
    expect(ms).toBe(6 * 86_400_000);
  });
});

describe("computeEffectivePerformanceDueDate", () => {
  it("sem duração elegível, mantém o prazo base", () => {
    expect(computeEffectivePerformanceDueDate("2026-09-18", 0)).toBe("2026-09-18");
  });

  it("soma dias corridos arredondando pra cima", () => {
    // 2 dias úteis exemplo do pedido vira, em dias corridos, o mesmo número de dias
    expect(computeEffectivePerformanceDueDate("2026-09-18", 2 * 86_400_000)).toBe("2026-09-20");
  });

  it("arredonda frações de dia pra cima (nunca subestima a pausa)", () => {
    expect(computeEffectivePerformanceDueDate("2026-09-18", 1.5 * 86_400_000)).toBe("2026-09-20");
  });

  it("prazo já vencido mantém o atraso acumulado — só soma a partir do prazo base", () => {
    // prazo original 2026-09-14 (2 dias atrás de um "hoje" hipotético 2026-09-16),
    // bloqueado por 1 dia corrido -> efetivo 2026-09-15, atraso de 2 dias permanece
    // implícito (a comparação de atraso é feita em outro lugar, contra "hoje").
    expect(computeEffectivePerformanceDueDate("2026-09-14", 1 * 86_400_000)).toBe("2026-09-15");
  });
});
