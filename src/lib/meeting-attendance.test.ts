import { describe, expect, it } from "vitest";
import type { Meeting } from "@/lib/reunioes-store";
import {
  attendanceState,
  attendanceSummary,
  canRecordAttendance,
  eligibleAttendeeIds,
  markAllPresent,
  rsvpKind,
  togglePersonAttendance,
  setPersonAttendance,
  wordCount,
} from "./meeting-attendance";

const base: Meeting = {
  id: "m1",
  seriesId: "s1",
  titulo: "Daily",
  data: "2026-10-06",
  hora: "10:30",
  duracao: 30,
  com: "",
  local: "",
  status: "Pendente",
  criadorId: "vini",
  participanteIds: ["toni"],
};
const KNOWN = new Set(["vini", "toni"]);

describe("participantes elegíveis", () => {
  it("organizador + convidados desta ocorrência, sem repetir", () => {
    expect(
      eligibleAttendeeIds({ ...base, participanteIds: ["vini", "toni"] }, KNOWN, "vini"),
    ).toEqual(["vini", "toni"]);
  });
  it("tira quem não é mais membro do workspace; o usuário atual sempre vale", () => {
    expect(
      eligibleAttendeeIds({ ...base, participanteIds: ["toni", "ex-membro"] }, KNOWN, "vini"),
    ).toEqual(["vini", "toni"]);
    expect(eligibleAttendeeIds({ ...base, participanteIds: ["eu"] }, new Set(), "eu")).toEqual([
      "eu",
    ]);
  });
});

describe("resumo e estados", () => {
  const ids = ["vini", "toni"];
  it("não registrada: sem 'x de N' e todos 'não informado'", () => {
    expect(attendanceSummary(base, ids)).toEqual({
      recorded: false,
      present: 0,
      total: 2,
      label: null,
      countLabel: "0 de 2 presentes",
    });
    expect(attendanceState(base, "vini")).toBe("unknown");
  });
  it("registrada: conta presentes entre os elegíveis", () => {
    const m = { ...base, attendanceRecorded: true, attendedBy: ["vini"] };
    expect(attendanceSummary(m, ids).label).toBe("1 de 2 presentes");
    expect(attendanceState(m, "vini")).toBe("present");
    expect(attendanceState(m, "toni")).toBe("absent");
  });
  it("quem está em attendedBy mas não é mais elegível não infla o resumo", () => {
    const m = { ...base, attendanceRecorded: true, attendedBy: ["vini", "toni", "ex"] };
    expect(attendanceSummary(m, ids).label).toBe("2 de 2 presentes");
  });
});

describe("marcar todos presentes", () => {
  it("2 de 2 presentes, só nesta ocorrência", () => {
    const { meeting, changedIds } = markAllPresent(base, ["vini", "toni"]);
    expect(attendanceSummary(meeting, ["vini", "toni"]).label).toBe("2 de 2 presentes");
    expect(changedIds).toEqual(["vini", "toni"]);
    // outra ocorrência da mesma série não é afetada (é outra linha)
    const outra = { ...base, id: "m2", data: "2026-10-07" };
    expect(attendanceState(outra, "vini")).toBe("unknown");
  });
  it("com presença já registrada, só reporta quem mudou", () => {
    const m = { ...base, attendanceRecorded: true, attendedBy: ["vini"] };
    expect(markAllPresent(m, ["vini", "toni"]).changedIds).toEqual(["toni"]);
  });
});

describe("ajuste individual", () => {
  const ids = ["vini", "toni"];
  it("depois de marcar todos, corrigir um deixa 1 de 2", () => {
    const all = markAllPresent(base, ids).meeting;
    const { meeting, changedIds } = setPersonAttendance(all, "toni", false, ids);
    expect(attendanceSummary(meeting, ids).label).toBe("1 de 2 presentes");
    expect(attendanceState(meeting, "toni")).toBe("absent");
    expect(changedIds).toEqual(["toni"]);
  });
  it("primeira marcação registra a presença; quem não foi marcado fica ausente", () => {
    const { meeting, changedIds } = setPersonAttendance(base, "vini", true, ids);
    expect(meeting.attendanceRecorded).toBe(true);
    expect(attendanceState(meeting, "toni")).toBe("absent");
    expect(changedIds).toEqual(ids);
  });
  it("repetir o mesmo valor não gera mudança", () => {
    const m = { ...base, attendanceRecorded: true, attendedBy: ["vini"] };
    expect(setPersonAttendance(m, "vini", true, ids).changedIds).toEqual([]);
  });
});

describe("quando dá para registrar", () => {
  const start = Date.parse("2026-10-06T10:30:00-03:00");
  it("só depois do início e nunca em reunião cancelada", () => {
    expect(canRecordAttendance(base, start, start - 1)).toBe(false);
    expect(canRecordAttendance(base, start, start)).toBe(true);
    expect(canRecordAttendance({ status: "Cancelada" }, start, start + 1000)).toBe(false);
  });
});

describe("wordCount", () => {
  it("conta palavras ignorando espaços extras", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("  oi  tudo   bem\n ok ")).toBe(4);
  });
});

describe("cenário: 4 participantes, RSVP ≠ presença", () => {
  const ids = ["a", "b", "c", "d"];
  const m0: Meeting = {
    ...base,
    criadorId: "a",
    participanteIds: ["b", "c", "d"],
    confirmedBy: ["a"],
  };
  it("1 confirmado + 3 pendentes → 0 de 4 presentes", () => {
    expect(ids.map((i) => rsvpKind(m0, i))).toEqual(["confirmed", "pending", "pending", "pending"]);
    expect(attendanceSummary(m0, ids).countLabel).toBe("0 de 4 presentes");
  });
  it("marcar 2 → 2 de 4; marcar todos → 4 de 4", () => {
    let m = togglePersonAttendance(m0, "b", ids).meeting;
    m = togglePersonAttendance(m, "c", ids).meeting;
    expect(attendanceSummary(m, ids).countLabel).toBe("2 de 4 presentes");
    m = markAllPresent(m, ids).meeting;
    expect(attendanceSummary(m, ids).countLabel).toBe("4 de 4 presentes");
  });
  it("clicar de novo desmarca", () => {
    let m = togglePersonAttendance(m0, "b", ids).meeting;
    m = togglePersonAttendance(m, "b", ids).meeting;
    expect(attendanceSummary(m, ids).present).toBe(0);
  });
  it("mudar o RSVP não altera a presença (e vice-versa)", () => {
    const m = markAllPresent(m0, ids).meeting;
    const pendente = { ...m, confirmedBy: [], declinedBy: [] };
    expect(rsvpKind(pendente, "a")).toBe("pending");
    expect(attendanceSummary(pendente, ids).countLabel).toBe("4 de 4 presentes");
    expect(attendanceState(pendente, "a")).toBe("present");
    const recusou = { ...m, declinedBy: ["b"] };
    expect(attendanceState(recusou, "b")).toBe("present");
    // e marcar presença não mexe no RSVP
    const t = togglePersonAttendance(m0, "b", ids).meeting;
    expect(t.confirmedBy).toEqual(["a"]);
    expect(t.declinedBy).toEqual(m0.declinedBy);
  });
});
