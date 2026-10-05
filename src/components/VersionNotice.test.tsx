import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VersionNotice } from "./VersionNotice";

const base = {
  currentVersion: "1.8.2",
  newVersion: "1.8.3",
  highlights: ["Melhorias no Comercial", "Correção no calendário"],
  updating: false,
  onUpdate: () => {},
  onDismiss: () => {},
  onShowNotes: () => {},
};

describe("VersionNotice", () => {
  it("mostra título, versão atual, nova versão, descrição e o botão", () => {
    const html = renderToStaticMarkup(<VersionNotice {...base} />);
    expect(html).toContain("Nova versão disponível");
    expect(html).toContain("v1.8.2");
    expect(html).toContain("v1.8.3");
    expect(html).toContain("Melhorias no Comercial");
    expect(html).toContain("Correção no calendário");
    expect(html).toContain("Atualizar agora");
    expect(html).toContain('aria-label="Dispensar"');
  });
  it("é responsivo: largura útil no mobile, 24rem a partir de sm, sem overflow", () => {
    const html = renderToStaticMarkup(<VersionNotice {...base} />);
    expect(html).toContain("left-4 right-4");
    expect(html).toContain("sm:w-[26rem]");
    expect(html).toContain("safe-area-inset-bottom");
    expect(html).toContain("break-words");
  });
  it("hierarquia: título em destaque, versões em sequência e ação principal depois da secundária", () => {
    const html = renderToStaticMarkup(<VersionNotice {...base} />);
    expect(html.indexOf("Nova versão disponível")).toBeLessThan(html.indexOf("v1.8.2"));
    expect(html.indexOf("v1.8.2")).toBeLessThan(html.indexOf("v1.8.3"));
    expect(html.indexOf("Ver novidades")).toBeLessThan(html.indexOf("Atualizar agora"));
    expect(html).toContain("Uma nova versão da plataforma está pronta.");
    expect(html).toContain("Versão atual v1.8.2. Nova versão v1.8.3.");
  });
  it("sem novidades: não renderiza a lista", () => {
    const html = renderToStaticMarkup(<VersionNotice {...base} highlights={[]} />);
    expect(html).not.toContain("<ul");
  });
  it("durante a atualização mostra o estado e desabilita o botão", () => {
    const html = renderToStaticMarkup(<VersionNotice {...base} updating />);
    expect(html).toContain("Atualizando...");
    expect(html).toContain("disabled");
  });
});
