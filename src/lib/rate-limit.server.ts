/**
 * Piece C of the 2026-09-18 security pass (see CLAUDE.md): plain-Postgres
 * rate limiting via `rate_limit_events` (migration
 * `20260918200000_rate_limit_events.sql`). No external dependency — the
 * project's `bunfig.toml` enforces a 24h supply-chain guard that a new
 * Redis/Upstash-style package would fail, and this is explicitly scoped as
 * an anti-abuse floor, not a strict/precise limiter.
 *
 * `.server.ts` naming keeps this out of the client bundle (see CLAUDE.md,
 * "Server functions" section) — it uses the service-role client directly,
 * so it must never be imported from a `*.functions.ts` file at the top
 * level of anything that ships client-side; only import it inside a
 * server function's handler (dynamic or static import is fine there since
 * `*.functions.ts` files' handlers run server-side only, but this file
 * itself must stay `.server.ts` so bundling analysis never pulls the
 * service-role client into the client chunk).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Records one attempt for `bucket` and returns whether it's still within
 * the allowed rate. Fails OPEN (returns `true`, i.e. allowed) on any
 * database error — a rate limiter outage must never itself become a login
 * outage for the whole team, which is exactly the kind of incident this
 * project already had once with RLS (see CLAUDE.md's incident note).
 */
export async function checkRateLimit(
  bucket: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { error: insertError } = await supabaseAdmin.from("rate_limit_events").insert({ bucket });
    if (insertError) {
      console.error("[rate-limit] falha ao registrar tentativa", bucket, insertError.message);
      return true;
    }

    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const { count, error: countError } = await supabaseAdmin
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("bucket", bucket)
      .gte("created_at", since);
    if (countError) {
      console.error("[rate-limit] falha ao contar tentativas", bucket, countError.message);
      return true;
    }

    return (count ?? 0) <= maxAttempts;
  } catch (e) {
    console.error("[rate-limit] erro inesperado", bucket, e);
    return true;
  }
}

/** Normalizes an email into a rate-limit bucket key. Lowercased/trimmed so
 * `Foo@Bar.com` and `foo@bar.com` share a bucket. Bucketing by email (not
 * IP) is a deliberate simplification — see CLAUDE.md piece C: TanStack
 * Start's `getRequest()` doesn't reliably expose a trustworthy client IP
 * in this deployment (proxy-dependent header, easily spoofed without a
 * fixed trusted-proxy chain configured), so email-based bucketing is the
 * safer default here to avoid trusting a spoofable header. */
export function emailBucket(prefix: string, email: string): string {
  return `${prefix}:${email.trim().toLowerCase()}`;
}
