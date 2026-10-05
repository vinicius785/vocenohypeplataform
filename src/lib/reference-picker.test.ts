import { describe, expect, it } from "vitest";
import type { MentionOption } from "./mention-kinds";
import { buildReferenceView, pushRecent } from "./reference-picker";

const t = (id: string, label: string, hint?: string, boost?: number) =>
  ({ kind: "task", id, label, hint, boost }) as MentionOption;
const refs: MentionOption[] = [
  t("t1", "Portal do Cliente - VNH", "Projeto: Você no Hype", 10),
  t("t2", "Tela de Login - VNH", "Projeto: Você no Hype", 60),
  t("t3", "Revisar contrato", "Projeto: Jurídico", 0),
  { kind: "project", id: "p1", label: "Portal Projeto" } as MentionOption,
];

describe("# = tarefas", () => {
  it("nunca lista outras categorias", () => {
    const v = buildReferenceView({ references: refs, query: "portal" });
    expect(v.items.map((o) => o.id)).toEqual(["t1"]);
  });
  it("sem texto: recentes primeiro, depois sugeridas por relevância, sem repetir", () => {
    const v = buildReferenceView({
      references: refs,
      query: "",
      recents: [
        { kind: "task", id: "t3" },
        { kind: "task", id: "sumiu" },
      ],
    });
    expect(v.mode).toBe("home");
    expect(v.sections.map((s) => s.key)).toEqual(["recents", "suggested"]);
    expect(v.items.map((o) => o.id)).toEqual(["t3", "t2", "t1"]);
  });
  it("sem recentes: só uma seção, ordenada pelo boost", () => {
    const v = buildReferenceView({ references: refs, query: "" });
    expect(v.sections.map((s) => s.key)).toEqual(["suggested"]);
    expect(v.items[0].id).toBe("t2");
  });
  it("limita a lista inicial", () => {
    const many = Array.from({ length: 30 }, (_, i) => t("x" + i, "T" + i));
    expect(buildReferenceView({ references: many, query: "" }).items).toHaveLength(8);
  });
  it("busca por título e também por projeto, título primeiro", () => {
    const v = buildReferenceView({ references: refs, query: "hype" });
    expect(v.items.map((o) => o.id).sort()).toEqual(["t1", "t2"]);
    expect(buildReferenceView({ references: refs, query: "zzz" }).items).toEqual([]);
  });
  it("recentes: mais recente primeiro, sem duplicar", () => {
    let l = pushRecent([], { kind: "task", id: "1" });
    l = pushRecent(l, { kind: "task", id: "2" });
    l = pushRecent(l, { kind: "task", id: "1" });
    expect(l.map((x) => x.id)).toEqual(["1", "2"]);
  });
});
