import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/integrations.functions";
import { z } from "zod";
import { CAMPAIGN_OBJETIVOS, RECIPIENT_RULES, SEND_MODES } from "@/lib/email-campaigns-constants";

/**
 * Server functions da área de e-mail (Campanhas): CRUD de campanha/
 * etapas/público/templates, todas RLS admin-only (`is_admin()`), então
 * usam `context.supabase` sem checagem própria — mesmo padrão de
 * `integrations.functions.ts`/`email-flows.functions.ts` (v1).
 * `email_provider_settings` não tem policy pra authenticated (só
 * service_role) — essas usam `assertAdmin` explícito + `supabaseAdmin`.
 */

// ============================================================
// Dashboard — uma leitura só, agregação fica na UI (mesmo espírito de
// MetasSection: listas completas, agregação client-side).
// ============================================================

export const getEmailDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [campaigns, steps, recipients, sends] = await Promise.all([
      context.supabase
        .from("email_campaigns")
        .select("*")
        .order("created_at", { ascending: false }),
      context.supabase
        .from("email_campaign_steps")
        .select(
          "id, campaign_id, position, kind, internal_name, subject, send_mode, scheduled_at, wait_days, status",
        )
        .order("position", { ascending: true }),
      context.supabase
        .from("email_campaign_recipients")
        .select("id, campaign_id, status, next_run_at, current_step_id"),
      context.supabase.from("email_sends").select("id, campaign_id, status"),
    ]);
    if (campaigns.error) throw new Error(campaigns.error.message);
    if (steps.error) throw new Error(steps.error.message);
    if (recipients.error) throw new Error(recipients.error.message);
    if (sends.error) throw new Error(sends.error.message);
    return {
      campaigns: campaigns.data ?? [],
      steps: steps.data ?? [],
      recipients: recipients.data ?? [],
      sends: sends.data ?? [],
    };
  });

// ============================================================
// Campanhas
// ============================================================

const campaignInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  objetivo: z.enum(CAMPAIGN_OBJETIVOS),
});

export const upsertEmailCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => campaignInput.parse(raw))
  .handler(async ({ data, context }) => {
    const row = { name: data.name, description: data.description || null, objetivo: data.objetivo };
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("email_campaigns")
        .update(row)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return updated;
    }
    const { data: inserted, error } = await context.supabase
      .from("email_campaigns")
      .insert({ ...row, created_by: context.userId, status: "rascunho" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const deleteEmailCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("email_campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function logActivity(supabase: unknown, campaignId: string, message: string) {
  await (supabase as import("@supabase/supabase-js").SupabaseClient)
    .from("email_campaign_activity")
    .insert({ campaign_id: campaignId, message });
}

export const getCampaignDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ campaignId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const [campaign, steps, recipients, activity] = await Promise.all([
      context.supabase.from("email_campaigns").select("*").eq("id", data.campaignId).single(),
      context.supabase
        .from("email_campaign_steps")
        .select("*")
        .eq("campaign_id", data.campaignId)
        .order("position", { ascending: true }),
      context.supabase
        .from("email_campaign_recipients")
        .select("*")
        .eq("campaign_id", data.campaignId)
        .order("added_at", { ascending: false }),
      context.supabase
        .from("email_campaign_activity")
        .select("*")
        .eq("campaign_id", data.campaignId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (campaign.error) throw new Error(campaign.error.message);
    if (steps.error) throw new Error(steps.error.message);
    if (recipients.error) throw new Error(recipients.error.message);
    if (activity.error) throw new Error(activity.error.message);
    return {
      campaign: campaign.data,
      steps: steps.data ?? [],
      recipients: recipients.data ?? [],
      activity: activity.data ?? [],
    };
  });

export const listCampaignSends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ campaignId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: sends, error } = await context.supabase
      .from("email_sends")
      .select("*")
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return sends ?? [];
  });

const readinessInput = z.object({ campaignId: z.string().uuid() });

async function checkReadiness(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  campaignId: string,
): Promise<{ ready: boolean; missing: string[] }> {
  const missing: string[] = [];
  const [{ data: campaign }, { count: recipientCount }, { data: steps }] = await Promise.all([
    supabase.from("email_campaigns").select("name").eq("id", campaignId).single(),
    supabase
      .from("email_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "active"),
    supabase
      .from("email_campaign_steps")
      .select("kind, subject, body_html, internal_name")
      .eq("campaign_id", campaignId),
  ]);
  if (!campaign?.name?.trim()) missing.push("Nome da campanha");
  if (!recipientCount || recipientCount === 0) missing.push("Público (pelo menos 1 destinatário)");
  const hasReadyEmailStep = (steps ?? []).some(
    (s) =>
      s.kind === "email" && s.internal_name?.trim() && s.subject?.trim() && s.body_html?.trim(),
  );
  if (!hasReadyEmailStep) missing.push("Pelo menos uma etapa de e-mail configurada");
  return { ready: missing.length === 0, missing };
}

export const getCampaignReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => readinessInput.parse(raw))
  .handler(async ({ data, context }) => checkReadiness(context.supabase, data.campaignId));

export const activateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => readinessInput.parse(raw))
  .handler(async ({ data, context }) => {
    const readiness = await checkReadiness(context.supabase, data.campaignId);
    if (!readiness.ready) return { ok: false as const, missing: readiness.missing };

    const { data: steps, error: stepsError } = await context.supabase
      .from("email_campaign_steps")
      .select("*")
      .eq("campaign_id", data.campaignId)
      .order("position", { ascending: true });
    if (stepsError) throw new Error(stepsError.message);
    const firstStep = steps?.[0];

    const { data: pending, error: pendingError } = await context.supabase
      .from("email_campaign_recipients")
      .select("id")
      .eq("campaign_id", data.campaignId)
      .eq("status", "active")
      .is("current_step_id", null);
    if (pendingError) throw new Error(pendingError.message);

    if (firstStep && pending && pending.length > 0) {
      const nextRunAt =
        firstStep.kind === "wait"
          ? new Date(Date.now() + (firstStep.wait_days ?? 0) * 86_400_000).toISOString()
          : firstStep.send_mode === "agendado" && firstStep.scheduled_at
            ? firstStep.scheduled_at
            : new Date().toISOString();
      const { error: updateError } = await context.supabase
        .from("email_campaign_recipients")
        .update({ current_step_id: firstStep.id, next_run_at: nextRunAt })
        .in(
          "id",
          pending.map((p) => p.id),
        );
      if (updateError) throw new Error(updateError.message);
    }

    const { error: statusError } = await context.supabase
      .from("email_campaigns")
      .update({ status: "ativa" })
      .eq("id", data.campaignId);
    if (statusError) throw new Error(statusError.message);
    await logActivity(context.supabase, data.campaignId, "Campanha ativada.");
    return { ok: true as const };
  });

