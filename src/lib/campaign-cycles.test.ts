import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  found: [] as (string | null)[], // respostas sucessivas do SELECT
  insert: { data: null as { id: string } | null, error: null as unknown },
  inserted: [] as unknown[],
  selects: 0,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = () => {
        const id = h.found[Math.min(h.selects, h.found.length - 1)];
        h.selects += 1;
        return Promise.resolve({ data: id ? { id } : null });
      };
      q.insert = (row: unknown) => {
        h.inserted.push(row);
        const r: Record<string, unknown> = {};
        r.select = () => r;
        r.single = () => Promise.resolve(h.insert);
        return r;
      };
      return q;
    },
  },
}));

import { ensureCampaignCycleId } from "./campaign-cycles";

beforeEach(() => {
  h.found = [];
  h.insert = { data: null, error: null };
  h.inserted = [];
  h.selects = 0;
});

describe("ensureCampaignCycleId — o mês vem da campanha, nunca é reatribuído", () => {
  it("ciclo existente: reaproveita, não insere", async () => {
    h.found = ["cycle-out"];
    expect(await ensureCampaignCycleId("camp-1", "2026-10")).toBe("cycle-out");
    expect(h.inserted).toHaveLength(0);
  });
  it("ciclo novo (novembro): cria um registro próprio sem mexer no de outubro", async () => {
    h.found = [null];
    h.insert = { data: { id: "cycle-nov" }, error: null };
    expect(await ensureCampaignCycleId("camp-1", "2026-11")).toBe("cycle-nov");
    expect(h.inserted).toEqual([
      { campanha_id: "camp-1", competence_year: 2026, competence_month: 11 },
    ]);
  });
  it("corrida no UNIQUE: relê e devolve o ciclo criado por outra aba", async () => {
    h.found = [null, "cycle-race"];
    h.insert = { data: null, error: { code: "23505" } };
    expect(await ensureCampaignCycleId("camp-1", "2026-10")).toBe("cycle-race");
  });
  it("mês inválido: nada é consultado nem criado", async () => {
    expect(await ensureCampaignCycleId("camp-1", "2026-13")).toBeNull();
    expect(await ensureCampaignCycleId("camp-1", "")).toBeNull();
    expect(h.selects).toBe(0);
    expect(h.inserted).toHaveLength(0);
  });
});
