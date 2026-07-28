import { useEffect } from "react";

/**
 * Re-runs `reload` whenever a `storage` event fires for a matching key —
 * including the synthetic events `shared-sync.ts` dispatches when a
 * teammate's change arrives from Supabase. Several sections only ever read
 * their localStorage-backed data once on mount, so an open tab never
 * reflects a change made elsewhere until the page is reloaded; this hook
 * closes that gap with a couple of lines instead of hand-rolling the same
 * listener in every component.
 */
export function useStorageSync(
  match: string | string[] | ((key: string) => boolean),
  reload: () => void,
) {
  useEffect(() => {
    const matches =
      typeof match === "function"
        ? match
        : Array.isArray(match)
          ? (k: string) => match.includes(k)
          : (k: string) => k === match;
    const onStorage = (e: StorageEvent) => {
      if (e.key != null && matches(e.key)) reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(match) ? match.join(",") : match, reload]);
}
