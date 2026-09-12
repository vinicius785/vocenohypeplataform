import { describe, expect, it } from "vitest";
import {
  computeReportWindow,
  isConfiguredWeekdayNow,
  isWithin,
  zonedWallTimeToUtcMs,
} from "./hypito-window";

describe("zonedWallTimeToUtcMs", () => {
  it("converte 17:00 em America/Sao_Paulo pro instante UTC correto (UTC-3, sem DST)", () => {
    // Sexta 2026-09-11 17:00 America/Sao_Paulo == 2026-09-11 20:00 UTC.
    const ms = zonedWallTimeToUtcMs("2026-09-11", 17, 0, "America/Sao_Paulo");
    const utc = new Date(ms);
    expect(utc.toISOString()).toBe("2026-09-11T20:00:00.000Z");
  });

  it("converte meia-noite de segunda-feira corretamente", () => {
    const ms = zonedWallTimeToUtcMs("2026-09-07", 0, 0, "America/Sao_Paulo");
    expect(new Date(ms).toISOString()).toBe("2026-09-07T03:00:00.000Z");
  });

  it("nunca fixa um offset manual — deriva de outro fuso corretamente também", () => {
    // UTC mesmo: 17:00 em UTC deve virar 17:00:00.000Z, sem nenhum deslocamento.
    const ms = zonedWallTimeToUtcMs("2026-09-11", 17, 0, "UTC");
    expect(new Date(ms).toISOString()).toBe("2026-09-11T17:00:00.000Z");
  });
});

describe("computeReportWindow", () => {
  it("início é a segunda-feira 00:00 America/Sao_Paulo da semana da execução", () => {
    // 2026-09-11 é uma sexta-feira; a segunda daquela semana é 2026-09-07.
    const now = new Date("2026-09-11T20:00:00.000Z"); // sexta 17h BRT
    const window = computeReportWindow(now);
    expect(window.weekStartIso).toBe("2026-09-07");
    expect(window.periodStart.toISOString()).toBe("2026-09-07T03:00:00.000Z");
  });

  it("fim é o momento da geração (não um horário fixo)", () => {
    const now = new Date("2026-09-11T19:03:00.000Z");
    const window = computeReportWindow(now);
    expect(window.periodEnd.getTime()).toBe(now.getTime());
  });

  it("próximos 7 dias partem do momento da geração", () => {
    const now = new Date("2026-09-11T20:00:00.000Z");
    const window = computeReportWindow(now);
    expect(window.next7DaysEnd.getTime() - window.next7DaysStart.getTime()).toBe(7 * 86_400_000);
  });
});

describe("isWithin", () => {
  const start = new Date("2026-09-07T03:00:00.000Z");
  const end = new Date("2026-09-11T20:00:00.000Z");

  it("true para data dentro do intervalo", () => {
    expect(isWithin(new Date("2026-09-09T12:00:00.000Z"), start, end)).toBe(true);
  });

  it("false para data antes do intervalo (nunca mistura semana anterior)", () => {
    expect(isWithin(new Date("2026-09-06T12:00:00.000Z"), start, end)).toBe(false);
  });

  it("false para data depois do intervalo (fim exclusivo)", () => {
    expect(isWithin(end, start, end)).toBe(false);
  });

  it("false para data ausente/inválida — nunca lança, nunca inventa", () => {
    expect(isWithin(null, start, end)).toBe(false);
    expect(isWithin(undefined, start, end)).toBe(false);
    expect(isWithin(new Date("not-a-date"), start, end)).toBe(false);
  });
});

describe("isConfiguredWeekdayNow", () => {
  it("reconhece sexta-feira (5) em America/Sao_Paulo", () => {
    const friday17hBrt = new Date("2026-09-11T20:00:00.000Z");
    expect(isConfiguredWeekdayNow(5, friday17hBrt)).toBe(true);
  });

  it("rejeita quando o dia configurado não bate com hoje", () => {
    const friday17hBrt = new Date("2026-09-11T20:00:00.000Z");
    expect(isConfiguredWeekdayNow(1, friday17hBrt)).toBe(false);
  });

  it("não permite execução antecipada nem atrasada fora do dia certo", () => {
    // Quinta 23:59 BRT ainda não é sexta em São Paulo.
    const thursdayLateBrt = new Date("2026-09-11T02:59:00.000Z");
    expect(isConfiguredWeekdayNow(5, thursdayLateBrt)).toBe(false);
    // Sábado 00:01 BRT já não é mais sexta.
    const saturdayEarlyBrt = new Date("2026-09-12T03:01:00.000Z");
    expect(isConfiguredWeekdayNow(5, saturdayEarlyBrt)).toBe(false);
  });
});
