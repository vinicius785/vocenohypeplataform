/**
 * Classes de input/select compartilhadas — extraídas de
 * `ClientCampaignToolbar.tsx` (fonte da verdade): borda `input` (não
 * `border`), fundo `background` (não `card`), anel de foco `brand` (não
 * `ring`). Relatórios/Arquivos usavam `border-border`/`bg-card`/
 * `focus-visible:ring-ring` — mesma altura, mas tom/foco diferentes do
 * resto do Portal V2. Qualquer filtro novo deve usar esta constante,
 * nunca reescrever as classes na mão.
 */
export const portalFieldBase =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand";
