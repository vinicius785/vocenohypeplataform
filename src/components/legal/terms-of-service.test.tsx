import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TERMS_FORO, TERMS_PATH, TERMS_UPDATED_AT } from "@/lib/privacy-policy-config";
import { LegalPageShell } from "./LegalPageShell";
import { TermsOfServiceContent } from "./TermsOfServiceContent";

const html = renderToStaticMarkup(<TermsOfServiceContent />);
const text = html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ");

describe("termos de serviço (texto renderizado no servidor)", () => {
  it("tem título, data, as 16 seções e índice navegável", () => {
    expect(html).toContain("<h1");
    expect(html).toContain(`dateTime="${TERMS_UPDATED_AT}"`);
    expect(html.match(/<h2 /g)).toHaveLength(16);
    for (const id of ["aceitacao", "acesso", "uso", "responsabilidade", "lei", "contato"])
      expect(html).toContain(`href="#${id}"`);
    expect(html).toContain('lang="pt-BR"');
  });

  it("identifica a empresa com os dados da ficha e o canal informado, sem inventar e-mail", () => {
    expect(text).toContain("VOCE NO HYPE MARKETING E ENTRETENIMENTO LTDA");
    expect(text).toContain("43.442.408/0001-26");
    expect([...new Set(html.match(/[\w.-]+@[\w.-]+\.\w+/g))]).toEqual([
      "contato@vocenohype.com.br",
    ]);
  });

  it("o foro eleito pela empresa (Comarca de São Paulo) aparece, sem marcador pendente", () => {
    expect(TERMS_FORO).toBe("da Comarca de São Paulo, Estado de São Paulo");
    expect(text).toContain("Fica eleito o foro da Comarca de São Paulo, Estado de São Paulo");
    expect(text).not.toContain("[A PREENCHER");
  });

  it("remete à Política de Privacidade e ao Google sem prometer o que não existe", () => {
    expect(html).toContain('href="/politica-de-privacidade"');
    expect(text).toContain("Google Agenda");
    expect(text).toContain("assinatura eletrônica de contratos");
    expect(text).toMatch(/não garantimos resultados|Não prometemos|não garantimos funcionamento/i);
    expect(text).not.toMatch(/100%|garantimos que|sem falhas garantido/i);
  });

  it("o modelo de acesso descrito (sem cadastro aberto) bate com o código", () => {
    const login = readFileSync(new URL("../../routes/index.tsx", import.meta.url), "utf8");
    expect(login).toContain("signInWithPassword");
    expect(login).not.toContain("signUp(");
    expect(text).toContain("não tem cadastro aberto");
  });

  it("não vaza segredos", () => {
    expect(html).not.toMatch(
      /service_role|client_secret|GOOGLE_CLIENT|AUTENTIQUE_API|SUPABASE_|sb_secret|Bearer /,
    );
  });
});

describe("moldura das páginas legais", () => {
  it("rodapé liga os dois documentos e o conteúdo fica em <main>", () => {
    const out = renderToStaticMarkup(
      <LegalPageShell>
        <p>x</p>
      </LegalPageShell>,
    );
    expect(out).toContain(`href="${TERMS_PATH}"`);
    expect(out).toContain('href="/politica-de-privacidade"');
    expect(out).toMatch(/<main id="conteudo"/);
  });
});
