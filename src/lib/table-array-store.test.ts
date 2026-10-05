import { beforeEach, describe, expect, it, vi } from "vitest";

type Op = { table: string; op: string; args: unknown[]; filter: unknown[][] };

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; op: string; args: unknown[]; filter: unknown[][] }>,
  rows: [] as unknown[],
  handler: null as null | ((payload: unknown) => void),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string, op: string, args: unknown[]) => {
    const filter: unknown[][] = [];
    let range: [number, number] | null = null;
    const c: Record<string, unknown> = {};
    c.select = () => c;
    // O carregamento pagina (`.range`): devolve a fatia pedida e, depois do fim, página vazia.
    c.range = (from: number, to: number) => {
      range = [from, to];
      return c;
    };
    c.eq = (...a: unknown[]) => {
      filter.push(a);
      return c;
    };
    c.order = () => c;
    c.maybeSingle = () => Promise.resolve({ data: null, error: null });
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      h.ops.push({ table, op, args, filter });
      const selected = range ? h.rows.slice(range[0], range[1] + 1) : h.rows;
      const data = op === "select" ? selected.map((d) => ({ data: d })) : [{ id: "x" }];
      return Promise.resolve({ data, error: null }).then(res, rej);
    };
    return c;
  };
  return {
    supabase: {
      auth: { getSession: () => Promise.resolve({}) },
      from: (table: string) => ({
        select: (...a: unknown[]) => chain(table, "select", a),
        update: (...a: unknown[]) => chain(table, "update", a),
        upsert: (...a: unknown[]) => chain(table, "upsert", a),
        delete: (...a: unknown[]) => chain(table, "delete", a),
      }),
      channel: () => {
        const ch: Record<string, unknown> = {};
        ch.on = (_e: string, _c: unknown, handler: (p: unknown) => void) => {
          h.handler = handler;
          return ch;
        };
        ch.subscribe = () => ch;
        return ch;
      },
      removeChannel: () => {},
    },
  };
});

import { createTableArrayStore } from "./table-array-store";

type Item = { id: string; name: string; hidden?: boolean };
const A: Item = { id: "a", name: "A" };
const B: Item = { id: "b", name: "B" };
const D: Item = { id: "d", name: "Demo", hidden: true };

const flush = () => new Promise((r) => setTimeout(r, 0));
const writes = (): Op[] => h.ops.filter((o) => o.op !== "select");

async function load(items: Item[], withHidden: boolean) {
  h.rows = items;
  const store = createTableArrayStore<Item>(
    "clientes",
    withHidden ? { isHidden: (x) => !!x.hidden } : {},
  );
  await store.init();
  h.ops.length = 0; // ignora o SELECT do init
  return store;
}

beforeEach(() => {
  h.ops.length = 0;
  h.rows = [];
  h.handler = null;
});

describe("sem `isHidden` — comportamento de antes", () => {
  it("get() devolve o próprio cache (mesma referência) e getAll() é igual", async () => {
    const s = await load([A, B], false);
    expect(s.get()).toBe(s.getAll());
    expect(s.get()).toEqual([A, B]);
  });

  it("edita (UPDATE), cria (UPSERT) e apaga (DELETE) como sempre", async () => {
    const s = await load([A, B], false);
    s.set((prev) =>
      [...prev.filter((x) => x.id !== "b"), { ...A, name: "A2" }].filter(
        (x, i, l) => l.findIndex((y) => y.id === x.id) === i,
      ),
    );
    s.set((prev) => prev.map((x) => (x.id === "a" ? { ...x, name: "A3" } : x)));
    s.set((prev) => [...prev, { id: "c", name: "C" }]);
    await flush();
    const ops = writes().map((o) => `${o.op}:${o.filter.map((f) => f[1]).join(",")}`);
    expect(ops).toContain("delete:b");
    expect(ops).toContain("update:a");
    expect(writes().some((o) => o.op === "upsert")).toBe(true);
  });

  it("um item com `hidden: true` NÃO tem tratamento especial quando a opção não é passada", async () => {
    const s = await load([A, D], false);
    expect(s.get().map((x) => x.id)).toEqual(["a", "d"]);
    s.set((prev) => prev.filter((x) => x.id !== "d"));
    await flush();
    expect(writes().map((o) => o.op)).toEqual(["delete"]);
  });
});

