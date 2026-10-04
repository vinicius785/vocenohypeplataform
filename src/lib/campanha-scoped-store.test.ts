import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.order = () => c;
    c.maybeSingle = () => Promise.resolve({ data: null, error: null });
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: "x" }], error: null }).then(res, rej);
    return c;
  };
  return {
    supabase: {
      auth: { getSession: () => Promise.resolve({}) },
      from: () => ({ select: chain, update: chain, upsert: chain, delete: chain }),
      channel: () => {
        const ch: Record<string, unknown> = {};
        ch.on = () => ch;
        ch.subscribe = () => ch;
        return ch;
      },
      removeChannel: () => {},
    },
  };
});

// Cada teste usa módulos NOVOS: o store de clientes e os de campanha guardam estado no módulo.
async function fresh() {
  vi.resetModules();
  const scoped = await import("./campanha-scoped-store");
  const { clientesStore } = await import("./clientes-store");
  return { ...scoped, clientesStore };
}

const influ = (id: string, nome: string) =>
  ({ id, nome, redes: [], entregas: [], status: "INSCRITO" }) as never;
const task = (id: string, subtasks: unknown[] = []) =>
  ({ id, title: id, status: "Aberto", priority: "Normal", createdAt: "x", subtasks }) as never;
const cliente = (id: string, campanhaIds: string[], demo = false) =>
  ({
    id,
    empresa: id,
    responsavel: "",
    responsavelInterno: "",
    email: "",
    whatsapp: "",
    clienteDesde: "2026-01-01",
    campanhas: campanhaIds.map((c) => ({ id: c })),
    ...(demo ? { demoSessionId: "sessao" } : {}),
  }) as never;

beforeEach(() => vi.clearAllMocks());

describe("agregados sem a Demo", () => {
  it("influenciadores: a campanha de demo some de getAllCampanhaInflus, mas o acesso por campanha continua", async () => {
    const s = await fresh();
    s.saveCampanhaInflus("k-real", [influ("i1", "Real")]);
    s.saveCampanhaInflus("k-demo", [influ("i2", "Demo")]);
    s.clientesStore.hydrateOne(cliente("c-real", ["k-real"]));
    expect([...s.getAllCampanhaInflus().keys()].sort()).toEqual(["k-demo", "k-real"]);

    s.clientesStore.hydrateOne(cliente("c-demo", ["k-demo"], true));
    expect([...s.getAllCampanhaInflus().keys()]).toEqual(["k-real"]);
    // o detalhe da campanha de demo segue lendo por id
    expect(s.loadCampanhaInflus("k-demo")).toHaveLength(1);
    expect(s.loadCampanhaInflus("k-demo")[0]).toMatchObject({ nome: "Demo" });
  });

  it("tarefas: idem — e `isDemoTaskId` enxerga tarefa e subtarefa da demo, nunca as reais", async () => {
    const s = await fresh();
    s.saveCampanhaTarefas("k-real", [task("t-real", [task("t-real-sub")])]);
    s.saveCampanhaTarefas("k-demo", [task("t-demo", [task("t-demo-sub")])]);
    s.clientesStore.hydrateOne(cliente("c-demo", ["k-demo"], true));

    expect([...s.getAllCampanhaTarefas().keys()]).toEqual(["k-real"]);
    expect(s.loadCampanhaTarefas("k-demo")).toHaveLength(1);
    expect(s.isDemoTaskId("t-demo")).toBe(true);
    expect(s.isDemoTaskId("t-demo-sub")).toBe(true);
    expect(s.isDemoTaskId("t-real")).toBe(false);
    expect(s.isDemoTaskId("t-real-sub")).toBe(false);
    expect(s.isDemoTaskId("nao-existe")).toBe(false);
  });

  it("sem nenhuma demo o mapa devolvido é o próprio mapa do store (caminho comum idêntico ao de antes)", async () => {
    const s = await fresh();
    s.saveCampanhaInflus("k-real", [influ("i1", "Real")]);
    s.clientesStore.hydrateOne(cliente("c-real", ["k-real"]));
    expect(s.getAllCampanhaInflus()).toBe(s.getAllCampanhaInflus());
    expect(s.getAllCampanhaTarefas()).toBe(s.getAllCampanhaTarefas());
    expect(s.isDemoTaskId("qualquer")).toBe(false);
  });

  it("demo cadastrada mas sem dados no store: nada a filtrar, mesmo mapa", async () => {
    const s = await fresh();
    s.saveCampanhaInflus("k-real", [influ("i1", "Real")]);
    s.clientesStore.hydrateOne(cliente("c-demo", ["k-demo-sem-dados"], true));
    expect(s.getAllCampanhaInflus()).toBe(s.getAllCampanhaInflus());
    expect([...s.getAllCampanhaInflus().keys()]).toEqual(["k-real"]);
  });
});

