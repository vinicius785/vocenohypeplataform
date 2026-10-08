import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CATEGORIAS,
  displayHost,
  filterSenhas,
  safeExternalUrl,
  serviceInitials,
  type Senha,
} from "./cofre-model";
import { SenhaTile } from "./SenhaTile";

const s = (o: Partial<Senha>): Senha => ({
  id: o.id ?? "1",
  nome: "Instagram",
  categoria: "Rede social",
  usuario: "@hypeapp",
  senha: "CIFRADO",
  encrypted: true,
  ...o,
});

describe("busca e filtro", () => {
  const items = [
    s({ id: "1", nome: "Instagram", categoria: "Rede social", usuario: "@hypeapp" }),
    s({ id: "2", nome: "Autentique", categoria: "Ferramenta", usuario: "contato@vocenohype.com" }),
    s({ id: "3", nome: "Domínio .com.br", categoria: "Domínio", usuario: "" }),
  ];
  it("sem busca nem filtro devolve tudo", () => {
    expect(filterSenhas(items, "", "")).toHaveLength(3);
  });
  it("procura por nome, categoria e usuário, ignorando acento e caixa", () => {
    expect(filterSenhas(items, "INSTA", "").map((x) => x.id)).toEqual(["1"]);
    expect(filterSenhas(items, "ferramenta", "").map((x) => x.id)).toEqual(["2"]);
    expect(filterSenhas(items, "vocenohype", "").map((x) => x.id)).toEqual(["2"]);
    expect(filterSenhas(items, "dominio", "").map((x) => x.id)).toEqual(["3"]);
  });
  it("categoria e busca valem juntas", () => {
    expect(filterSenhas(items, "inst", "Ferramenta")).toEqual([]);
    expect(filterSenhas(items, "", "Domínio").map((x) => x.id)).toEqual(["3"]);
  });
  it("nunca procura dentro da senha", () => {
    expect(filterSenhas(items, "CIFRADO", "")).toEqual([]);
  });
  it("categorias preservadas (9, sem novas)", () => {
    expect(CATEGORIAS).toHaveLength(9);
  });
});

describe("identidade e URL", () => {
  it("iniciais", () => {
    expect(serviceInitials("Instagram")).toBe("IN");
    expect(serviceInitials("Meta Ads")).toBe("MA");
    expect(serviceInitials("  ")).toBe("?");
    expect(serviceInitials("Instagram — Hype App")).toBe("IH");
    expect(serviceInitials("— ")).toBe("?");
  });
  it("host de exibição", () => {
    expect(displayHost("https://www.instagram.com/x?y=1")).toBe("instagram.com");
    expect(displayHost("autentique.com.br")).toBe("autentique.com.br");
    expect(displayHost(undefined)).toBe("");
  });
  it("só abre http(s) — nunca javascript:", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,x")).toBeNull();
    expect(safeExternalUrl("instagram.com")).toBe("https://instagram.com/");
    expect(safeExternalUrl("")).toBeNull();
  });
});

describe("SenhaTile", () => {
  const noop = () => {};
  const html = (o: Partial<Senha>, canCopy = true) =>
    renderToStaticMarkup(
      <ul>
        <SenhaTile
          s={s(o)}
          canCopySenha={canCopy}
          onOpen={noop}
          onEdit={noop}
          onDelete={noop}
          onCopyUsuario={noop}
          onCopySenha={noop}
        />
      </ul>,
    );
  it("mostra nome, categoria e usuário — nunca a senha", () => {
    const h = html({ senha: "SEGREDO-123" });
    expect(h).toContain("Instagram");
    expect(h).toContain("Rede social");
    expect(h).toContain("@hypeapp");
    expect(h).not.toContain("SEGREDO-123");
  });
  it("tem rótulos acessíveis", () => {
    const h = html({});
    expect(h).toContain('aria-label="Abrir credencial Instagram"');
    expect(h).toContain('aria-label="Mais ações para Instagram"');
  });
  it("sem categoria usa texto neutro", () => {
    expect(html({ categoria: "" })).toContain("Sem categoria");
  });
});
