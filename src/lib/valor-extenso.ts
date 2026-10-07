/**
 * Dinheiro para contratos: valores em CENTAVOS inteiros (nunca float) e formatação por extenso.
 *
 * `parseMoneyCents` devolve `null` para vazio/inválido. Os `parseMoney` antigos devolvem 0 nesses casos,
 * e 0 confunde "não configurado" com "sem valor" — num contrato isso não pode acontecer.
 */

/** "R$ 1.234,56", "1234,56", "1.234,56", "1234.56", "1.234" (milhar) → centavos; `null` se inválido. */
export function parseMoneyCents(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!s || /[^\d.,]/.test(s)) return null;

  let intPart: string;
  let fracPart = "";
  if (s.includes(",")) {
    // vírgula decimal: pontos são milhar.
    const [i, f, ...rest] = s.split(",");
    if (rest.length > 0 || f === undefined || f.includes(".") || f.length > 2) return null;
    if (i.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(i)) return null;
    intPart = i.replace(/\./g, "");
    fracPart = f;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    intPart = s.replace(/\./g, ""); // "1.234" = mil duzentos e trinta e quatro
  } else if (/^\d+(\.\d{1,2})?$/.test(s)) {
    [intPart, fracPart = ""] = s.split(".");
  } else {
    return null;
  }
  if (!/^\d+$/.test(intPart)) return null;
  if (fracPart && !/^\d+$/.test(fracPart)) return null;
  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Centavos → "1.234,56" (sem "R$": o template já traz o "R$" antes do placeholder). */
export function formatCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const reais = Math.floor(abs / 100);
  const c = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}${String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${c}`;
}

const UNIDADES = [
  "zero",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZENAS = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const CENTENAS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

/** 1..999 por extenso. */
function ate999(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    partes.push(
      resto < 20
        ? UNIDADES[resto]
        : DEZENAS[Math.floor(resto / 10)] + (resto % 10 ? ` e ${UNIDADES[resto % 10]}` : ""),
    );
  }
  return partes.join(" e ");
}

const ESCALAS: [string, string][] = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
];

/** Inteiro não negativo (até 999.999.999.999) por extenso, em português do Brasil. */
export function numeroPorExtenso(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999)
    throw new RangeError("fora do intervalo");
  if (n === 0) return "zero";
  const grupos: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000);
  const textos: { texto: string; valor: number }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (g === 0) continue;
    let texto: string;
    if (i === 1) texto = g === 1 ? "mil" : `${ate999(g)} mil`;
    else if (i === 0) texto = ate999(g);
    else texto = `${ate999(g)} ${g === 1 ? ESCALAS[i][0] : ESCALAS[i][1]}`;
    textos.push({ texto, valor: g });
  }
  // "e" antes do último grupo quando ele é < 100 ou múltiplo de 100 ("mil e cem", "dois mil e quinhentos").
  return textos
    .map((t, idx) => {
      const ultimo = idx === textos.length - 1 && textos.length > 1;
      return ultimo && (t.valor < 100 || t.valor % 100 === 0) ? `e ${t.texto}` : t.texto;
    })
    .join(" ");
}

/** Centavos → "mil duzentos e trinta e quatro reais e cinquenta e seis centavos". */
export function valorPorExtenso(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new RangeError("valor inválido");
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const partes: string[] = [];
  if (reais > 0 || centavos === 0) {
    const sufixo =
      reais === 1 ? "real" : reais > 0 && reais % 1_000_000 === 0 ? "de reais" : "reais";
    partes.push(`${numeroPorExtenso(reais)} ${sufixo}`);
  }
  if (centavos > 0)
    partes.push(`${numeroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  return partes.join(" e ");
}
