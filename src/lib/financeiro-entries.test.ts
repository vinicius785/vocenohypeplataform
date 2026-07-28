import { describe, expect, it } from "vitest";
import { fmtMonth, fromMonthKey, monthKey, parseMoney } from "./financeiro-entries";

describe("parseMoney", () => {
  it("parses plain integers and decimals", () => {
    expect(parseMoney("100")).toBe(100);
    expect(parseMoney("99.9")).toBe(99.9);
  });

  it("parses Brazilian-formatted currency strings", () => {
    expect(parseMoney("R$ 1.234,56")).toBeCloseTo(1234.56);
    expect(parseMoney("1.000")).toBe(1000);
  });

  it("returns 0 for empty, undefined, or non-numeric input", () => {
    expect(parseMoney(undefined)).toBe(0);
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("abc")).toBe(0);
  });
});

describe("monthKey / fromMonthKey / fmtMonth", () => {
  it("formats a date as YYYY-MM", () => {
    expect(monthKey(new Date(2026, 6, 23))).toBe("2026-07");
    expect(monthKey(new Date(2026, 0, 1))).toBe("2026-01");
  });

  it("round-trips monthKey -> fromMonthKey to the first day of that month", () => {
    const d = fromMonthKey("2026-07");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(1);
  });

  it("formats a month key as a localized month/year label", () => {
    const label = fmtMonth("2026-07");
    expect(label.toLowerCase()).toContain("2026");
  });
});
