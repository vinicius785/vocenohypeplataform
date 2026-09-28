import { describe, expect, it } from "vitest";
import { CLIENT_CAMPAIGN_STATUS_LABEL, getClientFacingStatus } from "../lib/client-status";

const FORBIDDEN_LABELS = [
  "em risco",
  "crítica",
  "crítico",
  "atrasada",
  "atrasado",
  "fora do prazo",
  "com problemas",
  "atenção",
  "alerta",
  "desempenho ruim",
  "risco alto",
  "risco médio",
  "risco baixo",
  "problemática",
];

describe("getClientFacingStatus — só status operacional, nunca saúde/risco", () => {
  it("nunca retorna um rótulo da lista proibida", () => {
    for (const status of ["planned", "in_progress", "completed"] as const) {
      const { label } = getClientFacingStatus({ status });
      expect(FORBIDDEN_LABELS).not.toContain(label.toLowerCase());
    }
  });

  it("nunca usa tom de perigo (vermelho) pra nenhum status", () => {
    for (const status of ["planned", "in_progress", "completed"] as const) {
      const { tone } = getClientFacingStatus({ status });
      expect(tone).not.toBe("danger");
    }
  });

  it("mapeia cada status pro rótulo objetivo esperado", () => {
    expect(CLIENT_CAMPAIGN_STATUS_LABEL.planned).toBe("Planejada");
    expect(CLIENT_CAMPAIGN_STATUS_LABEL.in_progress).toBe("Em andamento");
    expect(CLIENT_CAMPAIGN_STATUS_LABEL.completed).toBe("Concluída");
  });
});
