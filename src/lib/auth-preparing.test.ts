import { describe, expect, it } from "vitest";
import { withMinimumDuration, withTimeout, PreparingTimeoutError } from "./auth-preparing";

describe("withMinimumDuration", () => {
  it("espera pelo menos o mínimo, mesmo quando o trabalho termina antes", async () => {
    const start = Date.now();
    const result = await withMinimumDuration(Promise.resolve("ok"), 50);
    expect(result).toBe("ok");
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  it("nunca atrasa além do necessário quando o trabalho já demorou mais que o mínimo", async () => {
    const slowWork = new Promise((resolve) => setTimeout(() => resolve("done"), 60));
    const start = Date.now();
    const result = await withMinimumDuration(slowWork, 10);
    expect(result).toBe("done");
    expect(Date.now() - start).toBeLessThan(120);
  });
});

describe("withTimeout — nunca fica preso em loading infinito", () => {
  it("resolve normalmente quando o trabalho termina antes do limite", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 100)).resolves.toBe("ok");
  });

  it("rejeita com PreparingTimeoutError quando o trabalho excede o limite", async () => {
    const neverResolves = new Promise(() => {});
    await expect(withTimeout(neverResolves, 20)).rejects.toBeInstanceOf(PreparingTimeoutError);
  });

  it("propaga o erro real do trabalho quando ele falha antes do timeout", async () => {
    const failing = Promise.reject(new Error("boom"));
    await expect(withTimeout(failing, 100)).rejects.toThrow("boom");
  });
});
