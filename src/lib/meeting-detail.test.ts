import { describe, expect, it } from "vitest";
import type { Meeting } from "@/lib/reunioes-store";
import {
  detailPlan,
  inviteSummary,
  meetingLifecycle,
  nextStepsToText,
  parseNextSteps,
} from "./meeting-detail";

const m: Meeting = {
  id: "1",
  titulo: "Curadoria",
  data: "2026-10-05",
  hora: "17:00",
  duracao: 60,
  com: "",
  local: "",
  status: "Pendente",
  criadorId: "a",
  participanteIds: ["b"],
};
const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00`).getTime();

describe("estado da reunião (derivado)", () => {
  it("agendada / em andamento / realizada / cancelada", () => {
    expect(meetingLifecycle(m, at("16:00"))).toBe("agendada");
    expect(meetingLifecycle(m, at("17:00"))).toBe("em_andamento");
    expect(meetingLifecycle(m, at("18:00"))).toBe("em_andamento");
    expect(meetingLifecycle(m, at("18:01"))).toBe("realizada");
    expect(meetingLifecycle({ ...m, status: "Cancelada" }, at("16:00"))).toBe("cancelada");
  });
  it("'Pendente'/'Confirmada' guardados não viram estado da reunião", () => {
    expect(meetingLifecycle({ ...m, status: "Confirmada" }, at("16:00"))).toBe("agendada");
  });
});

describe("plano do detalhe", () => {
  const plan = (
    mm: Meeting,
    hhmm: string,
    o: Partial<{ isCreator: boolean; hasJoinUrl: boolean }> = {},
  ) => detailPlan(mm, { nowMs: at(hhmm), isCreator: true, hasJoinUrl: true, ...o });

  it("futura: entrar visível, sem presença, sem transcrição/resultado", () => {
    const p = plan(m, "16:00");
    expect(p).toMatchObject({
      showJoin: true,
      presenceAvailable: false,
      presenceEditable: false,
      showTranscript: false,
      showResult: false,
      canCancel: true,
    });
    expect(p.order[0]).toBe("participantes");
    expect(p.order.indexOf("reuniao")).toBeLessThan(p.order.indexOf("transcricao"));
  });
  it("em andamento: entrar e presença editável pelo criador", () => {
    const p = plan(m, "17:30");
    expect(p).toMatchObject({
      showJoin: true,
      presenceAvailable: true,
      presenceEditable: true,
      showResult: true,
    });
    expect(plan(m, "17:30", { isCreator: false }).presenceEditable).toBe(false);
  });
  it("realizada: sem entrar, transcrição e resultado sobem antes de link e pauta; sem cancelar", () => {
    const p = plan(m, "19:00");
    expect(p).toMatchObject({
      showJoin: false,
      showTranscript: true,
      showResult: true,
      canCancel: false,
    });
    expect(p.order.indexOf("resultado")).toBeLessThan(p.order.indexOf("reuniao"));
  });
  it("cancelada: sem entrar, sem presença, sem cancelar de novo", () => {
    const p = plan({ ...m, status: "Cancelada" }, "16:00");
    expect(p).toMatchObject({
      showJoin: false,
      presenceAvailable: false,
      canCancel: false,
      showTranscript: false,
    });
  });
  it("google: sem convite e sem 'cancelar reunião'", () => {
    const p = plan({ ...m, origem: "google" }, "16:00");
    expect(p.showInvite).toBe(false);
    expect(p.canCancel).toBe(false);
  });
  it("sem link não há 'entrar'; só criador cancela", () => {
    expect(plan(m, "16:00", { hasJoinUrl: false }).showJoin).toBe(false);
    expect(plan(m, "16:00", { isCreator: false }).canCancel).toBe(false);
  });
  it("pauta só quando há texto; transcrição/resultado existentes aparecem mesmo antes", () => {
    expect(plan(m, "16:00").showAgenda).toBe(false);
    expect(plan({ ...m, notas: " - item" }, "16:00").showAgenda).toBe(true);
    const p = plan({ ...m, transcricao: "x", resumo: "y" }, "16:00");
    expect(p.showTranscript && p.showResult).toBe(true);
  });
});

describe("próximos passos e convite", () => {
  it("texto ↔ lista", () => {
    expect(
      parseNextSteps("- Revisar proposta\n\n• Enviar briefing\n  Agendar nova reunião "),
    ).toEqual(["Revisar proposta", "Enviar briefing", "Agendar nova reunião"]);
    expect(nextStepsToText(["a", "b"])).toBe("a\nb");
    expect(nextStepsToText(undefined)).toBe("");
  });
  it("resumo do convite", () => {
    expect(inviteSummary({ confirmedBy: ["a"], declinedBy: ["c"] }, ["a", "b", "c", "d"])).toBe(
      "1 confirmado · 1 recusou · 2 pendentes",
    );
    expect(inviteSummary({}, [])).toBe("0 confirmados");
  });
});
