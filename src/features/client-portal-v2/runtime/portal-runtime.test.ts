import { describe, expect, it } from "vitest";
import { makePortalPaths } from "./portal-runtime";

const real = makePortalPaths("/portal-v2");
const demo = makePortalPaths("/demo/TOKEN123");

describe("makePortalPaths — portal real (comportamento de sempre)", () => {
  it("caminhos com o prefixo /portal-v2", () => {
    expect(real.inicio()).toBe("/portal-v2/inicio");
    expect(real.campanhas()).toBe("/portal-v2/campanhas");
    expect(real.campanha("c1")).toBe("/portal-v2/campanhas/c1");
    expect(real.relatorios()).toBe("/portal-v2/relatorios");
    expect(real.arquivos()).toBe("/portal-v2/arquivos");
  });

  it("rebase é a IDENTIDADE (nenhuma URL do portal real muda)", () => {
    for (const href of [
      "/portal-v2/campanhas/c1?influenciador=i1&entrega=e1",
      "/portal-v2/configuracoes/perfil",
      "/portal-v2",
      "/outra/coisa",
      "",
    ]) {
      expect(real.rebase(href)).toBe(href);
    }
  });
});

describe("makePortalPaths — demonstração", () => {
  it("caminhos sob /demo/<token>", () => {
    expect(demo.inicio()).toBe("/demo/TOKEN123/inicio");
    expect(demo.campanha("c1")).toBe("/demo/TOKEN123/campanhas/c1");
    expect(demo.arquivos()).toBe("/demo/TOKEN123/arquivos");
  });

  it("rebase troca só o PREFIXO e preserva caminho, query e hash", () => {
    expect(demo.rebase("/portal-v2/campanhas/c1?influenciador=i1&competencia=2026-09")).toBe(
      "/demo/TOKEN123/campanhas/c1?influenciador=i1&competencia=2026-09",
    );
    expect(demo.rebase("/portal-v2/relatorios")).toBe("/demo/TOKEN123/relatorios");
    expect(demo.rebase("/portal-v2")).toBe("/demo/TOKEN123");
    expect(demo.rebase("/portal-v2?x=1")).toBe("/demo/TOKEN123?x=1");
  });

  it("não reescreve o que não é do portal (nem prefixos parecidos)", () => {
    for (const href of [
      "/portal-v2x/campanhas",
      "/time",
      "/portal/abc",
      "https://x.com/portal-v2/a",
    ]) {
      expect(demo.rebase(href), href).toBe(href);
    }
  });

  it("rebase é idempotente (rebase de um caminho já de demo não muda)", () => {
    const once = demo.rebase("/portal-v2/campanhas/c1");
    expect(demo.rebase(once)).toBe(once);
  });

  it("isActive: o item de navegação só vale para o PRÓPRIO prefixo", () => {
    expect(demo.isActive("/demo/TOKEN123/campanhas/c1", "campanhas")).toBe(true);
    expect(demo.isActive("/demo/TOKEN123/inicio", "campanhas")).toBe(false);
    expect(demo.isActive("/portal-v2/campanhas", "campanhas")).toBe(false);
    expect(real.isActive("/portal-v2/relatorios", "relatorios")).toBe(true);
  });
});

import { PreviewPortalRuntime } from "./preview-runtime";
import { DemoPortalRuntime } from "./demo-runtime";
describe("runtimes expõem a API de artigos", () => {
  it("preview e demo existem como componentes (contrato PortalApi checado pelo typecheck)", () => {
    expect(typeof PreviewPortalRuntime).toBe("function");
    expect(typeof DemoPortalRuntime).toBe("function");
  });
});
