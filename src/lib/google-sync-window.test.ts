import { describe, expect, it } from "vitest";
import {
  decodeSyncToken,
  encodeSyncToken,
  importCutoffDate,
  pruneCutoffDate,
  saoPauloDateAfter,
} from "./google-sync-window";

const T0 = Date.parse("2026-10-06T12:00:00-03:00");
const WEEK = 7 * 24 * 60 * 60_000;

describe("janela de importação do Google", () => {
  it("token da mesma semana é reaproveitado; da semana seguinte é descartado", () => {
    const stored = encodeSyncToken("abc123", T0);
    expect(decodeSyncToken(stored, T0 + 60_000)).toBe("abc123");
    expect(decodeSyncToken(stored, T0 + WEEK)).toBeNull();
  });
  it("token legado (sem prefixo), vazio ou nulo é descartado", () => {
    expect(decodeSyncToken("CPDq0abc", T0)).toBeNull();
    expect(decodeSyncToken("", T0)).toBeNull();
    expect(decodeSyncToken(null, T0)).toBeNull();
  });
  it("o token pode conter '|' sem quebrar", () => {
    expect(decodeSyncToken(encodeSyncToken("a|b", T0), T0)).toBe("a|b");
  });
  it("datas de corte em Brasília: janela 45 dias, limpeza 52", () => {
    expect(saoPauloDateAfter(0, T0)).toBe("2026-10-06");
    expect(importCutoffDate(T0)).toBe("2026-11-20");
    expect(pruneCutoffDate(T0)).toBe("2026-11-27");
  });
  it("20:30 em Brasília ainda é o mesmo dia (não vira o dia seguinte em UTC)", () => {
    expect(saoPauloDateAfter(0, Date.parse("2026-10-06T23:30:00-03:00"))).toBe("2026-10-06");
  });
});