describe("assinantes", () => {
  it("são avisados quando uma Demo chega ao cache (para quem agrega recalcular)…", async () => {
    const s = await fresh();
    const cbInflu = vi.fn();
    const cbTarefa = vi.fn();
    s.onCampanhaInflusChange(cbInflu);
    s.onCampanhaTarefasChange(cbTarefa);

    s.clientesStore.hydrateOne(cliente("c-demo", ["k-demo"], true));
    expect(cbInflu).toHaveBeenCalledTimes(1);
    expect(cbTarefa).toHaveBeenCalledTimes(1);
  });

  it("…mas NÃO por mudança de cliente real (sem ruído nas telas)", async () => {
    const s = await fresh();
    const cb = vi.fn();
    s.onCampanhaTarefasChange(cb);
    s.clientesStore.hydrateOne(cliente("c1", ["k1"]));
    s.clientesStore.hydrateOne(cliente("c2", ["k2"]));
    expect(cb).not.toHaveBeenCalled();
  });

  it("continuam recebendo as mudanças do próprio store de campanha", async () => {
    const s = await fresh();
    const cb = vi.fn();
    s.onCampanhaInflusChange(cb);
    s.saveCampanhaInflus("k1", [influ("i1", "A")]);
    expect(cb).toHaveBeenCalled();
  });

  it("cancelar a assinatura cancela as duas fontes", async () => {
    const s = await fresh();
    const cb = vi.fn();
    const off = s.onCampanhaInflusChange(cb);
    off();
    s.clientesStore.hydrateOne(cliente("c-demo", ["k-demo"], true));
    s.saveCampanhaInflus("k1", [influ("i1", "A")]);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("clientes-store: a Demo fica fora do que as telas leem", () => {
  it("get() só tem clientes reais; getAll() inclui a Demo; ids de campanha de demo expostos", async () => {
    const { clientesStore } = await fresh();
    const { getDemoCampanhaIds, isDemoCampanhaId } = await import("./clientes-store");
    clientesStore.hydrateOne(cliente("c-real", ["k-real"]));
    clientesStore.hydrateOne(cliente("c-demo", ["k-demo"], true));
    expect(clientesStore.get().map((c) => c.id)).toEqual(["c-real"]);
    expect(clientesStore.getAll().map((c) => c.id)).toEqual(["c-real", "c-demo"]);
    expect([...getDemoCampanhaIds()]).toEqual(["k-demo"]);
    expect(isDemoCampanhaId("k-demo")).toBe(true);
    expect(isDemoCampanhaId("k-real")).toBe(false);
  });

  it("o conjunto de ids é memoizado pela referência do cache", async () => {
    const { clientesStore } = await fresh();
    const { getDemoCampanhaIds } = await import("./clientes-store");
    clientesStore.hydrateOne(cliente("c-demo", ["k-demo"], true));
    expect(getDemoCampanhaIds()).toBe(getDemoCampanhaIds());
  });
});
