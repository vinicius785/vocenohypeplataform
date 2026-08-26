import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/integrations.functions";
import { z } from "zod";
import { EMAIL_AUDIENCES, type EmailFlowStep } from "@/lib/email-flows-constants";

/**
 * Server functions do motor de automação de e-mail. `email_flows`/
 * `email_templates` são geridos só por admin — RLS (FOR ALL USING
 * is_admin()) já é o guarda, então as funções de CRUD abaixo usam
 * `context.supabase` (respeita RLS) sem checagem própria, mesmo padrão
 * de `outgoing_webhooks` em integrations.functions.ts. `email_provider_settings`
 * não tem NENHUMA policy pra authenticated (só service_role) — essas
 * duas funções precisam de `assertAdmin` explícito + `supabaseAdmin`,
 * mesmo padrão do webhook `leads` em integrations.functions.ts.
 */

const stepSchema = z.object({
  templateId: z.string().uuid(),
  waitDays: z.number().int().min(0).max(365),
});

const audienceSchema = z.enum(EMAIL_AUDIENCES);

// ============================================================
// Templates
// ============================================================

export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const templateInput = z.object({
  id: z.string().uuid().optional(),
  audience: audienceSchema,
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(300),
  bodyHtml: z.string(),
});

export const upsertEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => templateInput.parse(raw))
  .handler(async ({ data, context }) => {
    const row = {
      audience: data.audience,
      name: data.name,
      subject: data.subject,
      body_html: data.bodyHtml,
    };
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("email_templates")
        .update(row)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return updated;
    }
    const { data: inserted, error } = await context.supabase
      .from("email_templates")
      .insert({ ...row, created_by: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const deleteEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("email_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Fluxos
// ============================================================

export const listEmailFlows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_flows")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const flowInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  audience: audienceSchema,
  triggerType: z.string().min(1),
  triggerConfig: z.record(z.string(), z.string()).default({}),
  steps: z.array(stepSchema).min(1),
  active: z.boolean(),
});

export const upsertEmailFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => flowInput.parse(raw))
  .handler(async ({ data, context }) => {
    const row = {
      name: data.name,
      audience: data.audience,
      trigger_type: data.triggerType,
      trigger_config: data.triggerConfig,
      steps: data.steps satisfies EmailFlowStep[],
      active: data.active,
    };
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("email_flows")
        .update(row)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return updated;
    }
    const { data: inserted, error } = await context.supabase
      .from("email_flows")
      .insert({ ...row, created_by: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const deleteEmailFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("email_flows").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Configuração do provedor (Resend) — só admin, service-role (tabela
// sem policy nenhuma pra authenticated).
// ============================================================

export const getEmailProviderSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("email_provider_settings")
      .select(
        "provider, from_email, from_name, reply_to, sending_domain, domain_verified_at, api_key",
      )
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // Nunca devolve a api_key crua pro cliente — só se está configurada.
    return {
      provider: data?.provider ?? "resend",
      fromEmail: data?.from_email ?? "",
      fromName: data?.from_name ?? "",
      replyTo: data?.reply_to ?? "",
      sendingDomain: data?.sending_domain ?? "",
      domainVerifiedAt: data?.domain_verified_at ?? null,
      hasApiKey: !!data?.api_key,
    };
  });

const providerSettingsInput = z.object({
  fromEmail: z.string().trim().email(),
  fromName: z.string().trim().max(200).optional(),
  replyTo: z.string().trim().email().optional().or(z.literal("")),
  sendingDomain: z.string().trim().max(300).optional(),
  // Vazio = não trocar a chave já salva (evita obrigar reenviar a cada save).
  apiKey: z.string().trim().optional(),
});

export const saveEmailProviderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => providerSettingsInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row: Record<string, unknown> = {
      id: true,
      provider: "resend",
      from_email: data.fromEmail,
      from_name: data.fromName || null,
      reply_to: data.replyTo || null,
      sending_domain: data.sendingDomain || null,
      updated_at: new Date().toISOString(),
    };
    if (data.apiKey) row.api_key = data.apiKey;
    const { error } = await supabaseAdmin.from("email_provider_settings").upsert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Atividade por entidade — painel "E-mails" no lead/cliente/influ.
// Leitura franqueada (RLS: SELECT pra qualquer authenticated).
// ============================================================

const entityInput = z.object({
  entityType: audienceSchema,
  entityId: z.string().uuid(),
});

// ============================================================
// Descadastro público — sem auth (link vai no rodapé do e-mail),
// resolve o token de UM envio específico pra achar o e-mail e suprime
// esse endereço globalmente (email_unsubscribes) + cancela todas as
// matrículas ativas dele, em qualquer fluxo. Usa supabaseAdmin porque
// RLS de email_unsubscribes só dá SELECT (não INSERT) pra authenticated,
// e quem chama aqui nem está autenticado.
// ============================================================

export const processEmailUnsubscribe = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ token: z.string().min(1) }).parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: send, error } = await supabaseAdmin
      .from("email_sends")
      .select("to_email")
      .eq("unsubscribe_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!send) return { ok: false as const };

    const { error: unsubError } = await supabaseAdmin
      .from("email_unsubscribes")
      .upsert({ email: send.to_email, reason: "link de descadastro" });
    if (unsubError) throw new Error(unsubError.message);

    await supabaseAdmin
      .from("email_flow_enrollments")
      .update({ status: "cancelled", cancelled_reason: "e-mail descadastrado" })
      .eq("to_email", send.to_email)
      .eq("status", "active");

    return { ok: true as const, email: send.to_email };
  });

export const listEntityEmailActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => entityInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: enrollments, error: enrollError } = await context.supabase
      .from("email_flow_enrollments")
      .select("*, email_flows(name)")
      .eq("entity_type", data.entityType)
      .eq("entity_id", data.entityId)
      .order("enrolled_at", { ascending: false });
    if (enrollError) throw new Error(enrollError.message);

    const enrollmentIds = (enrollments ?? []).map((e) => e.id);
    if (enrollmentIds.length === 0) return { enrollments: enrollments ?? [], sends: [] };

    const { data: sends, error: sendError } = await context.supabase
      .from("email_sends")
      .select("*")
      .in("enrollment_id", enrollmentIds)
      .order("created_at", { ascending: false });
    if (sendError) throw new Error(sendError.message);
    return { enrollments: enrollments ?? [], sends: sends ?? [] };
  });
