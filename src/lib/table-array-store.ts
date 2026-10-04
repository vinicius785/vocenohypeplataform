import { supabase } from "@/integrations/supabase/client";

export type ArrayStoreTable =
  | "clientes"
  | "projetos"
  | "reunioes"
  | "reunioes_disponibilidade"
  | "financeiro_lancamentos"
  | "banco_influenciadores"
  | "marketing_tasks"
  | "marketing_standalone_tasks"
  | "comercial_tarefas"
  | "task_tags"
  | "metas"
  | "aeo_prompts"
  | "aeo_respostas"
  | "aeo_rodadas";

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
export function createTableArrayStore<T extends { id: string }>(
  table: ArrayStoreTable,
  options: {
    /**
     * Itens que existem no banco e no cache, mas NÃO aparecem em `get()` (hoje: a Demo,
     * `clientes.data.demoSessionId`). Regras:
     *  - `get()` devolve só os visíveis; `getAll()` devolve tudo;
     *  - o `updater` de `set()` continua recebendo a lista COMPLETA (editar o item oculto
     *    pelo seu detalhe funciona, e `prev.map(...)` preserva as linhas ocultas);
     *  - `set()` NUNCA apaga item oculto: se o `updater` devolver uma lista sem ele (por ex.
     *    construída a partir de `get()`), a linha é preservada — o banco não perde dado.
     * Sem `isHidden` o comportamento é exatamente o de antes.
     */
    isHidden?: (item: T) => boolean;
  } = {},
) {
  const { isHidden } = options;
  let cache: T[] = [];
  // Visão sem os itens ocultos, memoizada pela REFERÊNCIA do cache (todo update do cache cria
  // um array novo): `useSyncExternalStore` exige snapshot estável entre mudanças.
  let visibleSource: T[] | null = null;
  let visibleCache: T[] = [];
  function getVisible(): T[] {
    if (!isHidden) return cache;
    if (visibleSource !== cache) {
      visibleSource = cache;
      visibleCache = cache.filter((x) => !isHidden(x));
    }
    return visibleCache;
  }
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
    get: getVisible,
    /** Lista COMPLETA, inclusive itens ocultos (`options.isHidden`). */
    getAll: () => cache,
    isLoaded: () => loaded,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /**
     * Merges one row into the local cache WITHOUT writing to Supabase —
     * for call sites that already persisted the row themselves via a
     * dedicated server function (e.g. `createClienteComOrganizacao`, which
     * also has to write a NOT NULL column — `clientes.organization_id` —
     * that this generic store never sends). Using `set()` for this would
     * re-trigger its own upsert (missing that column) and fail again, or
     * double-write. The realtime subscription would eventually merge the
     * row too, but this makes it appear immediately.
     */
    hydrateOne: (item: T) => {
      const idx = cache.findIndex((x) => x.id === item.id);
      cache = idx >= 0 ? cache.map((x, i) => (i === idx ? item : x)) : [...cache, item];
      emit();
    },
    set: (updater: (prev: T[]) => T[], onError?: (err: Error) => void) => {
      const prev = cache;
      const updated = updater(prev);
      if (updated === prev) return;
      // Itens ocultos que o `updater` deixou de fora são PRESERVADOS (nunca apagados daqui).
      let next = updated;
      if (isHidden) {
        const keptIds = new Set(updated.map((x) => x.id));
        const preserved = prev.filter((x) => isHidden(x) && !keptIds.has(x.id));
        if (preserved.length > 0) next = [...updated, ...preserved];
      }
      const prevById = new Map(prev.map((x) => [x.id, x]));
      const nextIds = new Set(next.map((x) => x.id));
      cache = next;
      emit();
      for (const item of next) {
        // Comparação por VALOR, não por referência — ver o mesmo fix e
        // motivo em scoped-table-store.ts (`normalizeInflus`-like reads
        // recriam objetos novos em toda leitura mesmo sem mudança real,
        // então `!==` fazia todo save reenviar itens que não mudaram).
        const prevItem = prevById.get(item.id);
        if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
          // `getSession()` primeiro: se o token de sessão expirou (comum em
          // abas que ficam abertas o dia todo — o refresh automático do
          // supabase-js roda num timer que o browser pode ter throttled
          // enquanto a aba estava em segundo plano), isso força o refresh
          // ANTES da escrita, em vez de mandar a requisição com um JWT
          // vencido e RLS recusar silenciosamente (0 linhas, sem erro).
          //
          // Update (não upsert) quando o item já existia localmente: um
          // `INSERT ... ON CONFLICT DO UPDATE` valida constraints NOT NULL
          // da linha proposta ANTES de resolver o conflito — colunas que
          // este store nunca envia (ex.: `clientes.organization_id`,
          // adicionada em 2026-09-18 como NOT NULL) fazem toda EDIÇÃO de um
          // registro já existente falhar com "null value ... violates
          // not-null constraint", mesmo a linha já tendo um valor válido
          // ali (bug real, encontrado em produção: nenhuma edição de
          // cliente/campanha salvava desde aquela migração). Um `UPDATE`
          // de verdade só toca as colunas listadas, então nunca dispara
          // essa validação em colunas que não estamos mudando. Itens
          // realmente novos (sem `prevItem`) continuam via `upsert` — para
          // tabelas com uma coluna NOT NULL adicional não coberta aqui
          // (hoje, só `clientes.organization_id`), CRIAR continua exigindo
          // o fluxo dedicado ainda não construído (ver comentário na
          // migração `20260918160000`: "dedicated server functions in
          // phase 2, not raw RLS UPDATE") — não é regressão desta correção.
          void supabase.auth.getSession().then(() =>
            (prevItem
              ? supabase
                  .from(table)
                  .update({ data: item, updated_at: new Date().toISOString() })
                  .eq("id", item.id)
              : supabase
                  .from(table)
                  .upsert({ id: item.id, data: item, updated_at: new Date().toISOString() })
            )
              // `.select("id")` é o único jeito de saber se a escrita pegou
              // alguma linha: RLS bloqueando não gera `error` nenhum — o
              // Postgrest responde 200 com 0 linhas afetadas.
              .select("id")
              .then(({ data, error }) => {
                if (!error && (data?.length ?? 0) > 0) return;
                console.warn(`[${table}] upsert failed`, error ?? "0 rows affected (RLS?)");
                // A optimistic update aplicada acima nunca era desfeita se o
                // upsert falhasse (RLS, sessão expirada, rede, etc.) — o
                // item ficava "salvo" na tela mas nunca chegava no banco,
                // então sumia de novo silenciosamente na próxima vez que a
                // página recarregasse. Reverte pro valor anterior (ou
                // remove, se era um item novo) e avisa quem chamou.
                const old = prevById.get(item.id);
                cache = old
                  ? cache.map((x) => (x.id === item.id ? old : x))
                  : cache.filter((x) => x.id !== item.id);
                emit();
                const message =
                  error?.message ||
                  "Você pode não ter permissão pra essa ação, ou sua sessão expirou — atualize a página e tente de novo.";
                onError?.(new Error(message));
                void import("sonner").then(({ toast }) =>
                  toast.error("Não foi possível salvar", { description: message }),
                );
              }),
          );
        }
      }
      for (const id of prevById.keys()) {
        if (!nextIds.has(id)) {
          void supabase.auth.getSession().then(() =>
            supabase
              .from(table)
              .delete()
              .eq("id", id)
              // `.select("id")` é o único jeito de saber se a exclusão
              // pegou alguma linha: RLS bloqueando não gera `error`
              // nenhum — o Postgrest responde 200 com 0 linhas afetadas,
              // então sem isso essa falha passava batido, o item
              // continuava no banco e reaparecia sozinho no próximo
              // realtime/reload da página.
              .select("id")
              .then(async ({ data, error }) => {
                if (!error && (data?.length ?? 0) > 0) return;
                if (error) {
                  console.warn(`[${table}] delete failed`, error);
                  const old = prevById.get(id)!;
                  if (!cache.some((x) => x.id === id)) {
                    cache = [...cache, old];
                    emit();
                  }
                  onError?.(new Error(error.message));
                  void import("sonner").then(({ toast }) =>
                    toast.error("Não foi possível excluir", { description: error.message }),
                  );
                  return;
                }
                // 0 linhas sem erro nenhum é ambíguo — pode ser RLS
                // bloqueando (precisa restaurar o item local e avisar) OU
                // a linha já não existir mais no banco (delete anterior
                // já tinha funcionado, isso aqui é só um retry/eco de
                // estado local desatualizado — nesse caso NÃO restaurar,
                // senão o item nunca sai da tela mesmo já estando
                // excluído de verdade: "excluo, confirmo, e ele volta
                // sozinho" pra sempre). Um SELECT rápido desempata os
                // dois casos.
                const { data: stillThere } = await supabase
                  .from(table)
                  .select("id")
                  .eq("id", id)
                  .maybeSingle();
                if (!stillThere) return;
                console.warn(`[${table}] delete failed`, "0 rows affected (RLS?)");
                const old = prevById.get(id)!;
                if (!cache.some((x) => x.id === id)) {
                  cache = [...cache, old];
                  emit();
                }
                const message =
                  "Você pode não ter permissão pra essa ação, ou sua sessão expirou — atualize a página e tente de novo.";
                onError?.(new Error(message));
                void import("sonner").then(({ toast }) =>
                  toast.error("Não foi possível excluir", { description: message }),
                );
              }),
          );
        }
      }
    },
    init,
    subscribeRealtime,
  };
}
