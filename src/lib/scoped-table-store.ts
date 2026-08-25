import { supabase } from "@/integrations/supabase/client";

export type ScopedTable =
  | "campanha_influenciadores"
  | "campanha_tarefas"
  | "campanha_documentos"
  | "campanha_cronograma"
  | "projeto_influenciadores"
  | "projeto_tarefas";

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
  // Ids com uma exclusão em andamento (do `set()` já removeu localmente,
  // esperando o DELETE no Supabase confirmar) — `resync()` busca a tabela
  // inteira do zero e SUBSTITUI o cache; se ele cair bem nessa janela
  // (antes do DELETE terminar de verdade no banco), reintroduzia o item
  // apagado de volta na tela por até 20 min (o intervalo do resync), até o
  // próximo ciclo corrigir sozinho — exatamente o "apago e ele volta depois
  // de um tempo" relatado. `resync()` ignora qualquer id aqui dentro.
  const pendingDeletes = new Set<string>();

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
        if (pendingDeletes.size > 0) {
          for (const [parentId, arr] of next) {
            if (arr.some((x) => pendingDeletes.has(x.id))) {
              next.set(
                parentId,
                arr.filter((x) => !pendingDeletes.has(x.id)),
              );
            }
          }
        }
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
      const rollbackDelete = (pId: string, id: string) => {
        const removed = prevById.get(id);
        if (!removed) return;
        const current = cache.get(pId) ?? [];
        if (!current.some((x) => x.id === id)) {
          cache.set(pId, [...current, removed]);
          emit();
        }
      };
      for (const item of next) {
        // Comparação por VALOR, não por referência: `normalizeInflus` (e
        // funções análogas) recriam um objeto novo do zero em TODO item a
        // cada leitura, mesmo quando nada mudou de verdade — comparar só
        // `!==` fazia CADA save reenviar a campanha inteira pro Supabase
        // (visto ao vivo nos logs: uma exclusão de 1 influenciador
        // disparando ~15 upserts simultâneos dos outros, todos "iguais").
        // Pior: uma aba desatualizada que ainda tem localmente um
        // influenciador já excluído em outra aba acaba "ressuscitando"
        // ele de volta no próximo save de qualquer outro campo — dava
        // exatamente a sensação de "não dá pra excluir, ele volta
        // sozinho". Só reenvia quem realmente mudou de conteúdo.
        const prevItem = prevById.get(item.id);
        if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
          // `getSession()` primeiro: se o token de sessão expirou (comum em
          // abas que ficam abertas o dia todo — o refresh automático do
          // supabase-js roda num timer que o browser pode ter throttled
          // enquanto a aba estava em segundo plano), isso força o refresh
          // ANTES da escrita, em vez de mandar a requisição com um JWT
          // vencido e RLS recusar silenciosamente (0 linhas, sem erro).
          void supabase.auth.getSession().then(() =>
            supabase
              .from(table)
              .upsert({
                id: item.id,
                [parentColumn]: parentId,
                data: item,
                updated_at: new Date().toISOString(),
              } as never)
              .select("id")
              .then(({ data, error }) => {
                if (!error && (data?.length ?? 0) > 0) return;
                console.warn(`[${table}] upsert failed`, error ?? "0 rows affected (RLS?)");
                void import("sonner").then(({ toast }) => {
                  toast.error("Não foi possível salvar", {
                    description:
                      error?.message ||
                      "Você pode não ter permissão pra essa ação, ou sua sessão expirou — atualize a página e tente de novo.",
                  });
                });
              }),
          );
        }
      }
      for (const id of prevById.keys()) {
        if (!nextIds.has(id)) {
          pendingDeletes.add(id);
          void supabase.auth
            .getSession()
            .then(() =>
              supabase
                .from(table)
                .delete()
                .eq("id", id)
                // `.select("id")` é o único jeito de saber se a exclusão pegou
                // alguma linha: RLS bloqueando não gera `error` nenhum — o
                // Postgrest responde 200 com 0 linhas afetadas, então sem isso
                // essa falha passava batido, o item continuava no banco, e
                // reaparecia sozinho no próximo resync/realtime (sumia e voltava
                // sem explicação nenhuma).
                .select("id")
                .then(async ({ data, error }) => {
                  if (!error && (data?.length ?? 0) > 0) return;
                  if (error) {
                    console.warn(`[${table}] delete failed`, error);
                    rollbackDelete(parentId, id);
                    void import("sonner").then(({ toast }) => {
                      toast.error("Não foi possível excluir", {
                        description:
                          error.message ||
                          "Você pode não ter permissão pra essa ação, ou sua sessão expirou — atualize a página e tente de novo.",
                      });
                    });
                    return;
                  }
                  // 0 linhas sem erro nenhum é ambíguo — pode ser RLS
                  // bloqueando (precisa restaurar o item local e avisar) OU
                  // a linha já não existir mais no banco (delete anterior já
                  // tinha funcionado, isso aqui é só um retry/eco de estado
                  // local desatualizado — nesse caso NÃO restaurar, senão o
                  // item nunca sai da tela, mesmo já estando excluído de
                  // verdade: "excluo, confirmo, e ele volta sozinho" pra
                  // sempre). Um SELECT rápido desempata os dois casos.
                  const { data: stillThere } = await supabase
                    .from(table)
                    .select("id")
                    .eq("id", id)
                    .maybeSingle();
                  if (!stillThere) return;
                  console.warn(`[${table}] delete failed`, "0 rows affected (RLS?)");
                  rollbackDelete(parentId, id);
                  void import("sonner").then(({ toast }) => {
                    toast.error("Não foi possível excluir", {
                      description:
                        "Você pode não ter permissão pra essa ação, ou sua sessão expirou — atualize a página e tente de novo.",
                    });
                  });
                }),
            )
            .finally(() => pendingDeletes.delete(id));
        }
      }
    },
    init,
    subscribeRealtime,
    resync,
  };
}
