/** Lógica pura usada pelos componentes novos da Etapa 2 — separada em
 * funções testáveis porque o projeto não tem ambiente de teste com DOM
 * (`vitest.config.ts` usa `environment: "node"`, sem jsdom/testing-library
 * instalados) — só é possível testar funções puras nesta etapa. */

export type MetricDelta = { value: number; label?: string } | null | undefined;

/** Formata a variação do `MetricCard` — nunca inventa "0%" quando não há
 * comparação (delta `null`/`undefined`): retorna `null` pra o componente
 * decidir não renderizar nada. */
export function formatMetricDelta(
  delta: MetricDelta,
): { text: string; direction: "up" | "down" | "flat" } | null {
  if (delta == null) return null;
  const direction = delta.value > 0 ? "up" : delta.value < 0 ? "down" : "flat";
  const sign = delta.value > 0 ? "+" : "";
  const text = `${sign}${delta.value.toFixed(0)}%${delta.label ? ` ${delta.label}` : ""}`;
  return { text, direction };
}

/** `SegmentedControl` nunca deve ficar num estado inconsistente se o
 * `value` controlado não corresponder a nenhuma opção (ex.: dado
 * carregado de fora, typo) — cai pro primeiro valor válido em vez de não
 * marcar nada como ativo. */
export function resolveSegmentedValue<T extends string>(value: T, options: readonly T[]): T {
  return options.includes(value) ? value : options[0];
}
