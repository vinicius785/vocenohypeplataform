import { describe, expect, it } from "vitest";
import {
  NO_FILTERS,
  countActiveFilters,
  detectSourceType,
  filterResources,
  presentSourceTypes,
  resolveTitle,
  sortResources,
  type DocumentResource,
} from "./document-resources";

const mk = (over: Partial<DocumentResource>): DocumentResource => ({
  id: over.id ?? "x",
  title: "Doc",
  url: "https://example.com",
  kind: "link",
  sourceType: "link",
  ...over,
});

describe("detectSourceType", () => {
  it("reconhece as origens pelo host e cai em link para o resto", () => {
    expect(detectSourceType("https://docs.google.com/document/d/1")).toBe("google_docs");
    expect(detectSourceType("https://drive.google.com/x")).toBe("google_drive");
    expect(detectSourceType("https://www.figma.com/file/x")).toBe("figma");
    expect(detectSourceType("https://acme.notion.site/p")).toBe("notion");
    expect(detectSourceType("https://exemplo.com")).toBe("link");
    expect(detectSourceType("não é url")).toBe("link");
  });
});

describe("filterResources", () => {
  const docs = [
    mk({ id: "1", title: "Guia inicial", category: "briefing", sourceType: "google_docs" }),
    mk({
      id: "2",
      title: "Relatórios",
      url: "https://drive.google.com/r",
      sourceType: "google_drive",
      category: "relatorio",
    }),
    mk({
      id: "3",
      title: "Contrato.pdf",
      kind: "file",
      fileName: "contrato-final.pdf",
      sourceType: "file",
    }),
  ];
  it("busca por nome, link e nome do arquivo (sem diferenciar maiúsculas)", () => {
    expect(filterResources(docs, { ...NO_FILTERS, query: "GUIA" }).map((d) => d.id)).toEqual(["1"]);
    expect(
      filterResources(docs, { ...NO_FILTERS, query: "drive.google" }).map((d) => d.id),
    ).toEqual(["2"]);
    expect(filterResources(docs, { ...NO_FILTERS, query: "final.pdf" }).map((d) => d.id)).toEqual([
      "3",
    ]);
  });
  it("filtra por categoria e por tipo, e combina", () => {
    expect(filterResources(docs, { ...NO_FILTERS, category: "briefing" })).toHaveLength(1);
    expect(filterResources(docs, { ...NO_FILTERS, sourceType: "file" }).map((d) => d.id)).toEqual([
      "3",
    ]);
    expect(
      filterResources(docs, { query: "r", category: "relatorio", sourceType: "google_drive" }),
    ).toHaveLength(1);
    expect(filterResources(docs, { query: "zzz", category: null, sourceType: null })).toHaveLength(
      0,
    );
  });
});

describe("sortResources / tipos / filtros ativos", () => {
  it("fixados primeiro, mantendo a ordem relativa", () => {
    const docs = [
      mk({ id: "a" }),
      mk({ id: "b", pinned: true }),
      mk({ id: "c" }),
      mk({ id: "d", pinned: true }),
    ];
    expect(sortResources(docs, true).map((d) => d.id)).toEqual(["b", "d", "a", "c"]);
    expect(sortResources(docs, false).map((d) => d.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("tipos presentes ordenados e filtros ativos contados", () => {
    expect(
      presentSourceTypes([
        mk({ sourceType: "link" }),
        mk({ sourceType: "figma" }),
        mk({ sourceType: "link" }),
      ]),
    ).toEqual(["figma", "link"]);
    expect(countActiveFilters({ query: "x", category: "a", sourceType: null })).toBe(1);
    expect(countActiveFilters(NO_FILTERS)).toBe(0);
  });
  it("título: digitado, senão nome do arquivo, senão o link", () => {
    expect(resolveTitle({ title: " Meu doc ", url: "https://a.com" })).toBe("Meu doc");
    expect(resolveTitle({ title: "", url: "data:x", fileName: "a.pdf" })).toBe("a.pdf");
    expect(resolveTitle({ title: "", url: " https://a.com " })).toBe("https://a.com");
  });
});
