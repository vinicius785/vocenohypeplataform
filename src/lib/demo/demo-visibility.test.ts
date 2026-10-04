import { describe, expect, it } from "vitest";
import {
  NO_DEMO_IDS,
  demoCampanhaIdsOf,
  demoIdsKey,
  demoTaskIdsOf,
  isDemoCliente,
  withoutDemoCampanhas,
} from "./demo-visibility";

describe("isDemoCliente", () => {
  it("só o marcador string não vazio caracteriza demo", () => {
    expect(isDemoCliente({ demoSessionId: "abc" })).toBe(true);
    for (const v of [undefined, null, "", 0, 1, true, {}, []]) {
      expect(isDemoCliente({ demoSessionId: v }), String(v)).toBe(false);
    }
    expect(isDemoCliente({})).toBe(false);
    expect(isDemoCliente(null)).toBe(false);
    expect(isDemoCliente(undefined)).toBe(false);
  });
});

describe("demoCampanhaIdsOf", () => {
  const clientes = [
    { campanhas: [{ id: "real-1" }, { id: "real-2" }] },
    { demoSessionId: "s1", campanhas: [{ id: "demo-1" }] },
    { campanhas: undefined },
    { demoSessionId: "s2", campanhas: [{ id: "demo-2" }, { id: "demo-3" }] },
    { demoSessionId: "s3" },
  ];

  it("reúne as campanhas dos clientes marcados e só delas", () => {
    expect([...demoCampanhaIdsOf(clientes)].sort()).toEqual(["demo-1", "demo-2", "demo-3"]);
  });

  it("sem demo devolve SEMPRE o mesmo conjunto vazio compartilhado (caminho comum sem alocação)", () => {
    expect(demoCampanhaIdsOf([{ campanhas: [{ id: "x" }] }])).toBe(NO_DEMO_IDS);
    expect(demoCampanhaIdsOf([])).toBe(NO_DEMO_IDS);
    expect(NO_DEMO_IDS.size).toBe(0);
  });
});

describe("demoIdsKey", () => {
  it("é independente da ordem de inserção e muda quando o conjunto muda", () => {
    expect(demoIdsKey(new Set(["b", "a"]))).toBe(demoIdsKey(new Set(["a", "b"])));
    expect(demoIdsKey(new Set(["a"]))).not.toBe(demoIdsKey(new Set(["a", "b"])));
    expect(demoIdsKey(NO_DEMO_IDS)).toBe("");
  });
});

describe("withoutDemoCampanhas", () => {
  const map = new Map<string, string[]>([
    ["real", ["a"]],
    ["demo", ["b"]],
  ]);

  it("remove só as campanhas de demo, sem mutar o original", () => {
    const out = withoutDemoCampanhas(map, new Set(["demo"]));
    expect([...out.keys()]).toEqual(["real"]);
    expect([...map.keys()]).toEqual(["real", "demo"]);
  });

  it("sem demo (ou demo ausente do mapa) devolve a MESMA referência", () => {
    expect(withoutDemoCampanhas(map, NO_DEMO_IDS)).toBe(map);
    expect(withoutDemoCampanhas(map, new Set(["outra"]))).toBe(map);
  });

  it("mantém os valores e a ordem das campanhas reais", () => {
    const m = new Map([
      ["a", 1],
      ["d", 2],
      ["b", 3],
    ]);
    expect([...withoutDemoCampanhas(m, new Set(["d"]))]).toEqual([
      ["a", 1],
      ["b", 3],
    ]);
  });
});

describe("demoTaskIdsOf", () => {
  const tarefas = new Map([
    ["real", [{ id: "t-real" }]],
    ["demo", [{ id: "t1", subtasks: [{ id: "t1a", subtasks: [{ id: "t1a1" }] }] }, { id: "t2" }]],
  ]);

  it("inclui tarefas e subtarefas (em qualquer profundidade) só das campanhas de demo", () => {
    expect([...demoTaskIdsOf(tarefas, new Set(["demo"]))].sort()).toEqual([
      "t1",
      "t1a",
      "t1a1",
      "t2",
    ]);
  });

  it("sem demo, vazio; campanha de demo sem tarefas, vazio", () => {
    expect(demoTaskIdsOf(tarefas, NO_DEMO_IDS).size).toBe(0);
    expect(demoTaskIdsOf(tarefas, new Set(["sem-tarefas"])).size).toBe(0);
  });
});
