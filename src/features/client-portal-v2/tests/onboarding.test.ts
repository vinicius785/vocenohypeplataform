import { describe, expect, it } from "vitest";
import {
  isValidPhoneBR,
  onboardingStateFrom,
  phoneDigits,
  phoneForInput,
  validateOnboarding,
} from "../lib/onboarding";

describe("estado do onboarding (vem do perfil no banco)", () => {
  it("vazio → precisa; preenchido → concluído", () => {
    expect(onboardingStateFrom(null, false)).toBe("needed");
    expect(onboardingStateFrom(undefined, false)).toBe("needed");
    expect(onboardingStateFrom("2026-10-10T10:00:00Z", false)).toBe("done");
  });
  it("qualquer falha (ex.: coluna ainda não existe) nunca bloqueia o portal", () => {
    expect(onboardingStateFrom(null, true)).toBe("unknown");
  });
});

describe("telefone brasileiro", () => {
  it("aceita fixo e celular com DDD", () => {
    expect(isValidPhoneBR("(11) 99999-9999")).toBe(true);
    expect(isValidPhoneBR("11999999999")).toBe(true);
    expect(isValidPhoneBR("(11) 3333-4444")).toBe(true);
  });
  it("recusa curto, DDD inválido e celular sem o 9", () => {
    expect(isValidPhoneBR("1199999")).toBe(false);
    expect(isValidPhoneBR("(05) 99999-9999")).toBe(false);
    expect(isValidPhoneBR("(11) 89999-9999")).toBe(false);
    expect(isValidPhoneBR("")).toBe(false);
    expect(isValidPhoneBR("abc")).toBe(false);
  });
  it("máscara na edição e dígitos", () => {
    expect(phoneForInput("11999998888")).toBe("(11) 99999-8888");
    expect(phoneForInput(null)).toBe("");
    expect(phoneDigits("(11) 99999-8888")).toBe("11999998888");
  });
});

describe("validação do formulário", () => {
  it("nome e telefone válidos → sem erros", () => {
    expect(validateOnboarding({ name: "Vinícius Garcia", phone: "(11) 99999-9999" })).toEqual({});
  });
  it("campos vazios/ inválidos geram mensagens claras", () => {
    expect(validateOnboarding({ name: " ", phone: "" })).toEqual({
      name: "Informe seu nome.",
      phone: "Informe seu telefone.",
    });
    expect(validateOnboarding({ name: "Ana", phone: "(11) 9999" }).phone).toBe(
      "Informe um telefone válido com DDD.",
    );
  });
});
