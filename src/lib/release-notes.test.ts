import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION } from "@/lib/app-version";
import {
  fetchVersionInfo,
  getSeenVersion,
  isNewerVersion,
  isUpdateAvailable,
  markVersionSeen,
  releaseHighlights,
  type Release,
} from "@/lib/release-notes";

const release: Release = {
  version: "1.2.0",
  summary: "Resumo curto.",
  modules: [
    {
      name: "A",
      items: [
        { title: "Melhorias no Comercial", description: "x" },
        { title: "Correção no calendário", description: "y" },
      ],
    },
    {
      name: "B",
      items: [
        { title: "Ajustes de performance", description: "z" },
        { title: "Quarto item", description: "w" },
      ],
    },
  ],
};

describe("isNewerVersion", () => {
  it("mesma versão não gera aviso", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });
  it("servidor mais novo gera aviso (SemVer, não texto)", () => {
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(true);
    expect(isNewerVersion("1.10.0", "1.9.0")).toBe(true);
  });
  it("servidor mais antigo (rollback/CDN atrasada) não gera aviso", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(false);
  });
  it("sem versão do servidor não avisa; formato fora do padrão cai na igualdade", () => {
    expect(isNewerVersion(undefined, "1.0.0")).toBe(false);
    expect(isNewerVersion("abc", "1.0.0")).toBe(true);
    expect(isNewerVersion("abc", "abc")).toBe(false);
  });
});

describe("releaseHighlights", () => {
  it("lista até 3 títulos curtos do que mudou", () => {
    expect(releaseHighlights(release)).toEqual([
      "Melhorias no Comercial",
      "Correção no calendário",
      "Ajustes de performance",
    ]);
  });
  it("sem itens usa o resumo; sem release devolve vazio", () => {
    expect(releaseHighlights({ ...release, modules: [] })).toEqual(["Resumo curto."]);
    expect(releaseHighlights(null)).toEqual([]);
  });
});

describe("fetchVersionInfo", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("consulta sem cache e devolve o JSON", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ version: "1.0.1" }) }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchVersionInfo()).toEqual({ version: "1.0.1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^\/version\.json\?t=\d+$/);
    expect(init.cache).toBe("no-store");
  });
  it("falha de rede, resposta não-ok ou JSON inválido viram null (sem lançar)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    expect(await fetchVersionInfo()).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false })),
    );
    expect(await fetchVersionInfo()).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => Promise.reject(new Error("x")) })),
    );
    expect(await fetchVersionInfo()).toBeNull();
  });
});

describe("dispensar o aviso", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("vale só para a sessão (sessionStorage) e tolera storage indisponível", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    expect(getSeenVersion("vi")).toBeNull();
    markVersionSeen("vi", "1.0.1");
    expect(getSeenVersion("vi")).toBe("1.0.1");
    // Uma versão ainda mais nova NÃO está "vista": o aviso volta para ela.
    expect(getSeenVersion("vi") === "1.0.2").toBe(false);
    vi.unstubAllGlobals();
    expect(() => markVersionSeen("vi", "1.0.1")).not.toThrow();
    expect(getSeenVersion("vi")).toBeNull();
  });
});

describe("consistência do versionamento", () => {
  it("APP_VERSION, public/version.json e a release mais recente andam juntos", () => {
    const file = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../public/version.json"), "utf8"),
    ) as { version: string; releases: Release[] };
    expect(file.version).toBe(APP_VERSION);
    expect(file.releases[0]?.version).toBe(APP_VERSION);
  });
});

describe("isUpdateAvailable (deploy novo sem bump de versão)", () => {
  const cur = { version: "1.0.0", build: "aaaaaaa" };
  it("mesmo build e mesma versão: sem aviso", () => {
    expect(isUpdateAvailable({ version: "1.0.0", build: "aaaaaaa" }, cur)).toBe(false);
  });
  it("build diferente com a mesma versão: avisa", () => {
    expect(isUpdateAvailable({ version: "1.0.0", build: "bbbbbbb" }, cur)).toBe(true);
  });
  it("versão maior avisa; versão menor (rollback) não avisa nem com build diferente", () => {
    expect(isUpdateAvailable({ version: "1.0.1" }, cur)).toBe(true);
    expect(isUpdateAvailable({ version: "0.9.0", build: "bbbbbbb" }, cur)).toBe(false);
  });
  it("sem build em um dos lados (dev/local) ou sem resposta: não avisa por build", () => {
    expect(isUpdateAvailable({ version: "1.0.0", build: "bbbbbbb" }, { ...cur, build: "" })).toBe(
      false,
    );
    expect(isUpdateAvailable({ version: "1.0.0" }, cur)).toBe(false);
    expect(isUpdateAvailable(null, cur)).toBe(false);
  });
});
