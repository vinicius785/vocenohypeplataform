import { describe, expect, it } from "vitest";
import { DEFAULT_STAGES, formatBRL, loadStages, saveStages } from "./comercial";

describe("formatBRL", () => {
  it("formats a number as BRL currency with no decimals", () => {
    expect(formatBRL(1000)).toContain("1.000");
    expect(formatBRL(0)).toContain("0");
  });
});

describe("loadStages / saveStages", () => {
  it("falls back to DEFAULT_STAGES when nothing is stored (no window/localStorage)", () => {
    expect(loadStages()).toEqual(DEFAULT_STAGES);
  });

  it("saveStages is a no-op without throwing when localStorage is unavailable", () => {
    expect(() => saveStages(DEFAULT_STAGES)).not.toThrow();
  });
});
