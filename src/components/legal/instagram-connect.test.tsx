import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InstagramConnectContent, InstagramResultContent } from "./InstagramConnectContent";
import { parseConnectResult } from "./instagram-connect-result";

const page = (o: Partial<Parameters<typeof InstagramConnectContent>[0]> = {}) =>
  renderToStaticMarkup(
    <InstagramConnectContent
      state="valid"
      firstName="Ana"
      configured
      onConnect={async () => {}}
      {...o}
    />,
  );
const text = (h: string) => h.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ");

describe("página pública de conexão do Instagram", () => {
  it("link válido: explica o acesso somente leitura, a revogação e liga à política", () => {
    const h = page();
    const t = text(h);
    expect(t).toContain("Olá, Ana.");
    expect(t).toContain("somente leitura");
    expect(t).toContain("Não publicamos nada");
    expect(t).toContain("Configurações → Aplicativos e sites");
    expect(h).toContain('href="/politica-de-privacidade"');
    expect(h).toContain('href="/exclusao-de-dados"');
    expect(t).toContain("Conectar com o Instagram");
  });

  it("link expirado, usado, inválido ou integração desligada: sem botão de conectar", () => {
    for (const state of ["expired", "used", "invalid"] as const)
      expect(page({ state })).not.toContain("Conectar com o Instagram");
    expect(page({ configured: false })).not.toContain("Conectar com o Instagram");
    expect(text(page({ state: "expired" }))).toContain("expirou");
  });

  it("não expõe dados além do primeiro nome", () => {
    const h = page({ firstName: "Ana" });
    expect(h).not.toMatch(/Souza|access_token|token/i);
  });

  it("resultados do OAuth: mensagens claras e status desconhecido vira 'inválido'", () => {
    expect(text(renderToStaticMarkup(<InstagramResultContent status="ok" />))).toContain(
      "Instagram conectado",
    );
    expect(text(renderToStaticMarkup(<InstagramResultContent status="negado" />))).toContain(
      "não autorizou",
    );
    expect(parseConnectResult("ok")).toBe("ok");
    expect(parseConnectResult("<script>")).toBe("invalido");
    expect(parseConnectResult(undefined)).toBe("invalido");
  });
});