export const pauseCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => readinessInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_campaigns")
      .update({ status: "pausada" })
      .eq("id", data.campaignId);
    if (error) throw new Error(error.message);
    await logActivity(context.supabase, data.campaignId, "Campanha pausada.");
    return { ok: true };
  });

export const resumeCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => readinessInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_campaigns")
      .update({ status: "ativa" })
      .eq("id", data.campaignId);
    if (error) throw new Error(error.message);
    await logActivity(context.supabase, data.campaignId, "Campanha retomada.");
    return { ok: true };
  });

// ============================================================
// Etapas (sequência)
// ============================================================

const stepInput = z.object({
  id: z.string().uuid().optional(),
  campaignId: z.string().uuid(),
  kind: z.enum(["email", "wait"]),
  templateId: z.string().uuid().optional().nullable(),
  internalName: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(300).optional(),
  bodyHtml: z.string().optional(),
  recipientRule: z.enum(RECIPIENT_RULES).optional(),
  sendMode: z.enum(SEND_MODES).optional(),
  scheduledAt: z.string().optional().nullable(),
  waitDays: z.number().int().min(0).max(365).optional(),
});

export const upsertCampaignStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => stepInput.parse(raw))
  .handler(async ({ data, context }) => {
    const row = {
      campaign_id: data.campaignId,
      kind: data.kind,
      template_id: data.templateId ?? null,
      internal_name: data.internalName ?? null,
      subject: data.subject ?? null,
      body_html: data.bodyHtml ?? null,
      recipient_rule: data.recipientRule ?? "todos",
      send_mode: data.sendMode ?? "apos_anterior",
      scheduled_at: data.scheduledAt ?? null,
      wait_days: data.waitDays ?? null,
    };
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("email_campaign_steps")
        .update(row)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return updated;
    }
    const { data: maxRow } = await context.supabase
      .from("email_campaign_steps")
      .select("position")
      .eq("campaign_id", data.campaignId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (maxRow?.position ?? -1) + 1;
    const { data: inserted, error } = await context.supabase
      .from("email_campaign_steps")
      .insert({ ...row, position })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const deleteCampaignStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_campaign_steps")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderCampaignStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        id: z.string().uuid(),
        direction: z.enum(["up", "down"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: steps, error } = await context.supabase
      .from("email_campaign_steps")
      .select("id, position")
      .eq("campaign_id", data.campaignId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    const list = steps ?? [];
    const idx = list.findIndex((s) => s.id === data.id);
    const swapIdx = data.direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return { ok: true };
    const a = list[idx];
    const b = list[swapIdx];
    await context.supabase
      .from("email_campaign_steps")
      .update({ position: b.position })
      .eq("id", a.id);
    await context.supabase
      .from("email_campaign_steps")
      .update({ position: a.position })
      .eq("id", b.id);
    return { ok: true };
  });

// ============================================================
// Público — adicionar destinatários (mesma função pra qualquer fonte,
// snapshot de email/nome, duplicata ignorada via índice único).
// ============================================================

const addRecipientsInput = z.object({
  campaignId: z.string().uuid(),
  source: z.enum(["banco_influenciador", "lead", "cliente", "manual"]),
  entries: z
    .array(
      z.object({
        sourceId: z.string().uuid().optional(),
        email: z.string().trim().email(),
        name: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const addCampaignRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => addRecipientsInput.parse(raw))
  .handler(async ({ data, context }) => {
    const rows = data.entries.map((e) => ({
      campaign_id: data.campaignId,
      source: data.source,
      source_id: e.sourceId ?? null,
      email: e.email.toLowerCase(),
      name: e.name || null,
    }));
    const { data: inserted, error } = await context.supabase
      .from("email_campaign_recipients")
      .upsert(rows, { onConflict: "campaign_id,email", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    await logActivity(
      context.supabase,
      data.campaignId,
      `${inserted?.length ?? 0} contato(s) adicionado(s) ao público.`,
    );
    return { ok: true, added: inserted?.length ?? 0 };
  });

export const removeCampaignRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_campaign_recipients")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markRecipientResponded = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: recipient, error } = await context.supabase
      .from("email_campaign_recipients")
      .update({ status: "responded", cancelled_reason: "respondeu" })
      .eq("id", data.id)
      .select("campaign_id, email")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(
      context.supabase,
      recipient.campaign_id,
      `${recipient.email} foi marcado como respondido — próximas etapas canceladas para este contato.`,
    );
    return { ok: true };
  });

// ============================================================
// Fontes de público — pickers (Banco de Influenciadores / Leads / Clientes)
// ============================================================

export const listLeadsForPicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("id, name, email, company, stage")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).filter((l) => !!l.email);
  });

export const listClientesForPicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("clientes").select("id, data");
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row) => {
        const d = row.data as Record<string, unknown>;
        return {
          id: row.id,
          empresa: (d.empresa as string) ?? "",
          email: (d.email as string) ?? "",
          responsavel: (d.responsavel as string) ?? "",
        };
      })
      .filter((c) => !!c.email);
  });

export const listBancoInfluenciadoresForPicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("banco_influenciadores").select("id, data");
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row) => {
        const d = row.data as Record<string, unknown>;
        const redes = (d.redes as { plataforma?: string; handle?: string }[] | undefined) ?? [];
        return {
          id: row.id,
          nome: (d.nome as string) ?? "",
          email: (d.email as string) ?? "",
          nicho: (d.nicho as string) ?? "",
          plataformas: redes.map((r) => r.plataforma).filter((p): p is string => !!p),
        };
      })
      .filter((i) => !!i.email);
  });

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
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(300),
  bodyHtml: z.string(),
});

export const upsertEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => templateInput.parse(raw))
  .handler(async ({ data, context }) => {
    const row = { name: data.name, subject: data.subject, body_html: data.bodyHtml };
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
// Configuração do provedor (Resend) + segredo do webhook — só admin,
// service-role (tabela sem policy nenhuma pra authenticated).
// ============================================================

export const getEmailProviderSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("email_provider_settings")
      .select(
        "provider, from_email, from_name, reply_to, sending_domain, domain_verified_at, api_key, webhook_secret",
      )
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      provider: data?.provider ?? "resend",
      fromEmail: data?.from_email ?? "",
      fromName: data?.from_name ?? "",
      replyTo: data?.reply_to ?? "",
      sendingDomain: data?.sending_domain ?? "",
      domainVerifiedAt: data?.domain_verified_at ?? null,
      hasApiKey: !!data?.api_key,
      hasWebhookSecret: !!data?.webhook_secret,
    };
  });

const providerSettingsInput = z.object({
  fromEmail: z.string().trim().email(),
  fromName: z.string().trim().max(200).optional(),
  replyTo: z.string().trim().email().optional().or(z.literal("")),
  sendingDomain: z.string().trim().max(300).optional(),
  apiKey: z.string().trim().optional(),
  // Segredo de ASSINATURA do webhook — a Resend gera esse valor (whsec_...)
  // quando o admin cria, no dashboard deles, um endpoint apontando pra
  // /api/webhooks/resend; ele é colado aqui pra dar pra verificar a
  // assinatura de cada evento recebido. Não é gerado por nós.
  webhookSecret: z.string().trim().optional(),
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
    if (data.webhookSecret) row.webhook_secret = data.webhookSecret;
    const { error } = await supabaseAdmin.from("email_provider_settings").upsert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Descadastro público — sem auth (link no rodapé do e-mail). Resolve o
// token de UM envio pra achar o e-mail, suprime globalmente
// (email_unsubscribes) e cancela o destinatário em TODAS as campanhas
// (não só na que gerou o envio). Usa supabaseAdmin porque quem chama
// aqui nem está autenticado.
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
      .from("email_campaign_recipients")
      .update({ status: "unsubscribed", cancelled_reason: "e-mail descadastrado" })
      .eq("email", send.to_email)
      .eq("status", "active");

    return { ok: true as const, email: send.to_email };
  });
