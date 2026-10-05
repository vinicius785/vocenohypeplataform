/** Edição de número inteiro com milhar pt-BR EM TEMPO REAL (puro, testável).
 * Valor bruto = só dígitos ("211111"); exibido = "211.111". O caret é mantido pela contagem de
 * dígitos à esquerda dele, então editar no meio do número continua coerente. */
export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

export function formatThousandsBR(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Posição no texto formatado logo após o `n`-ésimo dígito. */
export function caretAfterDigits(formatted: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) seen++;
    if (seen === n) return i + 1;
  }
  return formatted.length;
}

/** Interpreta o que o input acabou de ter (digitado, colado, apagado): dígitos, texto exibido e
 * onde o caret deve ficar. */
export function applyNumberEdit(
  typed: string,
  caret: number | null,
  maxDigits = 12,
): { digits: string; display: string; caret: number } {
  const head = digitsOnly(typed.slice(0, caret ?? typed.length));
  let digits = digitsOnly(typed).slice(0, maxDigits);
  // Zeros à esquerda removidos podem encurtar a parte antes do caret.
  const before = Math.min(head.length, digits.length);
  const display = formatThousandsBR(digits);
  digits = digits || "";
  return { digits, display, caret: caretAfterDigits(display, before) };
}
