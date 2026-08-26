/**
 * Storage genérico baseado em IndexedDB (com espelho em localStorage),
 * originalmente criado pra sessão de login (Supabase) — mitigação pra apps
 * instalados no iPhone (PWA "Adicionar à Tela de Início") deslogarem ao
 * serem fechados de vez e reabertos. É um comportamento conhecido do
 * WebKit/iOS com apps standalone: o localStorage do app às vezes não é
 * gravado em disco a tempo antes do processo ser encerrado. IndexedDB tende
 * a ser mais confiável nesse cenário (é a mitigação mais citada por quem
 * enfrenta esse mesmo bug em PWAs no iOS). Não é garantia absoluta — é uma
 * limitação do sistema operacional, não algo 100% controlável pelo código
 * do app.
 *
 * A interface é uma KV store qualquer (não amarrada a auth) — reaproveitada
 * também pra outros dados que precisam sobreviver o app sendo fechado no
 * meio (ex: quais notificações do sino já foram marcadas como lidas, que
 * sem isso "voltavam" a aparecer depois de fechar/reabrir o PWA no iPhone,
 * mesmo já tendo sido gravadas em localStorage segundos antes).
 */
const DB_NAME = "vnh-auth";
const STORE_NAME = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const req = fn(tx.objectStore(STORE_NAME));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export const idbAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await withStore<string | undefined>("readonly", (s) => s.get(key));
      if (value !== undefined) return value;
    } catch {
      /* cai para localStorage abaixo */
    }
    // Nada no IndexedDB ainda — cobre tanto uma sessão já existente em
    // localStorage (de antes desta mudança) quanto o IndexedDB ter falhado.
    const fallback = localStorage.getItem(key);
    if (fallback !== null) void this.setItem(key, fallback);
    return fallback;
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await withStore("readwrite", (s) => s.put(value, key));
    } catch {
      /* melhor esforço */
    }
    // Espelha em localStorage também — cobre o caso de IndexedDB falhar por
    // qualquer motivo (modo privado, cota, etc), sem piorar o cenário atual.
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await withStore("readwrite", (s) => s.delete(key));
    } catch {
      /* melhor esforço */
    }
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
