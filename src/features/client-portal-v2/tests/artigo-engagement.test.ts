import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { BlogComment, BlogEngagement } from "@/lib/blog-engagement";
import {
  COMMENT_MAX,
  newestFirst,
  normalizeComment,
  pendingComment,
  pluralize,
  relativeTime,
  toggleLikeOptimistic,
} from "../lib/artigo-engagement";
import { EngagementView, type EngagementViewProps } from "../components/ClientArticleEngagement";

const c = (id: string, createdAt: string, body = "x"): BlogComment => ({
  id,
  authorLabel: "Ana",
  authorKind: "team",
  body,
  createdAt,
});
const eng: BlogEngagement = { likeCount: 1, likedByMe: false, comments: [] };

describe("curtir", () => {
  it("alterna e ajusta a contagem; nunca fica negativa", () => {
    expect(toggleLikeOptimistic(eng)).toMatchObject({ likedByMe: true, likeCount: 2 });
    expect(toggleLikeOptimistic({ ...eng, likedByMe: true })).toMatchObject({
      likedByMe: false,
      likeCount: 0,
    });
    expect(toggleLikeOptimistic({ likeCount: 0, likedByMe: true, comments: [] }).likeCount).toBe(0);
  });
  it("duas alternâncias voltam ao estado original", () => {
    expect(toggleLikeOptimistic(toggleLikeOptimistic(eng))).toEqual(eng);
  });
});

describe("comentários", () => {
  it("mais recentes primeiro, sem mutar a entrada", () => {
    const list = [c("a", "2026-10-01T10:00:00Z"), c("b", "2026-10-03T10:00:00Z")];
    expect(newestFirst(list).map((x) => x.id)).toEqual(["b", "a"]);
    expect(list[0].id).toBe("a");
  });
  it("normalizeComment recusa vazio e acima do limite", () => {
    expect(normalizeComment("   ")).toBeNull();
    expect(normalizeComment("  oi  ")).toBe("oi");
    expect(normalizeComment("a".repeat(COMMENT_MAX + 1))).toBeNull();
  });
  it("comentário provisório é do cliente e identificável", () => {
    const p = pendingComment("oi", "Empresa", "2026-10-07T10:00:00Z");
    expect(p.authorKind).toBe("cliente");
    expect(p.id.startsWith("pending:")).toBe(true);
  });
  it("pluralize e relativeTime", () => {
    expect(pluralize(1, "curtida", "curtidas")).toBe("1 curtida");
    expect(pluralize(0, "comentário", "comentários")).toBe("0 comentários");
    const now = Date.parse("2026-10-07T12:00:00Z");
    expect(relativeTime("2026-10-07T11:59:40Z", now)).toBe("agora");
    expect(relativeTime("2026-10-07T11:55:00Z", now)).toBe("5 min");
    expect(relativeTime("2026-10-07T10:00:00Z", now)).toBe("2 h");
    expect(relativeTime("2026-10-04T12:00:00Z", now)).toBe("3 d");
    expect(relativeTime("lixo", now)).toBe("");
  });
});

const base: EngagementViewProps = {
  eng,
  loadError: false,
  likeBusy: false,
  likeError: false,
  draft: "",
  sending: false,
  sendError: null,
  readOnly: false,
  clienteNome: "Cliente",
  onToggleLike: () => {},
  onDraft: () => {},
  onSubmit: () => {},
  onRetry: () => {},
};
const html = (p: Partial<EngagementViewProps>) =>
  renderToStaticMarkup(createElement(EngagementView, { ...base, ...p }));

describe("EngagementView", () => {
  it("vazio: mensagem discreta e contadores", () => {
    const h = html({});
    expect(h).toContain("Ainda não há comentários");
    expect(h).toContain("1 curtida");
    expect(h).toContain('aria-pressed="false"');
    expect(h).toContain("Curtir");
  });
  it("curtido: estado ativo com texto (não só cor)", () => {
    const h = html({ eng: { ...eng, likedByMe: true } });
    expect(h).toContain('aria-pressed="true"');
    expect(h).toContain("Curtido");
  });
  it("carregando: skeleton e campo desabilitado", () => {
    const h = html({ eng: null });
    expect(h).toContain('aria-busy="true"');
    expect(h).toContain("disabled");
  });
  it("erro de carga: botão de tentar novamente", () => {
    expect(html({ eng: null, loadError: true })).toContain("Tentar novamente");
  });
  it("somente leitura: sem campo de comentário e curtir desabilitado", () => {
    const h = html({ readOnly: true });
    expect(h).toContain("somente leitura");
    expect(h).not.toContain("Escreva um comentário");
  });
  it("lista comentários e rotula o campo", () => {
    const h = html({ eng: { ...eng, comments: [c("a", "2026-10-01T10:00:00Z", "Muito bom")] } });
    expect(h).toContain("Muito bom");
    expect(h).toContain('aria-label="Escreva um comentário"');
    expect(h).toContain('aria-label="Enviar comentário"');
  });
  it("erro de envio aparece como alerta", () => {
    expect(html({ sendError: "Falhou" })).toContain('role="alert"');
  });
});
