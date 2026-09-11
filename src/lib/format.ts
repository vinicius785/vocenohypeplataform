export function formatSeguidores(value?: string): string {
  if (!value) return "";
  const n = Number(value.replace(/\D/g, ""));
  if (!n) return "";
  return n.toLocaleString("pt-BR");
}

/** Formatação compacta pt-BR ("878,8 mil", "2,9 milhões") — só para
 * DISPLAY (cabeçalho, resumos de métrica). O valor persistido/editável
 * nunca passa por aqui, sempre pelo `formatSeguidores`/valor bruto acima,
 * pra nunca perder precisão num campo editável. */
export function formatCompactSeguidores(value?: string): string {
  if (!value) return "";
  const n = Number(value.replace(/\D/g, ""));
  if (!n) return "";
  return new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "long" }).format(n);
}

export function formatCompactNumber(n?: number): string {
  if (n == null || Number.isNaN(n)) return "";
  return new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "long" }).format(n);
}

/** `%` com vírgula decimal pt-BR, uma casa — nunca confundir com o valor
 * decimal bruto (0.048 vs 4,8%): quem chama já deve passar o número já
 * na escala de porcentagem (ex: 4.8, não 0.048). */
export function formatPercentBR(n?: number): string {
  if (n == null || Number.isNaN(n)) return "";
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
