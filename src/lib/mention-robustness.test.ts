import { describe, expect, it } from "vitest";
import { matchScore, normalizeForSearch } from "./mention-kinds";

describe("@menção tolerante a rótulo ausente (crash ao mencionar tarefa)", () => {
  it("normalizeForSearch/matchScore não lançam com título undefined/null", () => {
    expect(normalizeForSearch(undefined)).toBe("");
    expect(normalizeForSearch(null)).toBe("");
    expect(() => matchScore(undefined, "abc")).not.toThrow();
    expect(matchScore(undefined, "abc")).toBe(0);
    expect(matchScore(null, "abc")).toBe(0);
  });
  it("comportamento normal preservado (acento/case, prefixo, palavra, substring)", () => {
    expect(matchScore("Revisão do Briefing", "revisao")).toBe(3);
    expect(matchScore("Revisão do Briefing", "brief")).toBe(2);
    expect(matchScore("Revisão do Briefing", "efing")).toBe(1);
    expect(matchScore("Revisão do Briefing", "zzz")).toBe(0);
  });
});
