import { describe, expect, it } from "vitest";
import type { PublicArticle } from "@/lib/portal-types";
import {
  artigoDateLabel,
  artigoSummary,
  findArtigo,
  hasBlogArtigos,
  sortArtigos,
} from "../lib/blog-artigos";
import { makePortalPaths } from "../runtime/portal-runtime";

const a = (
  id: string,
  publishDate?: string,
  extra: Partial<PublicArticle> = {},
): PublicArticle => ({
  id,
  title: id,
  publishDate,
  ...extra,
});

describe("blog do portal V2", () => {
  it("menu só aparece com ao menos um artigo", () => {
    expect(hasBlogArtigos([])).toBe(false);
    expect(hasBlogArtigos(undefined)).toBe(false);
    expect(hasBlogArtigos([a("1")])).toBe(true);
  });
  it("ordena do mais recente ao mais antigo sem mutar a entrada", () => {
    const input = [a("a", "2026-01-01"), a("c", "2026-09-03T10:00"), a("b", "2026-05-01")];
    expect(sortArtigos(input).map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(input[0].id).toBe("a");
  });
  it("findArtigo: só devolve artigo da lista da sessão (outro id = nulo)", () => {
    const list = [a("1")];
    expect(findArtigo(list, "1")?.id).toBe("1");
    expect(findArtigo(list, "2")).toBeNull();
    expect(findArtigo(list, undefined)).toBeNull();
  });
  it("data aceita 'YYYY-MM-DD' e ISO com hora", () => {
    expect(artigoDateLabel("2026-09-03")).toBe("03/09/2026");
    expect(artigoDateLabel("2026-09-03T14:30:00.000Z")).toBe("03/09/2026");
    expect(artigoDateLabel(undefined)).toBeUndefined();
    expect(artigoDateLabel("x")).toBeUndefined();
  });
  it("resumo usa excerpt; senão limpa markdown e corta", () => {
    expect(artigoSummary({ excerpt: "Resumo" })).toBe("Resumo");
    expect(artigoSummary({ content: "# Título\n**texto** [link](http://x.com)" })).toBe(
      "Título texto link",
    );
    expect(artigoSummary({ content: "a".repeat(300) }, 50).length).toBe(50);
  });
  it("caminhos: real e demo", () => {
    expect(makePortalPaths("/portal-v2").blog()).toBe("/portal-v2/blog");
    expect(makePortalPaths("/portal-v2").artigo("p 1")).toBe("/portal-v2/blog/p%201");
    expect(makePortalPaths("/portal-v2").isActive("/portal-v2/blog/x", "blog")).toBe(true);
    expect(makePortalPaths("/demo/T").artigo("p")).toBe("/demo/T/blog/p");
  });
});
