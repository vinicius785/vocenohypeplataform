/**
 * Estado "lida"/"não lida" por notificação — deliberadamente só
 * `localStorage` (conveniência por navegador, nunca compartilhado entre
 * dispositivos/usuários). Não existe hoje nenhuma tabela de notificações
 * persistida no backend (confirmado na auditoria da V2) — inventar uma
 * aqui seria fingir uma garantia que não existe. Quando um sistema real de
 * notificações for construído, isto deve ser substituído por leitura/
 * escrita no servidor.
 */
const KEY = "portal-v2:read-notifications";

function readSet(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSet(set: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export function isRead(id: string): boolean {
  return readSet().has(id);
}

export function markRead(id: string) {
  const set = readSet();
  set.add(id);
  writeSet(set);
}

export function markAllRead(ids: string[]) {
  const set = readSet();
  for (const id of ids) set.add(id);
  writeSet(set);
}
