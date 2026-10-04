import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sends: [] as unknown[],
  topics: [] as string[],
  tables: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.order = () => c;
    c.maybeSingle = () => Promise.resolve({ data: null, error: null });
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      h.tables.push(table);
      const data =
        table === "demo_sessions"
          ? [{ campanha_id: "k-demo", realtime_key: "KEY1" }]
          : [{ id: "x" }];
      return Promise.resolve({ data, error: null }).then(res, rej);
    };
    return c;
  };
  return {
    supabase: {
      auth: { getSession: () => Promise.resolve({}) },
      from: (table: string) => ({
        select: () => chain(table),
        update: () => chain(table),
        upsert: () => chain(table),
        delete: () => chain(table),
      }),
      channel: (topic: string) => {
        h.topics.push(topic);
        const ch: Record<string, unknown> = {};
        ch.on = () => ch;
        ch.subscribe = (cb?: (s: string) => void) => {
          cb?.("SUBSCRIBED");
          return ch;
        };
        ch.send = async (msg: unknown) => {
          h.sends.push(msg);
          return "ok";
        };
        return ch;
      },
      removeChannel: async () => {},
    },
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  h.sends.length = 0;
  h.topics.length = 0;
  h.tables.length = 0;
});
afterEach(() => vi.useRealTimers());

async function fresh() {
  vi.resetModules();
  const scoped = await import("./campanha-scoped-store");
  const { clientesStore } = await import("./clientes-store");
  clientesStore.hydrateOne({
    id: "c-demo",
    empresa: "Demo",
    responsavel: "",
    responsavelInterno: "",
    email: "",
    whatsapp: "",
    clienteDesde: "2026-01-01",
    demoSessionId: "s",
    campanhas: [{ id: "k-demo" }],
  } as never);
  clientesStore.hydrateOne({
    id: "c-real",
    empresa: "Real",
    responsavel: "",
    responsavelInterno: "",
    email: "",
    whatsapp: "",
    clienteDesde: "2026-01-01",
    campanhas: [{ id: "k-real" }],
  } as never);
  return scoped;
}

const influ = (id: string) =>
  ({ id, nome: "N", redes: [], entregas: [], status: "INSCRITO" }) as never;

describe("Time → cliente: sinal depois de gravar na campanha da DEMO", () => {
  it("gravar influenciadores da demo envia UM broadcast no tópico da sessão", async () => {
    const s = await fresh();
    s.saveCampanhaInflus("k-demo", [influ("i1")]);
    s.saveCampanhaInflus("k-demo", [influ("i1"), influ("i2")]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.tables).toContain("demo_sessions");
    expect(h.topics).toEqual(["demo:KEY1"]);
    expect(h.sends).toEqual([{ type: "broadcast", event: "changed", payload: {} }]);
  });

  it("cronograma da demo também avisa", async () => {
    const s = await fresh();
    s.saveCampanhaCronograma("k-demo", [{ id: "c1", date: "2026-10-10", title: "x" }]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.sends).toHaveLength(1);
  });

  it("campanha COMUM nunca dispara sinal nem consulta `demo_sessions`", async () => {
    const s = await fresh();
    s.saveCampanhaInflus("k-real", [influ("i1")]);
    s.saveCampanhaCronograma("k-real", []);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.sends).toHaveLength(0);
    expect(h.topics).toHaveLength(0);
    expect(h.tables).not.toContain("demo_sessions");
  });
});
