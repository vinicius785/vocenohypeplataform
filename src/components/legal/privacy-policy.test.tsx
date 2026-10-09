import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PRIVACY_CONTROLLER,
  PRIVACY_POLICY_PENDING,
  PRIVACY_POLICY_UPDATED_AT,
} from "@/lib/privacy-policy-config";
import { PrivacyPolicyContent } from "./PrivacyPolicyContent";

const html = renderToStaticMarkup(<PrivacyPolicyContent />);
const text = html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ");

describe("política de privacidade (texto renderizado no servidor)", () => {
  it("tem título, data de atualização e as 14 seções, com índice navegável", () => {
    expect(html).toContain("<h1");
    expect(html).toContain(`dateTime="${PRIVACY_POLICY_UPDATED_AT}"`);
    expect(html.match(/<h2 /g)).toHaveLength(14);
    for (const id of ["controlador", "google", "meta", "exclusao-de-dados", "cookies"])
      expect(html).toContain(`href="#${id}"`);
    expect(html).toContain('lang="pt-BR"');
  });

  it("dados da empresa vêm da ficha do CNPJ e do que a empresa informou; nada é inventado", () => {
    expect(text).toContain("VOCE NO HYPE MARKETING E ENTRETENIMENTO LTDA");
    expect(text).toContain("43.442.408/0001-26");
    expect(text).toContain("R. Joaquim Floriano, 243");
    expect(text).toContain("(11) 3834-5221");
    expect(PRIVACY_CONTROLLER.canalPrivacidade).toBe("contato@vocenohype.com.br");
    expect(html).toContain('href="mailto:contato@vocenohype.com.br"');
    // o único e-mail da página é o canal informado (o da contabilidade da ficha não entra)
    expect([...new Set(html.match(/[\w.-]+@[\w.-]+\.\w+/g))]).toEqual([
      "contato@vocenohype.com.br",
    ]);
    expect(PRIVACY_POLICY_PENDING).toEqual([]);
    expect(text).not.toContain("[A PREENCHER");
    expect(text).toContain("pelo canal de contato acima");
  });

  it("o CNPJ informado tem dígitos verificadores válidos", () => {
    const d = PRIVACY_CONTROLLER.cnpj!.replace(/\D/g, "");
    const dv = (s: string, w: number[]) => {
      const r = s.split("").reduce((t, ch, i) => t + Number(ch) * w[i], 0) % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const d1 = dv(d.slice(0, 12), w1);
    const d2 = dv(d.slice(0, 12) + d1, [6, ...w1]);
    expect(d.slice(12)).toBe(`${d1}${d2}`);
  });

  it("Google: só Agenda, escopos reais e declaração de Uso Limitado", () => {
    expect(text).toContain("calendar.events");
    expect(text).toContain("Uso Limitado");
    expect(html).toContain("developers.google.com/terms/api-services-user-data-policy");
    expect(text).toContain("Não acessamos Gmail, Drive");
    expect(text).toContain("Desconectar");
  });

  it("os escopos declarados são os do código", () => {
    const src = readFileSync(
      new URL("../../lib/google-calendar.functions.ts", import.meta.url),
      "utf8",
    );
    expect(src).toContain('"https://www.googleapis.com/auth/calendar.events openid email"');
    expect(src).toContain("calendar/v3/calendars/primary/events");
  });

  it("Meta: declara que não há integração e não promete callback inexistente", () => {
    expect(text).toContain("não se conecta às APIs da Meta");
    expect(text).toContain("não existe");
    expect(text).toMatch(/endpoint automático de exclusão/);
    const src = readFileSync(
      new URL("../../lib/google-calendar.functions.ts", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/graph\.facebook\.com/);
  });

  it("integração Autentique aparece como em teste, e o texto não afirma analytics nem segurança absoluta", () => {
    expect(text).toMatch(/em implementação e teste/);
    expect(text).toContain("não usa cookies de publicidade");
    expect(text).toContain("Nenhum sistema é totalmente seguro");
    expect(text).not.toMatch(/100% seguro|totalmente seguros|ISO 27001|SOC ?2/i);
  });

  it("não vaza segredos nem detalhes internos", () => {
    expect(html).not.toMatch(
      /service_role|client_secret|GOOGLE_CLIENT|AUTENTIQUE_API|SUPABASE_|sb_secret|eyJ[A-Za-z0-9]{20}|Bearer /,
    );
  });
});