describe("com `isHidden` (a Demo)", () => {
  it("carrega tudo, mas get() esconde e getAll() mostra", async () => {
    const s = await load([A, D, B], true);
    expect(s.get().map((x) => x.id)).toEqual(["a", "b"]);
    expect(s.getAll().map((x) => x.id)).toEqual(["a", "d", "b"]);
  });

  it("get() é estável (mesma referência) entre mudanças — exigência do useSyncExternalStore", async () => {
    const s = await load([A, D], true);
    expect(s.get()).toBe(s.get());
    const before = s.get();
    s.hydrateOne({ id: "z", name: "Z" });
    expect(s.get()).not.toBe(before);
    expect(s.get()).toBe(s.get());
  });

  it("o updater de set() recebe a lista COMPLETA — editar o item oculto funciona e grava", async () => {
    const s = await load([A, D], true);
    s.set((prev) => prev.map((x) => (x.id === "d" ? { ...x, name: "Demo editada" } : x)));
    await flush();
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({ op: "update", filter: [["id", "d"]] });
    expect(s.getAll().find((x) => x.id === "d")?.name).toBe("Demo editada");
    expect(s.get().map((x) => x.id)).toEqual(["a"]); // continua oculto
  });

  it("NUNCA apaga o item oculto: updater construído a partir de get() não derruba a Demo", async () => {
    const s = await load([A, D, B], true);
    const visible = s.get();
    s.set(() => visible.filter((x) => x.id !== "b")); // remove só B
    await flush();
    expect(writes().map((o) => `${o.op}:${o.filter[0]?.[1]}`)).toEqual(["delete:b"]);
    expect(
      s
        .getAll()
        .map((x) => x.id)
        .sort(),
    ).toEqual(["a", "d"]);
  });

  it("esvaziar a lista visível também preserva a oculta (e apaga só as visíveis)", async () => {
    const s = await load([A, D, B], true);
    s.set(() => []);
    await flush();
    expect(
      writes()
        .map((o) => `${o.op}:${o.filter[0]?.[1]}`)
        .sort(),
    ).toEqual(["delete:a", "delete:b"]);
    expect(s.getAll().map((x) => x.id)).toEqual(["d"]);
    expect(s.get()).toEqual([]);
  });

  it("excluir um item visível não toca no oculto (caminho comum: prev.filter)", async () => {
    const s = await load([A, D], true);
    s.set((prev) => prev.filter((x) => x.id !== "a"));
    await flush();
    expect(writes().map((o) => `${o.op}:${o.filter[0]?.[1]}`)).toEqual(["delete:a"]);
    expect(s.getAll().map((x) => x.id)).toEqual(["d"]);
  });

  it("set sem mudança real não grava nada (nem do oculto)", async () => {
    const s = await load([A, D], true);
    s.set((prev) => prev.map((x) => ({ ...x })));
    await flush();
    expect(writes()).toHaveLength(0);
  });

  it("falha ao apagar o visível reverte só ele, sem mexer no oculto", async () => {
    const s = await load([A, D], true);
    s.set(() => []);
    await flush();
    expect(s.getAll().map((x) => x.id)).toEqual(["d"]);
  });

  it("notifica os assinantes quando a Demo chega (mesmo sem mudar a lista visível)", async () => {
    const s = await load([A], true);
    const spy = vi.fn();
    s.subscribe(spy);
    s.hydrateOne(D);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(s.get().map((x) => x.id)).toEqual(["a"]);
    expect(s.getAll().map((x) => x.id)).toEqual(["a", "d"]);
  });

  it("Realtime: INSERT/UPDATE/DELETE de item oculto atualiza o cache completo e segue invisível", async () => {
    const s = await load([A], true);
    s.subscribeRealtime();
    const fire = (eventType: string, row: { id: string; data?: Item }) =>
      h.handler?.({
        eventType,
        new: eventType === "DELETE" ? null : row,
        old: eventType === "DELETE" ? row : null,
      });

    fire("INSERT", { id: "d", data: D });
    expect(s.getAll().map((x) => x.id)).toEqual(["a", "d"]);
    expect(s.get().map((x) => x.id)).toEqual(["a"]);

    fire("UPDATE", { id: "d", data: { ...D, name: "Nova" } });
    expect(s.getAll().find((x) => x.id === "d")?.name).toBe("Nova");

    fire("DELETE", { id: "d" });
    expect(s.getAll().map((x) => x.id)).toEqual(["a"]);
  });

  it("um item visível que chega por Realtime aparece normalmente", async () => {
    const s = await load([A], true);
    s.subscribeRealtime();
    h.handler?.({ eventType: "INSERT", new: { id: "b", data: B }, old: null });
    expect(s.get().map((x) => x.id)).toEqual(["a", "b"]);
  });
});
