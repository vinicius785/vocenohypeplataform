import { describe, expect, it } from "vitest";
import { secretsMatch } from "./secrets.server";

describe("secretsMatch", () => {
  it("aceita o segredo exato", () => {
    expect(secretsMatch("s3gredo-longo-abc123", "s3gredo-longo-abc123")).toBe(true);
  });
  it("recusa segredo diferente, mesmo com o mesmo tamanho", () => {
    expect(secretsMatch("s3gredo-longo-abc124", "s3gredo-longo-abc123")).toBe(false);
  });
  it("recusa tamanho diferente (inclusive prefixo e vazio) sem lançar", () => {
    expect(secretsMatch("s3gredo", "s3gredo-longo-abc123")).toBe(false);
    expect(secretsMatch("s3gredo-longo-abc123-extra", "s3gredo-longo-abc123")).toBe(false);
    expect(secretsMatch("", "s3gredo-longo-abc123")).toBe(false);
  });
  it("diferencia maiúsculas de minúsculas e compara bytes (acentos)", () => {
    expect(secretsMatch("Segredo", "segredo")).toBe(false);
    expect(secretsMatch("açaí", "açaí")).toBe(true);
    expect(secretsMatch("acai", "açaí")).toBe(false);
  });
});
