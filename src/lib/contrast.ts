/** Contraste WCAG 2.x — fórmula oficial de luminância relativa aplicada a
 * cores sRGB em hex. Usado pela seção de Acessibilidade da página
 * `/design-system` pra calcular os pares de cor ao vivo (não um número
 * fixo digitado à mão) e testável sem DOM (só matemática pura). */

function channelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/** Razão de contraste entre duas cores hex — sempre >= 1, ordem dos
 * argumentos não importa (usa sempre a mais clara sobre a mais escura). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** `large` = texto >=18.66px bold ou >=24px normal, ou componente de UI
 * (ícone/borda de controle) — WCAG aceita 3:1 nesse caso; texto normal
 * exige 4.5:1. */
export function meetsAA(hexA: string, hexB: string, large = false): boolean {
  return contrastRatio(hexA, hexB) >= (large ? 3 : 4.5);
}
