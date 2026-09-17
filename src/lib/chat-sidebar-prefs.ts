/**
 * Grupos recolhidos da barra lateral do Chat (pedido: "salvar os grupos
 * recolhidos no localStorage") — só estado de UI local, nunca sincronizado
 * entre dispositivos (mesmo espírito de `hypito-widget-store.ts`). O
 * Hypito nunca entra aqui — é sempre 1 item fixo, nunca um grupo
 * recolhível.
 */
const KEY = "chat:sidebar-collapsed-groups";

export type ChatSidebarGroup = "diretas" | "canais" | "campanhas" | "projetos";

function read(): Set<ChatSidebarGroup> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as ChatSidebarGroup[]);
  } catch {
    return new Set();
  }
}

function write(groups: Set<ChatSidebarGroup>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...groups]));
  } catch {
    /* localStorage indisponível — não é crítico */
  }
}

export function isChatSidebarGroupCollapsed(group: ChatSidebarGroup): boolean {
  return read().has(group);
}

export function toggleChatSidebarGroup(group: ChatSidebarGroup): boolean {
  const groups = read();
  const nowCollapsed = !groups.has(group);
  if (nowCollapsed) groups.add(group);
  else groups.delete(group);
  write(groups);
  return nowCollapsed;
}
