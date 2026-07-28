/**
 * Shared helper for retrying TanStack Start server-fn calls that fail with a
 * raw "Failed to fetch" — a transient network blip where the request never
 * even reached the server, so retrying is always safe (nothing was applied
 * server-side yet). Any other error (validation, auth, business logic) is
 * rethrown immediately since retrying wouldn't change the outcome.
 */
export function isNetworkBlip(e: unknown): boolean {
  return e instanceof Error && e.message === "Failed to fetch";
}

export function friendlyNetworkError(e: unknown, fallback: string): string {
  if (isNetworkBlip(e))
    return "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.";
  return e instanceof Error ? e.message : fallback;
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isNetworkBlip(e) || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, Math.min((i + 1) * 600, 3000)));
    }
  }
  throw new Error("unreachable");
}
