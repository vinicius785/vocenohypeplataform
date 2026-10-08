import { describe, expect, it } from "vitest";
import {
  addableMembers,
  derivedDurationLabel,
  formatClock,
  formatDuration,
  groupSessions,
  participantStart,
  planManualSession,
  sessionElapsedSeconds,
  taskTotals,
  type SessionEntryLike,
} from "./time-sessions";

const e = (
  id: string,
  userId: string | null,
  s: string,
  en: string | null,
  sessionId: string | null = null,
): SessionEntryLike => ({
  id,
  userId,
  startedAt: s,
  endedAt: en,
  durationSeconds: en ? (Date.parse(en) - Date.parse(s)) / 1000 : null,
  sessionId,
});

const A = "2026-10-07T12:00:00.000Z";
const B = "2026-10-07T13:00:00.000Z";
const C = "2026-10-07T14:00:00.000Z";

describe("groupSessions / totais", () => {
  it("registro legado sem sessionId é uma sessão solo", () => {
    const s = groupSessions([e("1", "u1", A, B)]);
    expect(s).toHaveLength(1);
    expect(s[0].sessionId).toBeNull();
    expect(taskTotals([e("1", "u1", A, B)]).effortSeconds).toBe(3600);
  });

  it("sessão compartilhada: um registro, esforço soma as pessoas, tempo da sessão não", () => {
    const rows = [e("1", "u1", A, C, "s"), e("2", "u2", B, C, "s")];
    const s = groupSessions(rows);
    expect(s).toHaveLength(1);
    expect(s[0].entries).toHaveLength(2);
    expect(sessionElapsedSeconds(s[0])).toBe(7200);
    const t = taskTotals(rows);
    expect(t.effortSeconds).toBe(7200 + 3600);
    expect(t.sessionSeconds).toBe(7200);
    expect(t.hasShared).toBe(true);
  });

  it("saída antecipada: cada pessoa mantém seu intervalo", () => {
    const rows = [e("1", "u1", A, C, "s"), e("2", "u2", A, B, "s")];
    expect(taskTotals(rows).effortSeconds).toBe(7200 + 3600);
  });

  it("sessão com linha aberta fica em andamento", () => {
    const s = groupSessions([e("1", "u1", A, null, "s"), e("2", "u2", B, C, "s")]);
    expect(s[0].running).toBe(true);
  });
});

describe("planManualSession", () => {
  it("deriva a duração de início e fim", () => {
    const p = planManualSession({
      date: "2026-10-07",
      start: "09:00",
      end: "10:30",
      participants: [{ userId: "u1" }],
    });
    expect(p.ok && p.durationSeconds).toBe(5400);
  });
  it("rejeita início > fim, sem fim e sem participantes", () => {
    const base = { date: "2026-10-07", participants: [{ userId: "u1" }] };
    expect(planManualSession({ ...base, start: "10:00", end: "09:00" }).ok).toBe(false);
    expect(planManualSession({ ...base, start: "10:00", end: "" }).ok).toBe(false);
    expect(
      planManualSession({ date: "2026-10-07", start: "09:00", end: "10:00", participants: [] }).ok,
    ).toBe(false);
  });
  it("rejeita participante duplicado", () => {
    const p = planManualSession({
      date: "2026-10-07",
      start: "09:00",
      end: "10:00",
      participants: [{ userId: "u1" }, { userId: "u1" }],
    });
    expect(p.ok).toBe(false);
  });
  it("intervalo próprio por participante", () => {
    const p = planManualSession({
      date: "2026-10-07",
      start: "09:00",
      end: "11:00",
      participants: [{ userId: "u1" }, { userId: "u2", start: "10:00" }],
    });
    expect(p.ok && p.rows.map((r) => r.seconds)).toEqual([7200, 3600]);
  });
});

describe("rótulos e participantes", () => {
  it("derivedDurationLabel", () => {
    expect(derivedDurationLabel("2026-10-07", "09:00", "")).toBe("Em aberto");
    expect(derivedDurationLabel("2026-10-07", "10:00", "09:00")).toBe("—");
  });
  it("formatadores", () => {
    expect(formatClock(3725)).toMatch(/1:02:05|01:02:05/);
    expect(formatDuration(0)).toBeTruthy();
  });
  it("'desde o início' exige confirmação", () => {
    expect(() => participantStart("desde_o_inicio", A, B, false)).toThrow();
    expect(participantStart("desde_o_inicio", A, B, true)).toBe(A);
    expect(participantStart("agora", A, B, false)).toBe(B);
  });
  it("addableMembers exclui quem já participa e quem não tem id", () => {
    const m = [{ id: "a" }, { id: "b" }, {}];
    expect(addableMembers(m, ["a"])).toEqual([{ id: "b" }]);
  });
});

import {
  joinNatural,
  joinPlus,
  personTotals,
  searchMembers,
  sessionsOfDay,
  timeActivityText,
} from "./time-sessions";

describe("recortes e textos da UI", () => {
  it("registros do dia (fuso de São Paulo)", () => {
    const rows = [
      e("1", "u1", "2026-10-08T15:00:00.000Z", "2026-10-08T15:30:00.000Z"),
      e("2", "u1", "2026-10-07T15:00:00.000Z", "2026-10-07T15:30:00.000Z"),
    ];
    const s = groupSessions(rows);
    expect(sessionsOfDay(s, "2026-10-08").map((x) => x.key)).toEqual(["1"]);
    // 02:30 UTC do dia 9 ainda é noite do dia 8 no Brasil
    const late = groupSessions([
      e("3", "u1", "2026-10-09T02:30:00.000Z", "2026-10-09T02:50:00.000Z"),
    ]);
    expect(sessionsOfDay(late, "2026-10-08")).toHaveLength(1);
  });
  it("total por pessoa: individual, ordenado, sem dividir", () => {
    expect(
      personTotals(
        new Map([
          ["a", 100],
          ["b", 300],
        ]),
      ),
    ).toEqual([
      { userId: "b", seconds: 300 },
      { userId: "a", seconds: 100 },
    ]);
  });
  it("textos", () => {
    expect(joinPlus(["Vinícius", "João"])).toBe("Vinícius + João");
    expect(joinNatural(["João"])).toBe("João");
    expect(joinNatural(["João", "Ana"])).toBe("João e Ana");
    expect(joinNatural(["João", "Ana", "Pedro"])).toBe("João, Ana e Pedro");
    expect(timeActivityText(1920, [])).toBe("registrou 32min");
    expect(timeActivityText(1920, ["João"])).toBe("registrou 32min com João");
  });
  it("busca de participante ignora acento e caixa", () => {
    const ms = [{ name: "João Silva" }, { name: "Ana" }];
    expect(searchMembers(ms, "joao")).toEqual([{ name: "João Silva" }]);
    expect(searchMembers(ms, "  ")).toHaveLength(2);
  });
});
