import { describe, expect, it } from "vitest";
import { formatActivityWhen } from "./activity-time";

describe("formatActivityWhen", () => {
  const now = new Date(2026, 9, 5, 18, 0);
  it("hoje, ontem e data", () => {
    expect(formatActivityWhen(new Date(2026, 9, 5, 16, 4).toISOString(), now)).toBe("Hoje · 16:04");
    expect(formatActivityWhen(new Date(2026, 9, 4, 18, 20).toISOString(), now)).toBe(
      "Ontem · 18:20",
    );
    expect(formatActivityWhen(new Date(2026, 8, 1, 9, 0).toISOString(), now)).toBe("01/09 · 09:00");
    expect(formatActivityWhen("lixo", now)).toBe("");
  });
});
