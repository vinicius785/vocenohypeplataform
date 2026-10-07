import { describe, expect, it } from "vitest";
import type { BlogPost } from "@/lib/projetos";
import { editorialDate, formatEditorialDate, reconcilePublication } from "./blog-publication";

const NOW = "2026-10-07T15:00:00.000Z";
const ORIGINAL = "2026-03-15T13:00:00.000Z";
const post = (extra: Partial<BlogPost> = {}): BlogPost => ({
  id: "p1",
  title: "T",
  status: "rascunho",
  ...extra,
});
/** Simula o que o editor grava ao clicar em "Publicar agora". */
const publishNow = (p: BlogPost, now = NOW): BlogPost =>
  reconcilePublication(p, { ...p, status: "publicado", publishedAt: now, publishDate: now }, now);
const unpublish = (p: BlogPost): BlogPost =>
  reconcilePublication(p, { ...p, status: "despublicado" }, NOW);

describe("data editorial = primeira publicação", () => {
  it("1. nunca publicado: a primeira publicação recebe a data de agora", () => {
    expect(publishNow(post()).firstPublishedAt).toBe(NOW);
  });
  it("2. publicado: a data permanece em edições (título, capa, conteúdo)", () => {
    const pub = publishNow(post(), ORIGINAL);
    for (const edit of [{ title: "Novo" }, { cover: "data:x" }, { content: "texto" }]) {
      const next = reconcilePublication(pub, { ...pub, ...edit }, NOW);
      expect(next.firstPublishedAt).toBe(ORIGINAL);
    }
  });
  it("3. despublicar não apaga nem muda a data", () => {
    const pub = publishNow(post(), ORIGINAL);
    expect(unpublish(pub).firstPublishedAt).toBe(ORIGINAL);
  });
  it("4/9. republicar meses depois mantém a data original, mesmo sobrescrevendo publishedAt", () => {
    const off = unpublish(publishNow(post(), ORIGINAL));
    const again = publishNow(off, NOW);
    expect(again.firstPublishedAt).toBe(ORIGINAL);
    expect(again.publishedAt).toBe(NOW);
    expect(editorialDate(again)).toBe(ORIGINAL);
  });
  it("7. agendar não define firstPublishedAt", () => {
    const sched = reconcilePublication(
      post(),
      { ...post(), status: "agendado", publishDate: "2026-12-01T10:00:00.000Z" },
      NOW,
    );
    expect(sched.firstPublishedAt).toBeUndefined();
    expect(editorialDate(sched)).toBe("2026-12-01T10:00:00.000Z");
  });
  it("8. agendado que passa a publicado define a data na publicação", () => {
    const sched = post({ status: "agendado", publishDate: "2026-12-01T10:00:00.000Z" });
    const live = reconcilePublication(
      sched,
      { ...sched, status: "publicado", publishedAt: NOW },
      NOW,
    );
    expect(live.firstPublishedAt).toBe(NOW);
  });
  it("republicação agendada de artigo já publicado preserva a original", () => {
    const off = unpublish(publishNow(post(), ORIGINAL));
    const sched = reconcilePublication(
      off,
      { ...off, status: "agendado", publishDate: "2026-12-01T10:00:00.000Z" },
      NOW,
    );
    expect(sched.firstPublishedAt).toBe(ORIGINAL);
  });
  it("firstPublishedAt gravado é imutável, mesmo se um patch tentar trocá-lo", () => {
    const pub = publishNow(post(), ORIGINAL);
    const next = reconcilePublication(pub, { ...pub, firstPublishedAt: NOW }, NOW);
    expect(next.firstPublishedAt).toBe(ORIGINAL);
  });
  it("14. dados antigos: despublicado só com publishedAt → republicar preserva", () => {
    const legacy = post({ status: "despublicado", publishedAt: ORIGINAL, publishDate: ORIGINAL });
    expect(publishNow(legacy).firstPublishedAt).toBe(ORIGINAL);
  });
  it("14. dados antigos: despublicado sem publishedAt usa publishDate", () => {
    const legacy = post({ status: "despublicado", publishDate: "2026-03-15" });
    expect(publishNow(legacy).firstPublishedAt).toBe("2026-03-15");
  });
  it("14. rascunho com publishDate de agendamento cancelado NÃO conta como publicação", () => {
    const draft = post({ status: "rascunho", publishDate: "2026-01-01T10:00:00.000Z" });
    expect(publishNow(draft).firstPublishedAt).toBe(NOW);
  });
  it("legado publicado (sem firstPublishedAt): exibe publishedAt, depois publishDate", () => {
    expect(editorialDate(post({ status: "publicado", publishedAt: ORIGINAL }))).toBe(ORIGINAL);
    expect(editorialDate(post({ status: "publicado", publishDate: "2026-03-15" }))).toBe(
      "2026-03-15",
    );
    expect(editorialDate(post({ firstPublishedAt: ORIGINAL, publishedAt: NOW }))).toBe(ORIGINAL);
    expect(editorialDate(post())).toBeUndefined();
  });
});

describe("formatEditorialDate", () => {
  it("data pura não sofre fuso", () => {
    expect(formatEditorialDate("2026-03-15")).toBe("15/03/2026");
  });
  it("instante ISO é lido no fuso do Brasil (23:30 BRT ainda é o mesmo dia)", () => {
    expect(formatEditorialDate("2026-10-08T02:30:00.000Z")).toBe("07/10/2026");
    expect(formatEditorialDate("2026-03-15T13:00:00.000Z")).toBe("15/03/2026");
  });
  it("vazio ou inválido", () => {
    expect(formatEditorialDate(undefined)).toBeUndefined();
    expect(formatEditorialDate("lixo")).toBeUndefined();
  });
});
