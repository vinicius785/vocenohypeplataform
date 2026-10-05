import { describe, expect, it } from "vitest";
import type { DocItem } from "@/lib/projetos";
import {
  applyProjectDocEdit,
  projectDocFromInput,
  projectDocToResource,
} from "@/lib/project-doc-resources";

const legacy: DocItem = { id: "1", name: "Guia", url: "https://docs.google.com/document/d/1" };

describe("adaptador DocItem ↔ DocumentResource", () => {
  it("registro antigo (só id/name/url) vira recurso com categoria 'outro' e origem detectada", () => {
    expect(projectDocToResource(legacy)).toMatchObject({
      title: "Guia",
      kind: "link",
      category: "outro",
      pinned: false,
      sourceType: "google_docs",
    });
  });
  it("criar grava no formato de Projetos (categoria válida, não fixado)", () => {
    const d = projectDocFromInput({
      kind: "link",
      title: "",
      url: " https://www.figma.com/file/x ",
      category: "briefing",
    });
    expect(d).toMatchObject({
      name: "https://www.figma.com/file/x",
      category: "briefing",
      isPinned: false,
      sourceType: "figma",
    });
    expect(
      projectDocFromInput({ kind: "link", title: "x", url: "https://a.com", category: "???" })
        .category,
    ).toBe("outro");
  });
  it("editar preserva id e fixação", () => {
    const e = applyProjectDocEdit(
      { ...legacy, isPinned: true },
      {
        kind: "link",
        title: "Novo",
        url: "https://notion.so/p",
        category: "planejamento",
      },
    );
    expect(e).toMatchObject({
      id: "1",
      name: "Novo",
      isPinned: true,
      category: "planejamento",
      sourceType: "notion",
    });
  });
});
