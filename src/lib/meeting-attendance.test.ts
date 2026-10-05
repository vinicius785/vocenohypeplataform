import { describe, expect, it } from "vitest";
import type { Meeting } from "@/lib/reunioes-store";
import {
  attendanceState,
  attendanceSummary,
  canRecordAttendance,
  eligibleAttendeeIds,
  markAllPresent,
  nextAttendanceOnClick,
  rsvpKind,
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
  criadorId: "a",
  participanteIds: ["b", "c", "d"],
  confirmedBy: ["a"],
};
const IDS = ["a", "b", "c", "d"];

describe("participantes elegíveis", () => {
  it("organizador + convidados desta ocorrência, sem repetir; tira quem saiu do workspace", () => {
    const known = new Set(["a", "b"]);
    expect(eligibleAttendeeIds({ ...base, participanteIds: ["a", "b", "ex"] }, known, "a")).toEqual(
      ["a", "b"],
    );
  });
  it("o usuário atual sempre vale", () => {
    expect(
      eligibleAttendeeIds({ criadorId: undefined, participanteIds: ["eu"] }, new Set(), "eu"),
    ).toEqual(["eu"]);
  });
});

describe("presença em 3 estados", () => {
  it("nada registrado: todos 'não registrada', 0 de 4", () => {
    expect(IDS.map((i) => attendanceState(base, i))).toEqual([
      "unknown",
      "unknown",
      "unknown",
      "unknown",
    ]);
    const s = attendanceSummary(base, IDS);
    expect(s.countLabel).toBe("0 de 4 presentes");
    expect(s.recorded).toBe(false);
    expect(s.label).toBeNull();
  });
  it("marcar uma pessoa não decide as outras", () => {
    const m = setPersonAttendance(base, "b", "present", IDS).meeting;
    expect(IDS.map((i) => attendanceState(m, i))).toEqual([
      "unknown",
      "present",
      "unknown",
      "unknown",
    ]);
    const s = attendanceSummary(m, IDS);
    expect(s.countLabel).toBe("1 de 4 presentes");
    expect(s.decided).toBe(1);
  });
  it("não participou é explícito e separado de não registrada", () => {
    let m = setPersonAttendance(base, "b", "present", IDS).meeting;
    m = setPersonAttendance(m, "c", "absent", IDS).meeting;
    expect(attendanceState(m, "c")).toBe("absent");
    expect(attendanceState(m, "d")).toBe("unknown");
  });
  it("mudar entre presente e não participou gera 1 evento; repetir o mesmo não gera nada", () => {
    const p = setPersonAttendance(base, "b", "present", IDS);
    expect(p.changedIds).toEqual(["b"]);
    expect(setPersonAttendance(p.meeting, "b", "present", IDS).changedIds).toEqual([]);
    const a = setPersonAttendance(p.meeting, "b", "absent", IDS);
    expect(a.changedIds).toEqual(["b"]);
    expect(attendanceState(a.meeting, "b")).toBe("absent");
  });
  it("depois de registrada, a pessoa nunca volta a 'não registrada'", () => {
    let m = setPersonAttendance(base, "b", "present", IDS).meeting;
    m = setPersonAttendance(m, "b", "absent", IDS).meeting;
    m = setPersonAttendance(m, "b", "present", IDS).meeting;
    expect(attendanceState(m, "b")).not.toBe("unknown");
  });
  it("clique rápido: não registrada → presente → não participou → presente", () => {
    expect(nextAttendanceOnClick("unknown")).toBe("present");
    expect(nextAttendanceOnClick("present")).toBe("absent");
    expect(nextAttendanceOnClick("absent")).toBe("present");
  });
});

describe("todos presentes", () => {
  it("vira 4 de 4 e só gera evento de quem ainda não estava presente", () => {
    const m2 = setPersonAttendance(base, "b", "present", IDS).meeting;
    const r = markAllPresent(m2, IDS);
    expect(attendanceSummary(r.meeting, IDS).countLabel).toBe("4 de 4 presentes");
    expect(r.changedIds.sort()).toEqual(["a", "c", "d"]);
    expect(r.meeting.notAttendedBy).toEqual([]);
  });
  it("quem estava 'não participou' passa a presente (com evento)", () => {
    const m = setPersonAttendance(base, "c", "absent", IDS).meeting;
    const r = markAllPresent(m, IDS);
    expect(r.changedIds).toContain("c");
    expect(attendanceState(r.meeting, "c")).toBe("present");
  });
});

describe("reunião ANTIGA (sem notAttendedBy) continua valendo", () => {
  const legacy: Meeting = { ...base, attendanceRecorded: true, attendedBy: ["a", "b"] };
  it("registrada: fora de attendedBy = não participou", () => {
    expect(attendanceState(legacy, "a")).toBe("present");
    expect(attendanceState(legacy, "c")).toBe("absent");
    expect(attendanceSummary(legacy, IDS).countLabel).toBe("2 de 4 presentes");
  });
  it("ao editar uma pessoa no formato novo, os ausentes antigos continuam ausentes", () => {
    const r = setPersonAttendance(legacy, "c", "present", IDS).meeting;
    expect(attendanceState(r, "c")).toBe("present");
    expect(attendanceState(r, "d")).toBe("absent");
    expect(attendanceState(r, "a")).toBe("present");
  });
});

describe("RSVP e presença são independentes", () => {
  it("mudar o convite não toca na presença", () => {
    const m = markAllPresent(base, IDS).meeting;
    const pend = { ...m, confirmedBy: [], declinedBy: [] };
    expect(rsvpKind(pend, "a")).toBe("pending");
    expect(attendanceSummary(pend, IDS).countLabel).toBe("4 de 4 presentes");
    expect(rsvpKind({ ...m, declinedBy: ["b"] }, "b")).toBe("declined");
    const recusou: Meeting = { ...m, declinedBy: ["b"] };
    expect(attendanceState(recusou, "b")).toBe("present");
  });
});

describe("quando dá para registrar", () => {
  it("só depois do início e nunca cancelada", () => {
    expect(canRecordAttendance(base, 100, 99)).toBe(false);
    expect(canRecordAttendance(base, 100, 100)).toBe(true);
    expect(canRecordAttendance({ ...base, status: "Cancelada" }, 100, 200)).toBe(false);
  });
  it("palavras", () => {
    expect(wordCount("  a  b c ")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
});
