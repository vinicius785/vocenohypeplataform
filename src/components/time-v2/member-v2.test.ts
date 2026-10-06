import { describe, expect, it } from "vitest";
import type { MemberResponseTime } from "@/lib/member-response-time";
import type { DashTask } from "@/lib/task-aggregation";
import {
  blockedRows,
  communicationReading,
  memberHistoryEvents,
  MIN_SCORE_TASKS,
  overviewHighlights,
  scoreView,
} from "./member-v2";

const seg = (avg: number | null) => ({
  answered: avg == null ? 0 : 5,
  unanswered: 0,
  averageSeconds: avg,
  medianSeconds: avg,
});
const rt = (
  all: number | null,
  direct: number | null,
  mention: number | null,
): MemberResponseTime => ({
  all: { answered: 5, unanswered: 0, averageSeconds: all, medianSeconds: all },
  direct: seg(direct),
  mention: seg(mention),
});

describe("scoreView — só com amostra confiável", () => {
  it("sem dados", () => {
    expect(scoreView({ score: null, amostra: 0, dataState: "sem_dados" }).mode).toBe("sem_dados");
  });
  it(`abaixo de ${MIN_SCORE_TASKS} tarefas: insuficiente (nunca 100/100 com confiança baixa)`, () => {
    const v = scoreView({ score: 100, amostra: 12, dataState: "definitivo" });
    expect(v).toEqual({ mode: "insuficiente", amostra: 12, previa: 100 });
  });
  it("a partir do mínimo: mostra o score", () => {
    expect(scoreView({ score: 87, amostra: MIN_SCORE_TASKS, dataState: "definitivo" })).toEqual({
      mode: "ok",
      amostra: MIN_SCORE_TASKS,
      score: 87,
    });
  });
});

describe("overviewHighlights", () => {
  const ins = [
    { kind: "operacao", text: "op" },
    { kind: "tendencia", text: "tend" },
    { kind: "atencao", text: "a1" },
    { kind: "dependencia", text: "dep" },
    { kind: "atencao", text: "a2" },
  ] as const;
  it("atenção primeiro, no máximo 3, estável", () => {
    expect(overviewHighlights([...ins]).map((i) => i.text)).toEqual(["a1", "a2", "dep"]);
  });
  it("sem itens → vazio (a tela mostra 'Tudo sob controle')", () => {
    expect(overviewHighlights([])).toEqual([]);
  });
});

describe("communicationReading", () => {
  it("sem amostra: sem_dados, nunca inventa", () => {
    expect(communicationReading(rt(null, null, null), 600).state).toBe("sem_dados");
    expect(communicationReading(null, null).state).toBe("sem_dados");
  });
  it("demora mais em: só quando as duas médias existem e diferem", () => {
    const r = communicationReading(rt(900, 8040, 300), null);
    expect(r.state === "ok" && r.slowest).toEqual({ label: "Mensagens diretas", seconds: 8040 });
    const igual = communicationReading(rt(900, 600, 640), null);
    expect(igual.state === "ok" && igual.slowest).toBeNull();
    const so1 = communicationReading(rt(900, 600, null), null);
    expect(so1.state === "ok" && so1.slowest).toBeNull();
  });
  it("comparação com o time só existe com referência real", () => {
    const sem = communicationReading(rt(420, null, null), null);
    expect(sem.state === "ok" && sem.vsTeam).toBeNull();
    const abaixo = communicationReading(rt(420, null, null), 3600);
    expect(abaixo.state === "ok" && abaixo.vsTeam).toBe("abaixo");
    const acima = communicationReading(rt(7200, null, null), 3600);
    expect(acima.state === "ok" && acima.vsTeam).toBe("acima");
    const similar = communicationReading(rt(3700, null, null), 3600);
    expect(similar.state === "ok" && similar.vsTeam).toBe("similar");
  });
  it("recomendação: velocidade de resposta, nunca juízo sobre a pessoa", () => {
    const r = communicationReading(rt(7200, 8040, 300), 3600);
    expect(r.state === "ok" && r.recommendation).toMatch(/acima da média do time/);
    expect(r.state === "ok" && r.recommendation).toMatch(/mensagens diretas/);
    const ok = communicationReading(rt(420, 400, 430), 3600);
    expect(ok.state === "ok" && ok.recommendation).toBeNull();
    for (const x of [r, ok]) expect(JSON.stringify(x)).not.toMatch(/mal|ruim|péssim/i);
  });
});

describe("blockedRows — dependência formal só quando existe", () => {
  const t = (id: string) => ({ id, title: id, status: "Bloqueada" }) as DashTask;
  const entry = (id: string) =>
    ({
      b1: { label: "Briefing", status: "Em andamento", assignees: ["Toni"], dueDate: "2026-10-09" },
      b2: { label: "Feito", status: "Concluído", assignees: [] },
    })[id];
  it("lista quem bloqueia (aberto) e ignora concluído; sem dependência formal, só a tarefa", () => {
    const rows = blockedRows(
      [t("mkt:x"), t("y")],
      [
        { blockedTaskId: "x", blockingTaskId: "b1" },
        { blockedTaskId: "x", blockingTaskId: "b2" },
      ],
      entry,
    );
    expect(rows[0].blockers).toEqual([
      { id: "b1", title: "Briefing", assignees: ["Toni"], dueDate: "2026-10-09" },
    ]);
    expect(rows[1].blockers).toEqual([]);
  });
});

describe("memberHistoryEvents", () => {
  it("só eventos reais, mais recente primeiro, contexto apenas quando conhecido", () => {
    const ev = memberHistoryEvents({
      memberName: "Toni",
      completions: [
        {
          outcome: "late",
          delayMinutes: 5,
          taskId: "t1",
          taskTitle: "Distribuir",
          occurredAt: "2026-10-06T10:00:00Z",
        },
      ],
      deadlineChanges: [
        { taskId: "t2", taskTitle: "Roteiro", occurredAt: "2026-10-06T12:00:00Z" } as never,
      ],
      attendance: [{ attended: true, meetingId: "m1", occurredAt: "2026-10-05T10:00:00Z" }],
      meetingTitle: (id) => (id === "m1" ? "Curadoria" : undefined),
      projectOfTask: (id) => (id === "t1" ? "Você no Hype" : undefined),
    });
    expect(ev.map((e) => e.texto)).toEqual([
      "replanejou o prazo de “Roteiro”",
      "concluiu “Distribuir” com atraso",
      "participou da reunião “Curadoria”",
    ]);
    expect(ev[0].entrega).toBeUndefined();
    expect(ev[1].entrega).toBe("Você no Hype");
    expect(ev.every((e) => e.autor === "Toni")).toBe(true);
  });
  it("sem eventos → lista vazia", () => {
    expect(
      memberHistoryEvents({
        memberName: "A",
        completions: [],
        deadlineChanges: [],
        attendance: [],
        meetingTitle: () => undefined,
        projectOfTask: () => undefined,
      }),
    ).toEqual([]);
  });
});
