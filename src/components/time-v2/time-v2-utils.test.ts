import { describe, expect, it } from "vitest";
import {
  canSeeField,
  entrySeconds,
  formatHours,
  groupJourneyByDay,
  isoRangeToTimestamps,
  memberTaskStats,
  rangeForProfilePeriod,
  totalSecondsByUser,
} from "./time-v2-utils";
import type { DashTask } from "@/lib/task-aggregation";
import type { TimeEntry } from "@/lib/time-entries";

const task = (over: Partial<DashTask>): DashTask =>
  ({
    id: "t",
    projectId: "p",
    projectName: "Proj",
    title: "T",
    bucket: "outro",
    due: "",
    status: "Aberto",
    ...over,
  }) as DashTask;

const entry = (over: Partial<TimeEntry>): TimeEntry => ({
  id: "e",
  taskId: "t",
  taskOrigin: "projeto",
  userId: "u1",
  startedAt: "2026-10-01T12:00:00.000Z",
  endedAt: "2026-10-01T13:00:00.000Z",
  durationSeconds: null,
  source: "cronometro",
  note: null,
  createdAt: "",
  editedBy: null,
  editedAt: null,
  originalStartedAt: null,
  originalEndedAt: null,
  ...over,
});

describe("memberTaskStats", () => {
  it("conta só tarefas abertas; atrasadas/hoje/próximas seguem o bucket da plataforma", () => {
    const s = memberTaskStats([
      task({ bucket: "atrasada" }),
      task({ bucket: "hoje" }),
      task({ bucket: "amanha" }),
      task({ bucket: "semana" }),
      task({ bucket: "outro" }),
      task({ bucket: "atrasada", status: "Concluído" }), // concluída não conta
      task({ bucket: "hoje", status: "Arquivado" }),
    ]);
    expect(s).toMatchObject({ abertas: 5, atrasadas: 1, vencemHoje: 1, proximas: 3 });
  });
  it("em andamento e bloqueadas; atrasada bloqueada é contada à parte", () => {
    const s = memberTaskStats([
      task({ status: "Em andamento" }),
      task({ bucket: "atrasada", status: "Bloqueada", blockCategory: "aguardando_cliente" }),
      task({ blockCategory: "dependencia_tarefa" }),
    ]);
    expect(s).toMatchObject({
      abertas: 3,
      emAndamento: 1,
      bloqueadas: 2,
      atrasadas: 1,
      atrasadasBloqueadas: 1,
    });
  });
  it("pessoa sem tarefas devolve zeros", () => {
    expect(memberTaskStats([])).toEqual({
      abertas: 0,
      atrasadas: 0,
      vencemHoje: 0,
      proximas: 0,
      emAndamento: 0,
      bloqueadas: 0,
      atrasadasBloqueadas: 0,
    });
  });
});

describe("rangeForProfilePeriod", () => {
  const now = new Date("2026-10-02T15:00:00-03:00"); // sexta
  it("hoje", () =>
    expect(rangeForProfilePeriod("hoje", null, now)).toEqual({
      from: "2026-10-02",
      to: "2026-10-02",
    }));
  it("semana = segunda a domingo", () =>
    expect(rangeForProfilePeriod("semana", null, now)).toEqual({
      from: "2026-09-28",
      to: "2026-10-04",
    }));
  it("mês = dia 1 ao último dia", () =>
    expect(rangeForProfilePeriod("mes", null, now)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    }));
  it("personalizado válido é respeitado; inválido cai no mês", () => {
    expect(
      rangeForProfilePeriod("personalizado", { from: "2026-09-01", to: "2026-09-10" }, now),
    ).toEqual({
      from: "2026-09-01",
      to: "2026-09-10",
    });
    expect(
      rangeForProfilePeriod("personalizado", { from: "2026-09-10", to: "2026-09-01" }, now),
    ).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(rangeForProfilePeriod("personalizado", null, now).from).toBe("2026-10-01");
  });
});

describe("isoRangeToTimestamps", () => {
  it("fim é exclusivo: dia seguinte à meia-noite de Brasília", () => {
    expect(isoRangeToTimestamps({ from: "2026-10-01", to: "2026-10-31" })).toEqual({
      from: "2026-10-01T00:00:00-03:00",
      to: "2026-11-01T00:00:00-03:00",
    });
  });
});

describe("horas e jornada", () => {
  const now = new Date("2026-10-01T14:00:00.000Z").getTime();
  it("entrySeconds usa a duração gravada, ou fim-início, ou agora se rodando", () => {
    expect(entrySeconds(entry({ durationSeconds: 120 }), now)).toBe(120);
    expect(entrySeconds(entry({}), now)).toBe(3600);
    expect(entrySeconds(entry({ endedAt: null }), now)).toBe(7200);
  });
  it("totalSecondsByUser soma por pessoa", () => {
    const m = totalSecondsByUser(
      [entry({ userId: "a" }), entry({ userId: "a" }), entry({ userId: "b", durationSeconds: 60 })],
      now,
    );
    expect(m.get("a")).toBe(7200);
    expect(m.get("b")).toBe(60);
  });
  it("formatHours: vírgula pt-BR, travessão sem registro", () => {
    expect(formatHours(0)).toBe("—");
    expect(formatHours(null)).toBe("—");
    expect(formatHours(1440)).toBe("0,4h");
    expect(formatHours(45000)).toBe("12,5h");
  });
  it("groupJourneyByDay agrupa por dia, soma horas e só mostra saída sem timer rodando", () => {
    const days = groupJourneyByDay(
      [
        entry({ startedAt: "2026-10-01T12:00:00.000Z", endedAt: "2026-10-01T13:00:00.000Z" }),
        entry({ startedAt: "2026-10-01T15:00:00.000Z", endedAt: "2026-10-01T16:00:00.000Z" }),
        entry({ startedAt: "2026-09-30T12:00:00.000Z", endedAt: "2026-09-30T12:30:00.000Z" }),
        entry({ startedAt: "2026-10-02T12:00:00.000Z", endedAt: null }),
      ],
      new Date("2026-10-02T13:00:00.000Z").getTime(),
    );
    expect(days.map((d) => d.day)).toEqual(["2026-10-02", "2026-10-01", "2026-09-30"]);
    const d1 = days.find((d) => d.day === "2026-10-01")!;
    expect(d1.seconds).toBe(7200);
    expect(d1.lastEnd).toBe("2026-10-01T16:00:00.000Z");
    expect(days[0].running).toBe(true);
    expect(days[0].lastEnd).toBeNull();
  });
});

describe("canSeeField", () => {
  const m = { id: "u1", timeView: ["name"] as never[] };
  it("admin e o próprio veem tudo; os demais só o liberado", () => {
    expect(canSeeField(m, "salary", { isAdmin: true, meId: "x" })).toBe(true);
    expect(canSeeField(m, "salary", { isAdmin: false, meId: "u1" })).toBe(true);
    expect(canSeeField(m, "salary", { isAdmin: false, meId: "x" })).toBe(false);
    expect(canSeeField(m, "name", { isAdmin: false, meId: "x" })).toBe(true);
  });
});
