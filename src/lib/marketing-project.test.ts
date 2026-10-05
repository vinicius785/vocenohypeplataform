import { describe, expect, it } from "vitest";
import { findMarketingProjectId, isMarketingProject } from "./marketing-project";

describe("isMarketingProject", () => {
  it("o marcador estável manda, independente do nome", () => {
    expect(isMarketingProject({ name: "Qualquer nome", systemKey: "marketing" })).toBe(true);
    expect(isMarketingProject({ name: "MARKETING", systemKey: "outro" })).toBe(false);
  });
  it("sem marcador, cai no nome (reserva temporária)", () => {
    expect(isMarketingProject({ name: " Marketing " })).toBe(true);
    expect(isMarketingProject({ name: "HypeApp" })).toBe(false);
    expect(isMarketingProject({ name: "Marketing digital" })).toBe(false);
  });
  it("nada → falso", () => {
    expect(isMarketingProject(undefined)).toBe(false);
    expect(isMarketingProject({})).toBe(false);
  });
  it("acha o id na lista", () => {
    expect(
      findMarketingProjectId([
        { id: "a", name: "HypeApp" },
        { id: "b", name: "x", systemKey: "marketing" },
      ]),
    ).toBe("b");
  });
});
