import { beforeEach, describe, expect, it, vi } from "vitest";

/** Banco em memória: `failUpsert` simula RLS/sessão/trigger recusando a gravação. */
const db = { rows: new Map<string, Record<string, unknown>>(), failUpsert: false };

vi.mock("@/integrations/supabase/client", () => {
  const select = () => {
    const c: Record<string, unknown> = {};
    c.order = () => c;
    c.range = (from: number) =>
      Promise.resolve({
        data: (from > 0 ? [] : [...db.rows.values()]).map((r) => ({
          data: r.data,
          campanha_id: r.campanha_id,
        })),
        error: null,
      });
    return c;
  };
  return {
    supabase: {
      auth: { getSession: () => Promise.resolve({}) },
      from: () => ({
        select,
        upsert: (row: Record<string, unknown>) => ({
          select: () => {
            if (db.failUpsert) {
              return Promise.resolve({ data: null, error: { message: "trigger falhou" } });
            }
            db.rows.set(row.id as string, row);
            return Promise.resolve({ data: [{ id: row.id }], error: null });
          },
        }),
      }),
      channel: () => {
        const ch: Record<string, unknown> = {};
        ch.on = () => ch;
        ch.subscribe = () => ch;
        return ch;
      },
    },
  };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

type Item = { id: string; pagamento: { data?: string } };

async function fresh() {
  vi.resetModules();
  const { createScopedArrayStore } = await import("./scoped-table-store");
  return createScopedArrayStore<Item>("campanha_influenciadores", "campanha_id");
}

beforeEach(() => {
  db.rows = new Map();
  db.failUpsert = false;
});

describe("vencimento do pagamento do influenciador (persistência)", () => {
  it("cria, altera e persiste a nova data; recarregar mantém a nova data", async () => {
    const store = await fresh();
    expect(await store.set("c1", () => [{ id: "i1", pagamento: { data: "2026-10-06" } }])).toBe(
      true,
    );
    expect(db.rows.get("i1")?.data).toMatchObject({ pagamento: { data: "2026-10-06" } });

    const ok = await store.set("c1", (prev) =>
      prev.map((x) => ({ ...x, pagamento: { ...x.pagamento, data: "2026-10-20" } })),
    );
    expect(ok).toBe(true);
    expect(db.rows.get("i1")?.data).toMatchObject({ pagamento: { data: "2026-10-20" } });

    // "reabrir / recarregar a página": store novo lendo do banco.
    const reloaded = await fresh();
    await reloaded.init();
    expect(reloaded.get("c1")[0].pagamento.data).toBe("2026-10-20");
  });

  it("falha na gravação: devolve false e a tela volta ao vencimento anterior", async () => {
    const store = await fresh();
    await store.set("c1", () => [{ id: "i1", pagamento: { data: "2026-10-06" } }]);
    db.failUpsert = true;
    const ok = await store.set("c1", (prev) =>
      prev.map((x) => ({ ...x, pagamento: { ...x.pagamento, data: "2026-10-20" } })),
    );
    expect(ok).toBe(false);
    expect(store.get("c1")[0].pagamento.data).toBe("2026-10-06"); // não "aparenta" ter salvo
    expect(db.rows.get("i1")?.data).toMatchObject({ pagamento: { data: "2026-10-06" } });
  });

  it("falha num item novo: ele some em vez de ficar só na tela", async () => {
    const store = await fresh();
    db.failUpsert = true;
    expect(await store.set("c1", () => [{ id: "novo", pagamento: {} }])).toBe(false);
    expect(store.get("c1")).toEqual([]);
  });

  it("a falha de uma edição antiga não desfaz uma edição mais nova do mesmo item", async () => {
    const store = await fresh();
    await store.set("c1", () => [{ id: "i1", pagamento: { data: "2026-10-06" } }]);
    db.failUpsert = true;
    const first = store.set("c1", (p) =>
      p.map((x) => ({ ...x, pagamento: { data: "2026-10-10" } })),
    );
    db.failUpsert = false;
    const second = store.set("c1", (p) =>
      p.map((x) => ({ ...x, pagamento: { data: "2026-10-20" } })),
    );
    await Promise.all([first, second]);
    expect(store.get("c1")[0].pagamento.data).toBe("2026-10-20");
  });

  it("sem mudança de conteúdo não regrava e confirma", async () => {
    const store = await fresh();
    await store.set("c1", () => [{ id: "i1", pagamento: { data: "2026-10-06" } }]);
    db.failUpsert = true; // se regravasse, falharia
    expect(
      await store.set("c1", (p) => p.map((x) => ({ ...x, pagamento: { data: "2026-10-06" } }))),
    ).toBe(true);
  });
});
