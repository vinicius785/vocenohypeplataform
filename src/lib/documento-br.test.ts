import { describe, expect, it } from "vitest";
import {
  isValidCnpj,
  isValidCpf,
  isValidPixKey,
  normalizeCep,
  normalizeDocumento,
  normalizeEmail,
  normalizeTelefoneBR,
  normalizeUf,
  onlyDigits,
} from "./documento-br";

describe("CPF", () => {
  it("aceita CPF válido, com ou sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("111.444.777-35")).toBe(true);
  });
  it("recusa dígito verificador errado, tamanho errado e sequência repetida", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("1234567890")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("")).toBe(false);
  });
});

describe("CNPJ", () => {
  it("aceita CNPJ válido", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11444777000161")).toBe(true);
  });
  it("recusa dígito errado e sequência repetida", () => {
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });
});

describe("normalizeDocumento", () => {
  it("formata CPF e CNPJ válidos", () => {
    expect(normalizeDocumento("52998224725")).toMatchObject({
      kind: "cpf",
      formatted: "529.982.247-25",
      valid: true,
    });
    expect(normalizeDocumento("11222333000181")).toMatchObject({
      kind: "cnpj",
      formatted: "11.222.333/0001-81",
      valid: true,
    });
  });
  it("marca como inválido sem inventar formatação para tamanho desconhecido", () => {
    expect(normalizeDocumento("123")).toMatchObject({ kind: null, valid: false, digits: "123" });
    expect(normalizeDocumento("529.982.247-24")).toMatchObject({ kind: "cpf", valid: false });
    expect(normalizeDocumento(null)).toMatchObject({ kind: null, valid: false, digits: "" });
  });
});

describe("CEP, UF, e-mail", () => {
  it("CEP exige 8 dígitos", () => {
    expect(normalizeCep("02452001")).toBe("02452-001");
    expect(normalizeCep("02452-001")).toBe("02452-001");
    expect(normalizeCep("2452001")).toBeNull();
  });
  it("UF só aceita sigla real", () => {
    expect(normalizeUf(" sp ")).toBe("SP");
    expect(normalizeUf("XX")).toBeNull();
    expect(normalizeUf("São Paulo")).toBeNull();
  });
  it("e-mail em minúsculas e formato mínimo", () => {
    expect(normalizeEmail(" Fulano@Exemplo.COM ")).toEqual({
      value: "fulano@exemplo.com",
      valid: true,
    });
    expect(normalizeEmail("sem-arroba").valid).toBe(false);
    expect(normalizeEmail("a@b").valid).toBe(false);
  });
});

describe("telefone brasileiro", () => {
  it("celular com e sem DDI", () => {
    expect(normalizeTelefoneBR("(11) 99999-0000")).toMatchObject({
      valid: true,
      formatted: "(11) 99999-0000",
    });
    expect(normalizeTelefoneBR("+55 21 98888-7777")).toMatchObject({
      valid: true,
      formatted: "(21) 98888-7777",
    });
  });
  it("fixo de 10 dígitos", () => {
    expect(normalizeTelefoneBR("1133334444")).toMatchObject({
      valid: true,
      formatted: "(11) 3333-4444",
    });
  });
  it("recusa tamanho errado, DDD inexistente e celular sem 9", () => {
    expect(normalizeTelefoneBR("99999-0000").valid).toBe(false);
    expect(normalizeTelefoneBR("(05) 99999-0000").valid).toBe(false);
    expect(normalizeTelefoneBR("(11) 89999-0000").valid).toBe(false);
    expect(normalizeTelefoneBR("").valid).toBe(false);
  });
});

describe("chave PIX por tipo", () => {
  it("cpf / cnpj / e-mail / telefone / aleatória", () => {
    expect(isValidPixKey("cpf", "529.982.247-25")).toBe(true);
    expect(isValidPixKey("cpf", "529.982.247-24")).toBe(false);
    expect(isValidPixKey("cnpj", "11.222.333/0001-81")).toBe(true);
    expect(isValidPixKey("email", "a@b.com")).toBe(true);
    expect(isValidPixKey("email", "a@b")).toBe(false);
    expect(isValidPixKey("telefone", "+5511999990000")).toBe(true);
    expect(isValidPixKey("aleatoria", "123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isValidPixKey("aleatoria", "abc")).toBe(false);
    expect(isValidPixKey("cpf", "")).toBe(false);
  });
});

describe("onlyDigits", () => {
  it("tira tudo que não é dígito e trata nulos", () => {
    expect(onlyDigits("(11) 9-9999")).toBe("1199999");
    expect(onlyDigits(undefined)).toBe("");
  });
});
