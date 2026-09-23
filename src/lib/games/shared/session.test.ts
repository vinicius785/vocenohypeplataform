import { describe, expect, it, vi } from "vitest";
import { checkSessionCompatibility, computeElapsedSeconds } from "./session";

describe("checkSessionCompatibility", () => {
  const expected = { challengeId: "2026-09-23", challengeVersion: 2, engineVersion: 1 };

  it("compatível quando tudo bate", () => {
    const row = { challenge_id: "2026-09-23", challenge_version: 2, engine_version: 1 };
    expect(checkSessionCompatibility(row, expected)).toEqual({ compatible: true });
  });

  it("incompatível por challenge_id diferente (sessão de outro dia)", () => {
    const row = { challenge_id: "2026-09-22", challenge_version: 2, engine_version: 1 };
    const result = checkSessionCompatibility(row, expected);
    expect(result.compatible).toBe(false);
    if (!result.compatible) expect(result.reason).toBe("challenge_id_mismatch");
  });

  it("incompatível por challenge_version diferente (mesmo dia, desafio recalculado)", () => {
    const row = { challenge_id: "2026-09-23", challenge_version: 1, engine_version: 1 };
    const result = checkSessionCompatibility(row, expected);
    expect(result.compatible).toBe(false);
    if (!result.compatible) expect(result.reason).toBe("challenge_version_mismatch");
  });

  it("incompatível por engine_version diferente (sessão salva antes das paredes existirem)", () => {
    const row = { challenge_id: "2026-09-23", challenge_version: 2, engine_version: 0 };
    const result = checkSessionCompatibility(row, expected);
    expect(result.compatible).toBe(false);
    if (!result.compatible) expect(result.reason).toBe("engine_version_mismatch");
  });

  it("versão null/ausente é tratada como 0, nunca lança", () => {
    const row = { challenge_id: "2026-09-23", challenge_version: null, engine_version: null };
    const result = checkSessionCompatibility(row, expected);
    expect(result.compatible).toBe(false);
  });
});

describe("computeElapsedSeconds — nunca deriva do horário do dia", () => {
  it("not_started sempre é 0, mesmo com accumulatedSeconds sujo", () => {
    expect(
      computeElapsedSeconds({
        status: "not_started",
        accumulatedSeconds: 0,
        resumedAt: null,
        now: Date.now(),
      }),
    ).toBe(0);
  });

  it("won usa só o acumulado, ignora resumedAt (partida já congelada)", () => {
    expect(
      computeElapsedSeconds({
        status: "won",
        accumulatedSeconds: 87,
        resumedAt: new Date().toISOString(),
        now: Date.now() + 999_000,
      }),
    ).toBe(87);
  });

  it("in_progress soma o acumulado + trecho corrente desde resumedAt", () => {
    const now = Date.now();
    const resumedAt = new Date(now - 30_000).toISOString(); // 30s atrás
    expect(
      computeElapsedSeconds({ status: "in_progress", accumulatedSeconds: 10, resumedAt, now }),
    ).toBe(40);
  });

  it("in_progress sem resumedAt cai pro acumulado (nunca inventa um trecho)", () => {
    expect(
      computeElapsedSeconds({
        status: "in_progress",
        accumulatedSeconds: 15,
        resumedAt: null,
        now: Date.now(),
      }),
    ).toBe(15);
  });

  it("nunca retorna negativo mesmo com timestamp futuro/corrompido (ex.: bug do 21:47)", () => {
    const now = Date.now();
    const resumedAtNoFuturo = new Date(now + 10_000_000).toISOString(); // no futuro
    expect(
      computeElapsedSeconds({
        status: "in_progress",
        accumulatedSeconds: 5,
        resumedAt: resumedAtNoFuturo,
        now,
      }),
    ).toBe(5);
  });

  it("com fake timers, o tempo avança de forma previsível e sem múltiplos intervals", () => {
    vi.useFakeTimers();
    const start = Date.now();
    const resumedAt = new Date(start).toISOString();
    vi.advanceTimersByTime(5000);
    const elapsed = computeElapsedSeconds({
      status: "in_progress",
      accumulatedSeconds: 0,
      resumedAt,
      now: Date.now(),
    });
    expect(elapsed).toBe(5);
    vi.useRealTimers();
  });
});
