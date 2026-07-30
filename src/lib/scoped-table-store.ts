import { supabase } from "@/integrations/supabase/client";

export type ScopedTable =
  | "campanha_influenciadores"
  | "campanha_tarefas"
  | "campanha_documentos"
  | "projeto_influenciadores";

/**
 * Same rationale as table-array-store.ts, but for entities scoped by a
 * parent id (a campanha's influencers/tasks/docs, a projeto's influencers).
 * The whole table is pulled once (small/bounded — one row per influencer,
 * task or doc across the whole workspace) and grouped in memory by parent
 * id, so per-parent reads/writes stay synchronous like the old
 * localStorage-backed code, but persistence is per-row instead of one
 * shared_state blob per parent that a stale read could overwrite whole.
 */
export function createScopedArrayStore<T extends { id: string }>(
  table: ScopedTable,
  parentColumn: string,
) {
  let cache = new Map<string, T[]>();
  let loaded = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  async function fetchAll(): Promise<Map<string, T[]> | null> {
    const { data, error } = await supabase.from(table).select(`data, ${parentColumn}`);
    if (error) throw error;
    const next = new Map<string, T[]>();
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const parentId = row[parentColumn] as string;
      const arr = next.get(parentId) ?? [];
      arr.push(row.data as T);
      next.set(parentId, arr);
    }
    return next;
  }

  async function init(): Promise<void> {
    if (loaded) return;
    try {
      cache = (await fetchAll()) ?? cache;
    } catch (e) {
      console.warn(`[${table}] initial load failed`, e);
    } finally {
      loaded = true;
      emit();
    }
  }

  // Re-busca a tabela inteira e substitui o cache — uma segunda trava além
  // do realtime, pra corrigir qualquer drift que um evento perdido/mal
  // aplicado tenha deixado pra trás (ex: uma linha apagada que ficou de
  // "fantasma" no cache de quem já estava com a aba aberta). Chamado
  // periodicamente por quem inicializa este store.
  async function resync(): Promise<void> {
    try {
      const next = await fetchAll();
      if (next) {
        cache = next;
        emit();
      }
    } catch (e) {
      console.warn(`[${table}] resync failed`, e);
    }
  }

  let channel: ReturnType<typeof supabase.channel> | null = null;
  function subscribeRealtime() {
    if (channel) return;
    channel = supabase
      .channel(`rt-${table}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        const newRow = payload.new as Record<string, unknown> | null;
        const oldRow = payload.old as Record<string, unknown> | null;
        const row = newRow ?? oldRow;
        if (!row) return;
        const parentId = row[parentColumn] as string;
        const arr = cache.get(parentId) ?? [];
        if (payload.eventType === "DELETE") {
          const oldId = oldRow?.id as string | undefined;
          if (!oldId) return;
          cache.set(
            parentId,
            arr.filter((x) => x.id !== oldId),
          );
        } else {
          const item = newRow?.data as T | undefined;
          if (!item) return;
          const idx = arr.findIndex((x) => x.id === item.id);
          cache.set(
            parentId,
            idx >= 0 ? arr.map((x, i) => (i === idx ? item : x)) : [...arr, item],
          );
        }
        emit();
      })
      .subscribe();
  }

  return {
    get: (parentId: string) => cache.get(parentId) ?? [],
    getAll: () => cache,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    set: (parentId: string, updater: (prev: T[]) => T[]) => {
      const prev = cache.get(parentId) ?? [];
      const next = updater(prev);
      if (next === prev) return;
      const prevById = new Map(prev.map((x) => [x.id, x]));
      const nextIds = new Set(next.map((x) => x.id));
      cache.set(parentId, next);
      emit();
      for (const item of next) {
        if (prevById.get(item.id) !== item) {
          supabase
            .from(table)
            .upsert({
              id: item.id,
              [parentColumn]: parentId,
              data: item,
              updated_at: new Date().toISOString(),
            } as never)
            .then(({ error }) => {
              if (error) console.warn(`[${table}] upsert failed`, error);
            });
        }
      }
      for (const id of prevById.keys()) {
        if (!nextIds.has(id)) {
          supabase
            .from(table)
            .delete()
            .eq("id", id)
            .then(({ error }) => {
              if (error) console.warn(`[${table}] delete failed`, error);
            });
        }
      }
    },
    init,
    subscribeRealtime,
    resync,
  };
}
