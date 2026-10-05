import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_COLOR,
  OPPORTUNITY_STAGE_TONE,
} from "./comercial-engine";
import {
  COMMERCIAL_STAGE_VISUAL,
  UNKNOWN_STAGE_VISUAL,
  stageVisual,
} from "./comercial-stage-config";

describe("identidade visual das etapas do Comercial", () => {
  it("todas as 9 etapas têm visual completo", () => {
    for (const s of OPPORTUNITY_STAGES) {
      const v = COMMERCIAL_STAGE_VISUAL[s];
      expect(v.dot && v.badge && v.text && v.ring, s).toBeTruthy();
    }
  });
  it("etapas não compartilham a cor do ponto (nenhuma repetida)", () => {
    const dots = OPPORTUNITY_STAGES.map((s) => COMMERCIAL_STAGE_VISUAL[s].dot);
    expect(new Set(dots).size).toBe(OPPORTUNITY_STAGES.length);
  });
  it("ganho é verde e perdido é vermelho (tokens semânticos)", () => {
    expect(COMMERCIAL_STAGE_VISUAL.GANHO.dot).toBe("bg-success");
    expect(COMMERCIAL_STAGE_VISUAL.PERDIDO.dot).toBe("bg-danger");
  });
  it("os aliases do motor vêm da mesma fonte", () => {
    for (const s of OPPORTUNITY_STAGES) {
      expect(OPPORTUNITY_STAGE_COLOR[s]).toBe(COMMERCIAL_STAGE_VISUAL[s].dot);
      expect(OPPORTUNITY_STAGE_TONE[s]).toBe(COMMERCIAL_STAGE_VISUAL[s].badge);
    }
  });
  it("etapa desconhecida cai num visual neutro, sem quebrar", () => {
    expect(stageVisual("XYZ")).toBe(UNKNOWN_STAGE_VISUAL);
    expect(stageVisual(undefined)).toBe(UNKNOWN_STAGE_VISUAL);
    expect(stageVisual("GANHO")).toBe(COMMERCIAL_STAGE_VISUAL.GANHO);
  });
});
