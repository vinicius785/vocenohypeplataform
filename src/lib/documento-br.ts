/**
 * Validação e normalização de dados cadastrais brasileiros (CPF, CNPJ, CEP, UF, telefone, e-mail,
 * chave PIX). Funções puras, sem I/O. Usadas pelo formulário de contrato do influenciador: os campos
 * do cadastro são texto livre (nada aqui valida na origem), então a conferência acontece no contrato.
 */

export const onlyDigits = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");

function allSame(d: string): boolean {
  return /^(\d)\1+$/.test(d);
}

function cpfCheckDigit(base: string): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (base.length + 1 - i);
  const r = (sum * 10) % 11;
  return r === 10 ? 0 : r;
}

export function isValidCpf(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 11 || allSame(d)) return false;
  const d1 = cpfCheckDigit(d.slice(0, 9));
  const d2 = cpfCheckDigit(d.slice(0, 9) + d1);
  return d === d.slice(0, 9) + String(d1) + String(d2);
}

function cnpjCheckDigit(base: string): number {
  const weights =
    base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < base.length; i++) sum += Number(base[i]) * weights[i];
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

export function isValidCnpj(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 14 || allSame(d)) return false;
  const d1 = cnpjCheckDigit(d.slice(0, 12));
  const d2 = cnpjCheckDigit(d.slice(0, 12) + d1);
  return d === d.slice(0, 12) + String(d1) + String(d2);
}

export const formatCpf = (d: string) =>
  `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
export const formatCnpj = (d: string) =>
  `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;

export type DocumentoNormalizado =
  | { kind: "cpf" | "cnpj"; digits: string; formatted: string; valid: true }
  | { kind: "cpf" | "cnpj" | null; digits: string; formatted: string; valid: false };

/** Aceita CPF ou CNPJ, com ou sem máscara. `valid` exige dígitos verificadores corretos. */
export function normalizeDocumento(raw: string | null | undefined): DocumentoNormalizado {
  const digits = onlyDigits(raw);
  if (digits.length === 11) {
    const valid = isValidCpf(digits);
    return valid
      ? { kind: "cpf", digits, formatted: formatCpf(digits), valid }
      : { kind: "cpf", digits, formatted: formatCpf(digits), valid: false };
  }
  if (digits.length === 14) {
    const valid = isValidCnpj(digits);
    return valid
      ? { kind: "cnpj", digits, formatted: formatCnpj(digits), valid }
      : { kind: "cnpj", digits, formatted: formatCnpj(digits), valid: false };
  }
  return { kind: null, digits, formatted: (raw ?? "").trim(), valid: false };
}

export const UF_LIST = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export function normalizeUf(raw: string | null | undefined): string | null {
  const uf = (raw ?? "").trim().toUpperCase();
  return (UF_LIST as readonly string[]).includes(uf) ? uf : null;
}

/** CEP com 8 dígitos → `XXXXX-XXX`; `null` se não tiver exatamente 8 dígitos. */
export function normalizeCep(raw: string | null | undefined): string | null {
  const d = onlyDigits(raw);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : null;
}

export type TelefoneNormalizado = { digits: string; formatted: string; valid: boolean };

/** Telefone brasileiro: aceita DDI 55; 10 dígitos (fixo) ou 11 (celular, começa com 9 após o DDD). */
export function normalizeTelefoneBR(raw: string | null | undefined): TelefoneNormalizado {
  let d = onlyDigits(raw);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  const ddd = Number(d.slice(0, 2));
  const dddOk = d.length >= 2 && ddd >= 11 && ddd <= 99 && d[1] !== "0";
  if (d.length === 11 && dddOk && d[2] === "9") {
    return {
      digits: d,
      formatted: `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`,
      valid: true,
    };
  }
  if (d.length === 10 && dddOk && /[2-5]/.test(d[2])) {
    return {
      digits: d,
      formatted: `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`,
      valid: true,
    };
  }
  return { digits: d, formatted: (raw ?? "").trim(), valid: false };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string | null | undefined): { value: string; valid: boolean } {
  const value = (raw ?? "").trim().toLowerCase();
  return { value, valid: EMAIL_RE.test(value) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PixTipo = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

/** Valida a chave PIX conforme o tipo declarado no cadastro. */
export function isValidPixKey(tipo: PixTipo, chave: string | null | undefined): boolean {
  const v = (chave ?? "").trim();
  if (!v) return false;
  switch (tipo) {
    case "cpf":
      return isValidCpf(v);
    case "cnpj":
      return isValidCnpj(v);
    case "email":
      return EMAIL_RE.test(v);
    case "telefone":
      return normalizeTelefoneBR(v).valid;
    case "aleatoria":
      return UUID_RE.test(v);
  }
}
