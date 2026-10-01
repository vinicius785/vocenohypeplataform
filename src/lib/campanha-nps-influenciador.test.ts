import { describe, expect, it } from "vitest";
import {
  InfluNpsAnswerSchema,
  InfluNpsStep1Schema,
  InfluNpsStep2Schema,
  InfluNpsStep3Schema,
  InfluNpsTokenSchema,
  mapCampanhaNpsInfluRow,
} from "./campanha-nps-influenciador";

const token = "b".repeat(32);
const allRatings = {
  communicationRating: "boa",
  briefingRating: "excelente",
  approvalProcessRating: "regular",
  paymentExperienceRating: "boa",
  overallExperienceRating: "excelente",
} as const;

describe("InfluNpsTokenSchema", () => {
  it("aceita um token de 32 hex chars (convenção do projeto)", () => {
    expect(InfluNpsTokenSchema.parse({ token })).toEqual({ token });
  });

  it("rejeita token curto demais (evita full-scan por token obviamente inválido)", () => {
    expect(() => InfluNpsTokenSchema.parse({ token: "abc" })).toThrow();
  });

  it("rejeita token longo demais", () => {
    expect(() => InfluNpsTokenSchema.parse({ token: "a".repeat(100) })).toThrow();
  });
});

describe("InfluNpsStep1Schema (NPS)", () => {
  it("aceita nota 0", () => {
    expect(InfluNpsStep1Schema.parse({ score: 0 })).toEqual({ score: 0 });
  });

  it("aceita nota 10", () => {
    expect(InfluNpsStep1Schema.parse({ score: 10 })).toEqual({ score: 10 });
  });

  it("rejeita nota fora de 0-10", () => {
    expect(() => InfluNpsStep1Schema.parse({ score: 11 })).toThrow();
    expect(() => InfluNpsStep1Schema.parse({ score: -1 })).toThrow();
  });
});

describe("InfluNpsStep2Schema (avaliações da experiência)", () => {
  it("exige as 5 avaliações", () => {
    expect(InfluNpsStep2Schema.parse(allRatings)).toEqual(allRatings);
  });

  it("rejeita quando falta alguma avaliação", () => {
    const { communicationRating, ...rest } = allRatings;
    void communicationRating;
    expect(() => InfluNpsStep2Schema.parse(rest)).toThrow();
  });

  it("rejeita um valor de rating fora do enum", () => {
    expect(() =>
      InfluNpsStep2Schema.parse({ ...allRatings, communicationRating: "péssimo" }),
    ).toThrow();
  });
});

describe("InfluNpsStep3Schema (comentários + relacionamento)", () => {
  it("todos os campos são opcionais (nunca torna comentário obrigatório)", () => {
    expect(InfluNpsStep3Schema.parse({})).toEqual({});
  });

  it("aceita os 2 comentários e o relacionamento quando presentes", () => {
    const parsed = InfluNpsStep3Schema.parse({
      improvementComment: "Poderia ser mais ágil",
      positiveComment: "Equipe muito atenciosa",
      wouldWorkAgain: "sim",
    });
    expect(parsed).toEqual({
      improvementComment: "Poderia ser mais ágil",
      positiveComment: "Equipe muito atenciosa",
      wouldWorkAgain: "sim",
    });
  });

  it("rejeita comentário maior que 2000 caracteres", () => {
    expect(() => InfluNpsStep3Schema.parse({ improvementComment: "a".repeat(2001) })).toThrow();
  });

  it("rejeita um valor de wouldWorkAgain fora do enum", () => {
    expect(() => InfluNpsStep3Schema.parse({ wouldWorkAgain: "quem_sabe" })).toThrow();
  });
});

describe("InfluNpsAnswerSchema (envio completo)", () => {
  it("aceita o payload completo (token + nota + 5 avaliações + comentários opcionais)", () => {
    const payload = { token, score: 9, ...allRatings, wouldWorkAgain: "sim" as const };
    expect(InfluNpsAnswerSchema.parse(payload)).toMatchObject(payload);
  });

  it("rejeita quando falta alguma avaliação do passo 2, mesmo com token e nota válidos", () => {
    expect(() => InfluNpsAnswerSchema.parse({ token, score: 9 })).toThrow();
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
      communication_rating: null,
      briefing_rating: null,
      approval_process_rating: null,
      payment_experience_rating: null,
      overall_experience_rating: null,
      improvement_comment: null,
      positive_comment: null,
      would_work_again: null,
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
      communicationRating: null,
      briefingRating: null,
      approvalProcessRating: null,
      paymentExperienceRating: null,
      overallExperienceRating: null,
      improvementComment: null,
      positiveComment: null,
      wouldWorkAgain: null,
      answeredAt: null,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    });
  });

  it("converte uma linha totalmente respondida", () => {
    const row = {
      id: "1",
      campanha_id: "c1",
      influenciador_id: "i1",
      token: "t".repeat(32),
      score: 9,
      comment: null,
      communication_rating: "boa",
      briefing_rating: "excelente",
      approval_process_rating: "regular",
      payment_experience_rating: "boa",
      overall_experience_rating: "excelente",
      improvement_comment: "Mais agilidade na aprovação",
      positive_comment: "Equipe atenciosa",
      would_work_again: "sim",
      answered_at: "2026-10-01T12:00:00Z",
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T12:00:00Z",
    };
    const mapped = mapCampanhaNpsInfluRow(row);
    expect(mapped.score).toBe(9);
    expect(mapped.communicationRating).toBe("boa");
    expect(mapped.wouldWorkAgain).toBe("sim");
    expect(mapped.answeredAt).toBe("2026-10-01T12:00:00Z");
  });
});
