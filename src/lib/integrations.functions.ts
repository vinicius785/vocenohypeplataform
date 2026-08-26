import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

export async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem gerenciar integrações.");
}

function randomSecret(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

/**
 * The "leads" incoming-webhook secret lives in `webhook_settings`, a table
 * with zero grants to authenticated/anon — only the service-role client used
 * here (admin-gated) and the public route handler (src/routes/api/public/leads.ts,
 * also service-role) can ever read or write it.
 */
export const getLeadsWebhookConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error } = await supabaseAdmin
      .from("webhook_settings")
      .select("secret")
      .eq("key", "leads")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (existing) return { secret: existing.secret };

    const secret = randomSecret();
    const { error: insertError } = await supabaseAdmin
      .from("webhook_settings")
      .insert({ key: "leads", secret });
    if (insertError) throw new Error(insertError.message);
    return { secret };
  });

export const regenerateLeadsWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const secret = randomSecret();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("webhook_settings")
      .upsert({ key: "leads", secret, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { secret };
  });

/**
 * Outgoing webhooks (Zapier/Make-style): admins point the platform at an
 * external URL and pick which events should POST there. RLS on
 * `outgoing_webhooks` is admin-only, so these CRUD functions just use the
 * request-scoped `context.supabase` client — RLS itself is the guard.
 */
export const listOutgoingWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("outgoing_webhooks")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const createWebhookInput = z.object({
  url: z.string().trim().url().max(2000),
  events: z.array(z.string()).min(1),
});

export const createOutgoingWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => createWebhookInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: inserted, error } = await context.supabase
      .from("outgoing_webhooks")
      .insert({ url: data.url, events: data.events, created_by: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

const toggleWebhookInput = z.object({ id: z.string(), active: z.boolean() });

export const toggleOutgoingWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => toggleWebhookInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("outgoing_webhooks")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteOutgoingWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("outgoing_webhooks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
