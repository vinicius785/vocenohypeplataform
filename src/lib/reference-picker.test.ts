import { describe, expect, it } from "vitest";
import type { MentionOption } from "./mention-kinds";
import { buildReferenceView, pushRecent } from "./reference-picker";

const o = (kind: MentionOption["kind"], id: string, label: string, hint?: string, boost?: number) =>
  ({ kind, id, label, hint, boost }) as MentionOption;
const refs: MentionOption[] = [
  o("task", "t1", "Portal do Cliente - VNH", "Projeto: Você no Hype"),
  o("task", "t2", "Tela de Login - VNH", "Projeto: Você no Hype"),
  o("task", "t3", "Revisar contrato", "Projeto: Jurídico"),
  o("project", "p1", "Você no Hype", "Projeto"),
  o("project", "p2", "Marketing", "Projeto"),
  o("campaign", "c1", "PoupaTempo RJ", "Campanha · Governo"),
  o("client", "k1", "Governo RJ", "Cliente"),
  o("user", "u1", "Lucas"),
];

describe("seletor # — home", () => {
  it("só '#': recentes (resolvidos) + categorias com contagem; pessoas nunca entram", () => {
    const v = buildReferenceView({
      references: refs,
      query: "",
      recents: [
        { kind: "project", id: "p2" },
        { kind: "task", id: "removida" },
        { kind: "campaign", id: "c1" },
      ],
    });
    expect(v.mode).toBe("home");
    expect(v.sections.map((s) => s.key)).toEqual(["recents", "categories"]);
    const rec = v.sections[0].rows.map((r) => r.type === "item" && r.option.label);
    expect(rec).toEqual(["Marketing", "PoupaTempo RJ"]);
    expect(v.sections[1].rows).toEqual([
      { type: "category", kind: "task", count: 3 },
      { type: "category", kind: "project", count: 2 },
      { type: "category", kind: "campaign", count: 1 },
      { type: "category", kind: "client", count: 1 },
    ]);
  });
  it("sem recentes: só categorias", () => {
    const v = buildReferenceView({ references: refs, query: "", recents: [] });
    expect(v.sections.map((s) => s.key)).toEqual(["categories"]);
  });
  it("limita recentes a 5", () => {
    const many = Array.from({ length: 9 }, (_, i) => o("task", "x" + i, "T" + i));
    const v = buildReferenceView({
      references: many,
      query: "",
      recents: many.map((m) => ({ kind: "task" as const, id: m.id })),
    });
    expect(v.sections[0].rows).toHaveLength(5);
  });
});

describe("seletor # — busca", () => {
  it("agrupa por categoria e mostra só o que casa", () => {
    const v = buildReferenceView({ references: refs, query: "portal" });
    expect(v.mode).toBe("search");
    expect(v.sections.map((s) => s.label)).toEqual(["Tarefas"]);
    expect(v.rows).toHaveLength(1);
  });
  it("acha pelo contexto (projeto da tarefa) e pelo nome, nome primeiro", () => {
    const v = buildReferenceView({ references: refs, query: "hype" });
    expect(v.sections.map((s) => s.key)).toEqual(["task", "project"]);
    expect(v.sections[0].rows).toHaveLength(2); // as tarefas do projeto
    expect(v.sections[1].rows[0]).toMatchObject({ option: { label: "Você no Hype" } });
  });
  it("sem resultado irrelevante", () => {
    expect(buildReferenceView({ references: refs, query: "zzz" }).rows).toEqual([]);
  });
  it("poucos por grupo", () => {
    const many = Array.from({ length: 10 }, (_, i) => o("task", "x" + i, "Portal " + i));
    expect(buildReferenceView({ references: many, query: "portal" }).rows).toHaveLength(3);
  });
});

describe("seletor # — categoria", () => {
  it("lista só aquela categoria, melhores (boost) primeiro; busca filtra dentro", () => {
    const r = [
      o("task", "a", "A", undefined, 1),
      o("task", "b", "B", undefined, 9),
      o("client", "c", "C"),
    ];
    const v = buildReferenceView({ references: r, query: "", kind: "task" });
    expect(v.mode).toBe("category");
    expect(v.rows.map((x) => x.type === "item" && x.option.id)).toEqual(["b", "a"]);
    expect(buildReferenceView({ references: r, query: "a", kind: "task" }).rows).toHaveLength(1);
  });
});

describe("recentes", () => {
  it("mais recente primeiro, sem duplicar", () => {
    let l = pushRecent([], { kind: "task", id: "1" });
    l = pushRecent(l, { kind: "task", id: "2" });
    l = pushRecent(l, { kind: "task", id: "1" });
    expect(l.map((x) => x.id)).toEqual(["1", "2"]);
  });
});
