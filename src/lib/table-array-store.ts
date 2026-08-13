import { supabase } from "@/integrations/supabase/client";

export type ArrayStoreTable =
  | "clientes"
  | "projetos"
  | "reunioes"
  | "financeiro_lancamentos"
  | "banco_influenciadores"
  | "marketing_tasks"
  | "metas"
  | "aeo_prompts"
  | "aeo_respostas";

/**
 * Backs a "list of entities" module (clientes, projetos, reunioes, ...) with
 * a real per-row Supabase table instead of a single shared_state row holding
 * the whole array. A stale read racing an unrelated edit can no longer wipe
 * out everyone else's data on overwrite — each entity is its own row,
 * upserted or deleted individually.
 *
 * Keeps the exact same synchronous get/set/subscribe contract the old
 * localStorage-backed stores had, so call sites don't need to change: `init()`
 * is awaited once in `_authenticated/route.tsx`'s `beforeLoad`, before any
 * component using `get()` mounts.
 */
export function createTableArrayStore<T extends { id: string }>(table: ArrayStoreTable) {
  let cache: T[] = [];
  let loaded = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  async function init(): Promise<void> {
    if (loaded) return;
    try {
      const { data, error } = await supabase
        .from(table)
        .select("data")
        .order("created_at", { ascending: true });
      if (error) throw error;
      cache = (data ?? []).map((row) => row.data as T);
    } catch (e) {
      console.warn(`[${table}] initial load failed`, e);
    } finally {
      loaded = true;
      emit();
    }
  }

  let channel: ReturnType<typeof supabase.channel> | null = null;
  function subscribeRealtime() {
    if (channel) return;
    channel = supabase
      .channel(`rt-${table}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as { id?: string } | null;
          if (!old?.id) return;
          cache = cache.filter((x) => x.id !== old.id);
        } else {
          const row = payload.new as { data?: T } | null;
          if (!row?.data) return;
          const item = row.data;
          const idx = cache.findIndex((x) => x.id === item.id);
          cache = idx >= 0 ? cache.map((x, i) => (i === idx ? item : x)) : [...cache, item];
        }
        emit();
      })
      .subscribe();
  }

  return {
    get: () => cache,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    set: (updater: (prev: T[]) => T[], onError?: (err: Error) => void) => {
      const prev = cache;
      const next = updater(prev);
      if (next === prev) return;
      const prevById = new Map(prev.map((x) => [x.id, x]));
      const nextIds = new Set(next.map((x) => x.id));
      cache = next;
      emit();
      for (const item of next) {
        if (prevById.get(item.id) !== item) {
          // Supabase's query builder is a lazy thenable — the fetch only
          // fires once `.then()`/`await` runs on it, so a bare `void
          // builder` (no .then/.catch) silently never sends the request.
          supabase
            .from(table)
            .upsert({ id: item.id, data: item, updated_at: new Date().toISOString() })
            .then(({ error }) => {
              if (!error) return;
              console.warn(`[${table}] upsert failed`, error);
              // A optimistic update aplicada acima nunca era desfeita se o
              // upsert falhasse (RLS, rede, etc.) — o item ficava "salvo"
              // na tela mas nunca chegava no banco, então sumia de novo
              // silenciosamente na próxima vez que a página recarregasse.
              // Reverte pro valor anterior (ou remove, se era um item novo)
              // e avisa quem chamou, em vez de deixar a UI mentir.
              const old = prevById.get(item.id);
              cache = old
                ? cache.map((x) => (x.id === item.id ? old : x))
                : cache.filter((x) => x.id !== item.id);
              emit();
              onError?.(new Error(error.message));
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
              // Só um `error` de verdade (RLS negando, rede, etc.) é uma
              // falha. "0 linhas afetadas" SEM erro não é: DELETE é
              // idempotente — significa que a linha já não existia mais
              // (ex.: outro clique/aba/usuário já apagou ela antes). Tratar
              // isso como falha e "ressuscitar" o item na tela criava um
              // ciclo: reverte -> item reaparece -> usuário clica de novo
              // (já que sumiu e voltou) -> acha "0 linhas" nesse id de novo
              // (porque já tinha sido apagado da primeira vez) -> reverte de
              // novo — um item que já estava corretamente apagado no banco
              // nunca ficava apagado na tela.
              if (!error) return;
              console.warn(`[${table}] delete failed`, error);
              const old = prevById.get(id)!;
              if (!cache.some((x) => x.id === id)) {
                cache = [...cache, old];
                emit();
              }
              onError?.(new Error(error.message));
            });
        }
      }
    },
    init,
    subscribeRealtime,
  };
}
