import { describe, expect, it } from "vitest";
import { bumpSemver, compareSemver, isValidSemver, parseSemver } from "./semver";

describe("parseSemver / isValidSemver", () => {
  it("aceita MAJOR.MINOR.PATCH", () => {
    expect(parseSemver("1.276.0")).toEqual({ major: 1, minor: 276, patch: 0 });
    expect(isValidSemver("1.276.0")).toBe(true);
  });

  it("rejeita formatos inválidos", () => {
    expect(parseSemver("1.276")).toBeNull();
    expect(parseSemver("v1.276.0")).toBeNull();
    expect(parseSemver("1.276.0-beta")).toBeNull();
    expect(isValidSemver("not-a-version")).toBe(false);
  });
});

describe("compareSemver", () => {
  it("compara numericamente, não como string", () => {
    expect(compareSemver("1.9.0", "1.10.0")).toBe(-1);
    expect(compareSemver("1.10.0", "1.9.0")).toBe(1);
    expect(compareSemver("1.276.0", "1.276.0")).toBe(0);
  });

  it("compara major/minor/patch na ordem certa", () => {
    expect(compareSemver("2.0.0", "1.999.999")).toBe(1);
    expect(compareSemver("1.5.0", "1.4.999")).toBe(1);
    expect(compareSemver("1.5.1", "1.5.0")).toBe(1);
  });

  it("lança em versão inválida", () => {
    expect(() => compareSemver("x", "1.0.0")).toThrow();
  });
});

describe("bumpSemver", () => {
  it("incrementa patch/minor/major a partir da versão atual, sem reiniciar", () => {
    expect(bumpSemver("1.276.0", "patch")).toBe("1.276.1");
    expect(bumpSemver("1.276.0", "minor")).toBe("1.277.0");
    expect(bumpSemver("1.276.0", "major")).toBe("2.0.0");
  });
});
