/** Comparador de ordenação puro do `DataTable` novo — separado do
 * componente pra ser testável sem DOM (ver nota em `design-system-utils.ts`
 * sobre a limitação de ambiente de teste desta etapa). */

export type SortDirection = "asc" | "desc";

/** Compara dois valores de forma estável: string (localeCompare pt-BR),
 * número, ou data (`Date`/ISO string `YYYY-MM-DD`) — nunca `NaN`/`undefined`
 * quebrando a ordenação (valores ausentes sempre vão pro fim,
 * independente da direção). */
export function compareValues(a: unknown, b: unknown, direction: SortDirection): number {
  const aNil = a == null || a === "";
  const bNil = b == null || b === "";
  if (aNil && bNil) return 0;
  if (aNil) return 1;
  if (bNil) return -1;

  let result: number;
  if (typeof a === "number" && typeof b === "number") {
    result = a - b;
  } else if (a instanceof Date && b instanceof Date) {
    result = a.getTime() - b.getTime();
  } else {
    result = String(a).localeCompare(String(b), "pt-BR", { numeric: true });
  }
  return direction === "asc" ? result : -result;
}

export function sortRows<T>(
  rows: T[],
  getValue: (row: T) => unknown,
  direction: SortDirection,
): T[] {
  return [...rows].sort((a, b) => compareValues(getValue(a), getValue(b), direction));
}
