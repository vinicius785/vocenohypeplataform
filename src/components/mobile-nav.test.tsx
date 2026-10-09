import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MOBILE_PRIMARY_KEYS, NAV_GROUPS, isMoreActive, moreGroups } from "./app-shell-nav";
import { MobileBottomNav, type MobileNavState } from "./MobileNav";

// O perfil do rodapé do "Mais" só existe com o sheet aberto; evita carregar a seção inteira.
vi.mock("@/components/ConfiguracoesSection", () => ({ SidebarProfile: () => null }));

const base: MobileNavState = {
  active: "projetos",
  allowed: () => true,
  onSelect: () => {},
  chatUnread: 0,
  dot: () => false,
  overdueDespesas: false,
};
const html = (o: Partial<MobileNavState> = {}) =>
  renderToStaticMarkup(<MobileBottomNav {...base} {...o} />);

describe("navegação mobile — definição única", () => {
  it("os 4 destinos prioritários, nesta ordem, e depois Mais", () => {
    expect([...MOBILE_PRIMARY_KEYS]).toEqual(["campanhas", "projetos", "comercial", "chat"]);
    const labels = [...html().matchAll(/<span class="text-\[11px\][^"]*">([^<]+)<\/span>/g)].map(
      (m) => m[1],
    );
    expect(labels).toEqual(["Campanhas", "Projetos", "Comercial", "Chat", "Mais"]);
  });

  it("nenhum destino da sidebar se perde: ou está na barra ou no Mais (sem duplicar)", () => {
    const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key));
    const more = moreGroups().flatMap((g) => g.items.map((i) => i.key));
    expect([...MOBILE_PRIMARY_KEYS, ...more].sort()).toEqual([...all].sort());
    expect(more.filter((k) => (MOBILE_PRIMARY_KEYS as readonly string[]).includes(k))).toEqual([]);
  });

  it("o Mais mantém os grupos da sidebar e não tem grupo vazio", () => {
    const titles = moreGroups().map((g) => g.title);
    expect(titles).toEqual(["Geral", "Operação", "Gestão"]);
    expect(moreGroups().every((g) => g.items.length > 0)).toBe(true);
  });
});

describe("estado ativo (vem da rota, não do último clique)", () => {
  it.each(MOBILE_PRIMARY_KEYS)("%s ativo marca só ele", (key) => {
    const out = html({ active: key });
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(isMoreActive(key)).toBe(false);
  });

  it.each([
    "inicio",
    "clientes",
    "reunioes",
    "financeiro",
    "time",
    "influenciadores",
    "metas",
    "configuracoes",
    "problemas",
  ] as const)("%s (dentro do Mais) acende o Mais", (key) => {
    expect(isMoreActive(key)).toBe(true);
    const out = html({ active: key });
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out).toMatch(/aria-current="page"[^>]*>(?:(?!<\/button>).)*Mais/s);
  });
});

describe("acessibilidade e permissões", () => {
  it("nav com nome acessível e botões nativos", () => {
    const out = html();
    expect(out).toContain('<nav aria-label="Navegação principal"');
    expect(out.match(/<button/g)).toHaveLength(5);
    expect(out).toContain('aria-haspopup="dialog"');
  });

  it("seção sem permissão fica desabilitada e explica", () => {
    const out = html({ allowed: (k) => k !== "comercial" });
    expect(out).toMatch(/disabled=""[^>]*aria-label="Comercial\. Sem permissão/);
    expect(html()).not.toContain("Sem permissão");
  });

  it("chat não lido e novidades aparecem no rótulo acessível", () => {
    expect(html({ chatUnread: 3 })).toContain("Chat, 3 mensagens não lidas");
    expect(html({ dot: (k) => k === "comercial" })).toContain("Comercial, há novidades");
    expect(html({ dot: (k) => k === "reunioes" })).toContain("Mais, há novidades");
    expect(html({ overdueDespesas: true })).toContain("Mais, há novidades");
  });

  it("respeita a safe area e some do desktop", () => {
    const out = html();
    expect(out).toContain("bottom-[calc(0.75rem+env(safe-area-inset-bottom))]");
    expect(out).toContain("rounded-2xl");
    expect(out).toContain("md:hidden");
  });
});
