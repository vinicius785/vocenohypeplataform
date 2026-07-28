/**
 * Shared state sync: mirrors selected localStorage keys into the
 * public.shared_state table so every authenticated user sees the same
 * clientes / campanhas / projetos / tarefas / reuniões / financeiro /
 * influenciadores data, with real-time updates via Supabase Realtime.
 *
 * Zero-touch for existing components: we monkey-patch localStorage and
 * re-emit "storage" events, so any component reading these keys or
 * listening for storage changes stays in sync automatically.
 */
import { supabase } from "@/integrations/supabase/client";

const EXACT_KEYS = new Set<string>([
  "comercial:stages",
  "reunioes:disponibilidade",
  "financeiro:pagos",
  "config:senhas",
  "config:senhas:salt",
]);
const PREFIXES: string[] = ["campanha:docs:", "projeto:influs:"];

function isSyncedKey(k: string): boolean {
  return EXACT_KEYS.has(k) || PREFIXES.some((p) => k.startsWith(p));
}

const applyingRemote = new Set<string>();
const pendingWrites = new Map<string, number>();

let origSet: typeof localStorage.setItem | null = null;
let origRemove: typeof localStorage.removeItem | null = null;

function scheduleUpsert(key: string, value: string) {
  const prev = pendingWrites.get(key);
  if (prev) clearTimeout(prev);
  const t = window.setTimeout(async () => {
    pendingWrites.delete(key);
    try {
      const data = JSON.parse(value);
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("shared_state").upsert({
        key,
        data,
        updated_by: userRes.user?.id ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (e) {
      console.warn("[shared-sync] upsert failed", key, e);
    }
  }, 300);
  pendingWrites.set(key, t);
}

function fireExtraEvents(key: string) {
  window.dispatchEvent(new CustomEvent("shared-state:changed", { detail: { key } }));
  if (key === "marketing:tasks") {
    window.dispatchEvent(new Event("marketing:tasks:changed"));
  }
}

function applyRemote(key: string, newValue: string | null) {
  if (!origSet || !origRemove) return;
  applyingRemote.add(key);
  try {
    if (newValue === null) origRemove(key);
    else origSet(key, newValue);
    window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
    fireExtraEvents(key);
  } finally {
    applyingRemote.delete(key);
  }
}

let initPromise: Promise<void> | null = null;

export function initSharedSync(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (typeof window === "undefined") return;

    origSet = localStorage.setItem.bind(localStorage);
    origRemove = localStorage.removeItem.bind(localStorage);

    localStorage.setItem = (k: string, v: string) => {
      origSet!(k, v);
      if (isSyncedKey(k) && !applyingRemote.has(k)) scheduleUpsert(k, v);
    };
    localStorage.removeItem = (k: string) => {
      origRemove!(k);
      if (isSyncedKey(k) && !applyingRemote.has(k)) {
        // Supabase's query builder only fires once `.then()`/`await` runs on
        // it — a bare `void builder` never sends the request.
        supabase
          .from("shared_state")
          .delete()
          .eq("key", k)
          .then(({ error }) => {
            if (error) console.warn("[shared-sync] delete failed", k, error);
          });
      }
    };

    try {
      const { data, error } = await supabase.from("shared_state").select("key,data");
      if (error) throw error;
      for (const row of data ?? []) {
        if (!isSyncedKey(row.key)) continue;
        applyRemote(row.key, JSON.stringify(row.data));
      }
    } catch (e) {
      console.warn("[shared-sync] initial pull failed", e);
    }

    // A failed/slow realtime handshake should never block the whole app from
    // loading — the initial pull above already has the data; live updates are
    // a nice-to-have on top of it, so this only logs instead of rejecting.
    await new Promise<void>((resolve) => {
      let settled = false;
      const settle = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      supabase
        .channel("shared_state:changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "shared_state" },
          (payload) => {
            const newRow = payload.new as { key?: string; data?: unknown } | null;
            const oldRow = payload.old as { key?: string } | null;
            const key = newRow?.key ?? oldRow?.key;
            if (!key || !isSyncedKey(key)) return;
            if (payload.eventType === "DELETE") {
              applyRemote(key, null);
            } else if (newRow) {
              applyRemote(key, JSON.stringify(newRow.data));
            }
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") settle();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[shared-sync] realtime subscribe failed:", status);
            settle();
          }
        });
    });
  })();
  return initPromise;
}
