import { describe, expect, it } from "vitest";
import { HYPITO_AUTHOR_ID, isHypitoAuthorId, weeklyReportIdempotencyKey } from "./hypito";

describe("HYPITO_AUTHOR_ID", () => {
  it("é um UUID sintaticamente válido (formato exigido pela coluna uuid do Postgres)", () => {
    expect(HYPITO_AUTHOR_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe("isHypitoAuthorId", () => {
  it("reconhece o autor Hypito", () => {
    expect(isHypitoAuthorId(HYPITO_AUTHOR_ID)).toBe(true);
  });

  it("rejeita qualquer outro id, incluindo null/undefined/'system'", () => {
    expect(isHypitoAuthorId("00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(isHypitoAuthorId(null)).toBe(false);
    expect(isHypitoAuthorId(undefined)).toBe(false);
    expect(isHypitoAuthorId("system")).toBe(false);
  });
});

describe("weeklyReportIdempotencyKey", () => {
  it("segue o formato weekly-report:{workspaceId}:{weekStart} pedido", () => {
    expect(weeklyReportIdempotencyKey("default", "2026-09-07")).toBe(
      "weekly-report:default:2026-09-07",
    );
  });

  it("funciona para múltiplos workspaces com a mesma semana sem colidir", () => {
    const a = weeklyReportIdempotencyKey("workspace-a", "2026-09-07");
    const b = weeklyReportIdempotencyKey("workspace-b", "2026-09-07");
    expect(a).not.toBe(b);
  });

  it("é estável — chamar de novo para a mesma semana produz a mesma chave (idempotência)", () => {
    const first = weeklyReportIdempotencyKey("default", "2026-09-07");
    const second = weeklyReportIdempotencyKey("default", "2026-09-07");
    expect(first).toBe(second);
  });
});
