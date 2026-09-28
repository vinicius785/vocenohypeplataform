import { describe, expect, it } from "vitest";
import { resolveProfileMetricEntries } from "../lib/profile-metrics";

describe("resolveProfileMetricEntries — nunca vaza o UUID interno da rede", () => {
  it("resolve a chave (rede.id) pro nome real da plataforma", () => {
    const influencer = {
      redes: [{ id: "b323c19c-ec5e-4138-b6ef-e5f19c5da1bc", plataforma: "Instagram", handle: "x" }],
      profileMetrics: {
        porRede: {
          "b323c19c-ec5e-4138-b6ef-e5f19c5da1bc": { interacoes: 100 },
        },
      },
    };
    const entries = resolveProfileMetricEntries(influencer);
    expect(entries).toHaveLength(1);
    expect(entries[0].plataforma).toBe("Instagram");
    expect(entries[0].metrics.interacoes).toBe(100);
    // nunca aparece o UUID cru como se fosse o rótulo
    expect(entries.some((e) => e.plataforma.includes("-"))).toBe(false);
  });

  it("descarta uma entrada cuja rede não existe mais no perfil (nunca vaza o UUID)", () => {
    const influencer = {
      redes: [],
      profileMetrics: {
        porRede: {
          "b323c19c-ec5e-4138-b6ef-e5f19c5da1bc": { interacoes: 100 },
        },
      },
    };
    expect(resolveProfileMetricEntries(influencer)).toEqual([]);
  });

  it("sem profileMetrics, retorna lista vazia", () => {
    expect(resolveProfileMetricEntries({ redes: [], profileMetrics: undefined })).toEqual([]);
  });
});
