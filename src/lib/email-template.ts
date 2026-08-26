/**
 * Renderiza um template de e-mail substituindo tokens `{{chave}}` pelos
 * valores da entidade (lead/cliente/influenciador). Puro, sem I/O — usado
 * tanto no envio de verdade (rota do cron) quanto na prévia do editor de
 * template (client-side).
 */
export function renderEmailTemplate(
  html: string,
  vars: Record<string, string | undefined>,
): string {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}
