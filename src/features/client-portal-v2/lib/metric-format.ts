const fmt = new Intl.NumberFormat("pt-BR");

export const NOT_INFORMED = "Não informado";

/** Nunca mostra um zero fingindo dado real — `undefined`/`null` viram
 * "Não informado" explicitamente. Extraída como função pura pra ser
 * testável isoladamente (ver `tests/metric-format.test.ts`). */
export function formatMetricValue(value: number | undefined | null, suffix = ""): string {
  if (value === undefined || value === null) return NOT_INFORMED;
  return `${fmt.format(value)}${suffix}`;
}
