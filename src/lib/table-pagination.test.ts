import { beforeEach, describe, expect, it, vi } from "vitest";

// Banco falso com teto de 1000 linhas por consulta, como o PostgREST do Supabase.
const SERVER_CAP = 1000;
let rows: { id: string; created_at: string; data: { id: string } }[] = [];
const calls: [number, number][] = [];

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.order = () => q;
    q.range = (from: number, to: number) => {
      calls.push([from, to]);
      const slice = rows.slice(from, Math.min(to + 1, from + SERVER_CAP));
      return Promise.resolve({ data: slice.map((r) => ({ data: r.data })), error: null });
    };
    return q;
  };
  return { supabase: { from: () => builder() } };
});

import { loadAllRows, TABLE_PAGE_SIZE } from "./table-array-store";

const makeRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    created_at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    data: { id: String(i) },
  }));

describe("loadAllRows — não perde linhas além do teto de 1000 do servidor", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("carrega todas as 2600 linhas, na ordem, inclusive as mais novas", async () => {
    rows = makeRows(2600);
    const all = await loadAllRows<{ id: string }>("reunioes");
    expect(all).toHaveLength(2600);
    expect(all[0].id).toBe("0");
    expect(all[2599].id).toBe("2599");
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it("tabela pequena: uma consulta com dados e outra vazia que encerra o laço", async () => {
    rows = makeRows(5);
    expect(await loadAllRows("reunioes")).toHaveLength(5);
    expect(calls).toEqual([
      [0, TABLE_PAGE_SIZE - 1],
      [5, 5 + TABLE_PAGE_SIZE - 1],
    ]);
  });

  it("tabela vazia", async () => {
    rows = [];
    expect(await loadAllRows("reunioes")).toEqual([]);
  });
});
