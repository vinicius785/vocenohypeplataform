import { describe, expect, it } from "vitest";
import { buildPortalAccessEmail } from "./portal-access-email";

const base = {
  clienteName: "Acme",
  inviterName: "Vini",
  role: "client_standard" as const,
  actionUrl: "https://app.exemplo.com/criar-senha?x=1&y=2",
  existingAccount: false,
};

describe("buildPortalAccessEmail", () => {
  it("conta nova: link para criar senha, nível de acesso e nunca senha", () => {
    const { subject, html } = buildPortalAccessEmail(base);
    expect(subject).toBe("Você recebeu acesso ao portal da Acme");
    expect(html).toContain("Criar minha senha e acessar");
    expect(html).toContain("Administrador");
    expect(html).toContain('href="https://app.exemplo.com/criar-senha?x=1&amp;y=2"');
    expect(html.toLowerCase()).not.toContain("senha temporária");
  });
  it("conta existente: texto do login e papel de visualizador", () => {
    const { html } = buildPortalAccessEmail({
      ...base,
      existingAccount: true,
      role: "client_viewer",
    });
    expect(html).toContain("Acessar o portal");
    expect(html).toContain("Visualizador");
    expect(html).toContain("senha que você já usa");
  });
  it("escapa HTML em nomes", () => {
    const { html } = buildPortalAccessEmail({
      ...base,
      clienteName: "<b>X</b>",
      inviterName: "A&B",
    });
    expect(html).not.toContain("<b>X</b>");
    expect(html).toContain("&lt;b&gt;X&lt;/b&gt;");
    expect(html).toContain("A&amp;B");
  });
});
