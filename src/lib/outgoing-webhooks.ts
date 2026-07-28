/**
 * Fires configured outgoing webhooks (see `outgoing_webhooks` table /
 * Configurações > Integrações) for a platform event. Always goes through the
 * service-role client — the user who triggers an event isn't necessarily an
 * admin, and only admins can read/manage the webhook list (RLS). Best-effort:
 * failures are logged, never thrown, so a broken external endpoint can't
 * break the action that triggered it (e.g. saving a lead).
 */
export const OUTGOING_WEBHOOK_EVENTS = [
  { key: "lead.created", label: "Novo lead" },
  { key: "lead.won", label: "Lead ganho" },
  { key: "blog.published", label: "Artigo do blog publicado" },
] as const;
export type OutgoingWebhookEvent = (typeof OUTGOING_WEBHOOK_EVENTS)[number]["key"];

export async function dispatchOutgoingWebhook(
  event: OutgoingWebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: hooks, error } = await supabaseAdmin
      .from("outgoing_webhooks")
      .select("url, events")
      .eq("active", true);
    if (error || !hooks) return;

    const targets = hooks.filter(
      (h) => Array.isArray(h.events) && (h.events as string[]).includes(event),
    );
    await Promise.allSettled(
      targets.map((h) =>
        fetch(h.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() }),
        }),
      ),
    );
  } catch (err) {
    console.error("[outgoing-webhooks] dispatch failed", err);
  }
}
