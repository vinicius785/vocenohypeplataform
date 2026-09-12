/**
 * Server functions administrativas do "Relatório semanal do Hypito" —
 * mesmo padrão de `integrations.functions.ts`/`team.functions.ts`
 * (`createServerFn` + `requireSupabaseAuth`, `assertAdmin` antes de
 * qualquer leitura/escrita sensível). Usado só pela aba de administração
 * em Configurações (`HypitoReportTab.tsx`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/integrations.functions";
import { DEFAULT_WORKSPACE_ID } from "@/lib/hypito";
import type { Database } from "@/integrations/supabase/types";

type SettingsUpdate = Database["public"]["Tables"]["hypito_report_settings"]["Update"];

export const getHypitoReportSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { getWeeklyReportSettings } = await import("@/lib/hypito-weekly-report.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return getWeeklyReportSettings(supabaseAdmin, DEFAULT_WORKSPACE_ID);
  });

const UpdateSettingsInput = z.object({
  enabled: z.boolean().optional(),
  mentionUsers: z.boolean().optional(),
  excludedUserIds: z.array(z.string()).optional(),
  includedUserIds: z.array(z.string()).nullable().optional(),
});

export const updateHypitoReportSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof UpdateSettingsInput>) => UpdateSettingsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: SettingsUpdate = {
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.mentionUsers !== undefined) patch.mention_users = data.mentionUsers;
    if (data.excludedUserIds !== undefined) patch.excluded_user_ids = data.excludedUserIds;
    if (data.includedUserIds !== undefined) patch.included_user_ids = data.includedUserIds;
    const { error } = await supabaseAdmin
      .from("hypito_report_settings")
      .update(patch)
      .eq("workspace_id", DEFAULT_WORKSPACE_ID);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listHypitoReportRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("hypito_report_runs")
      .select(
        "id, week_start, status, trigger, triggered_by, preview, message_id, unavailable_sources, error, started_at, finished_at, duration_ms",
      )
      .eq("workspace_id", DEFAULT_WORKSPACE_ID)
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Prévia — NUNCA publica, NUNCA notifica (garantido por
 * `generateWeeklyReportPreview`, que não toca em `chat_messages`). */
export const generateHypitoReportPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { generateWeeklyReportPreview } = await import("@/lib/hypito-weekly-report.server");
    return generateWeeklyReportPreview({
      workspaceId: DEFAULT_WORKSPACE_ID,
      triggeredBy: context.userId,
    });
  });

/** "Enviar agora" — publica de verdade, sujeito à MESMA trava de
 * idempotência do cron (mesma chave `weekly-report:{workspaceId}:{semana
 * atual}`) — não é possível gerar dois relatórios reais na mesma semana
 * por este botão, nem em conjunto com o agendamento automático. */
export const sendHypitoReportNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { runWeeklyReport } = await import("@/lib/hypito-weekly-report.server");
    return runWeeklyReport({
      trigger: "manual",
      triggeredBy: context.userId,
      workspaceId: DEFAULT_WORKSPACE_ID,
    });
  });

/** Reprocessa uma execução com falha — reusa a mesma linha/chave (nunca
 * cria uma segunda), então continua respeitando "no máximo um relatório
 * publicado por semana" mesmo que reprocessado várias vezes. */
export const retryHypitoReportRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { runWeeklyReport } = await import("@/lib/hypito-weekly-report.server");
    return runWeeklyReport({
      trigger: "manual",
      triggeredBy: context.userId,
      workspaceId: DEFAULT_WORKSPACE_ID,
    });
  });

export const pauseHypitoReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("hypito_report_settings")
      .update({ enabled: false, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("workspace_id", DEFAULT_WORKSPACE_ID);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resumeHypitoReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("hypito_report_settings")
      .update({ enabled: true, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("workspace_id", DEFAULT_WORKSPACE_ID);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
