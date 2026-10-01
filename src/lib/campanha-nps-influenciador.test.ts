import { describe, expect, it } from "vitest";
import {
  InfluNpsAnswerSchema,
  InfluNpsTokenSchema,
  mapCampanhaNpsInfluRow,
} from "./campanha-nps-influenciador";

describe("InfluNpsTokenSchema", () => {
  it("aceita um token de 32 hex chars (convenção do projeto)", () => {
    const token = "a".repeat(32);
    expect(InfluNpsTokenSchema.parse({ token })).toEqual({ token });
  });

  it("rejeita token curto demais (evita full-scan por token obviamente inválido)", () => {
    expect(() => InfluNpsTokenSchema.parse({ token: "abc" })).toThrow();
  });

  it("rejeita token longo demais", () => {
    expect(() => InfluNpsTokenSchema.parse({ token: "a".repeat(100) })).toThrow();
  });
});

describe("InfluNpsAnswerSchema", () => {
  const token = "b".repeat(32);

  it("aceita nota 0", () => {
    expect(InfluNpsAnswerSchema.parse({ token, score: 0 })).toMatchObject({ score: 0 });
  });

  it("aceita nota 10", () => {
    expect(InfluNpsAnswerSchema.parse({ token, score: 10 })).toMatchObject({ score: 10 });
  });

  it("rejeita nota fora de 0-10", () => {
    expect(() => InfluNpsAnswerSchema.parse({ token, score: 11 })).toThrow();
    expect(() => InfluNpsAnswerSchema.parse({ token, score: -1 })).toThrow();
  });

  it("comentário é opcional", () => {
    expect(InfluNpsAnswerSchema.parse({ token, score: 9 }).comment).toBeUndefined();
  });

  it("aceita comentário e preserva o texto", () => {
    expect(
      InfluNpsAnswerSchema.parse({ token, score: 9, comment: "Ótima experiência" }).comment,
    ).toBe("Ótima experiência");
  });

  it("rejeita comentário maior que 2000 caracteres", () => {
    expect(() =>
      InfluNpsAnswerSchema.parse({ token, score: 5, comment: "a".repeat(2001) }),
    ).toThrow();
  });
});

describe("mapCampanhaNpsInfluRow", () => {
  it("converte snake_case do banco para camelCase, preservando nulos de quem ainda não respondeu", () => {
    const row = {
      id: "1",
      campanha_id: "c1",
      influenciador_id: "i1",
      token: "t".repeat(32),
      score: null,
      comment: null,
      answered_at: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    };
    expect(mapCampanhaNpsInfluRow(row)).toEqual({
      id: "1",
      campanhaId: "c1",
      influenciadorId: "i1",
      token: "t".repeat(32),
      score: null,
      comment: null,
      answeredAt: null,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    });
  });
});
