/** Nº máximo de cards visíveis por coluna nos Kanbans do Comercial. */
export const KANBAN_COLUMN_LIMIT = 4;

/** Divide os itens de uma coluna em "visíveis" (até `limit`) e quantos ficam
 * para o "Ver mais". Nada é descartado: `visible + hidden === items.length`. */
export function splitColumn<T>(items: T[], limit = KANBAN_COLUMN_LIMIT) {
  return { visible: items.slice(0, limit), hiddenCount: Math.max(0, items.length - limit) };
}

/** Vista de UMA coluna com expansão inline: recolhida mostra até `limit`; expandida mostra tudo.
 * `hiddenCount` é só o que ainda está escondido ("Ver mais (N)"); `canCollapse` indica "Ver menos". */
export function columnView<T>(items: T[], limit: number, expanded: boolean) {
  const visible = expanded ? items : items.slice(0, limit);
  return {
    visible,
    hiddenCount: items.length - visible.length,
    canCollapse: expanded && items.length > limit,
  };
}
