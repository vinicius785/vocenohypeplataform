/**
 * Estado de UI (só local, sem Supabase) do painel flutuante global do
 * Hypito — aberto/minimizado, pra sobreviver à navegação entre seções
 * (pedido do upgrade do Hypito: "o painel permanece disponível durante a
 * navegação"). Mesmo padrão pub-sub simples de `release-seen-store.ts`.
 * A CONVERSA em si nunca vive aqui — continua sendo a mesma DM já
 * sincronizada por `chat-store.ts`; isto só lembra se o painel deve
 * aparecer aberto ou minimizado ao remontar `AppShell`.
 */
let open = false;
let minimized = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeHypitoWidget(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function isHypitoWidgetOpen(): boolean {
  return open;
}
export function isHypitoWidgetMinimized(): boolean {
  return minimized;
}

export function openHypitoWidget(): void {
  open = true;
  minimized = false;
  emit();
}
export function closeHypitoWidget(): void {
  open = false;
  emit();
}
export function minimizeHypitoWidget(): void {
  minimized = true;
  emit();
}
export function toggleHypitoWidget(): void {
  if (open && !minimized) {
    minimized = true;
  } else {
    open = true;
    minimized = false;
  }
  emit();
}
