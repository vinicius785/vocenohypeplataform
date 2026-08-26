import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { renderEmailTemplate } from "@/lib/email-template";
import type { EmailFlowStep } from "@/lib/email-flows-constants";

/**
 * Alvo do Vercel Cron (ver `crons` em vercel.json) — autenticado pelo
 * header `Authorization: Bearer $CRON_SECRET` que o próprio Vercel Cron
 * já manda sozinho quando essa env var existe (não reusa o padrão
 * `webhook_settings`, que é pra webhooks de terceiro, não pro
 * agendador da própria infra).
 *
 * A cada execução: (1) roda as varreduras de gatilho AGENDADO
 * (`run_scheduled_email_triggers`, cria matrículas por condição de
 * tempo — ver migração 20260826200000_email_flows_scheduled_triggers),
 * (2) processa até BATCH_SIZE matrículas vencidas (`next_run_at <= now()`),
 * mandando o passo atual e avançando pro próximo.
 */

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function siteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:8080";
}

const BATCH_SIZE = 50;

export const Route = createFileRoute("/api/cron/email-flows")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
          console.error("[cron/email-flows] CRON_SECRET não configurado");
          return new Response("Not configured", { status: 500 });
        }
        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
        if (!secretsMatch(provided, cronSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendEmail } = await import("@/lib/email-provider.server");

        const { error: scanError } = await supabaseAdmin.rpc("run_scheduled_email_triggers");
        if (scanError) console.error("[cron/email-flows] varredura agendada falhou", scanError);

        const { data: due, error: dueError } = await supabaseAdmin
          .from("email_flow_enrollments")
          .select("*, email_flows(steps)")
          .eq("status", "active")
          .lte("next_run_at", new Date().toISOString())
          .limit(BATCH_SIZE);
        if (dueError) {
          console.error("[cron/email-flows] busca de matrículas vencidas falhou", dueError);
          return new Response(JSON.stringify({ error: dueError.message }), { status: 500 });
        }

        let sent = 0;
        let failed = 0;
        let completed = 0;

        for (const enrollment of due ?? []) {
          const flow = enrollment.email_flows as { steps: EmailFlowStep[] } | null;
          const steps = flow?.steps ?? [];
          const step = steps[enrollment.current_step_index];

          if (!step) {
            await supabaseAdmin
              .from("email_flow_enrollments")
              .update({ status: "completed", next_run_at: null })
              .eq("id", enrollment.id);
            completed++;
            continue;
          }

          const { data: unsub } = await supabaseAdmin
            .from("email_unsubscribes")
            .select("email")
            .eq("email", enrollment.to_email)
            .maybeSingle();
          if (unsub) {
            await supabaseAdmin
              .from("email_flow_enrollments")
              .update({ status: "cancelled", cancelled_reason: "e-mail descadastrado" })
              .eq("id", enrollment.id);
            continue;
          }

          const { data: template } = await supabaseAdmin
            .from("email_templates")
            .select("subject, body_html")
            .eq("id", step.templateId)
            .maybeSingle();
          if (!template) {
            await supabaseAdmin
              .from("email_flow_enrollments")
              .update({ status: "cancelled", cancelled_reason: "template removido" })
              .eq("id", enrollment.id);
            continue;
          }

          const vars = { nome: enrollment.to_name ?? "" };
          const subject = renderEmailTemplate(template.subject, vars);
          const body = renderEmailTemplate(template.body_html, vars);

          const { data: sendRow, error: sendInsertError } = await supabaseAdmin
            .from("email_sends")
            .insert({
              enrollment_id: enrollment.id,
              template_id: step.templateId,
              to_email: enrollment.to_email,
              subject,
              status: "queued",
            })
            .select("id, unsubscribe_token")
            .single();
          if (sendInsertError || !sendRow) {
            console.error("[cron/email-flows] falha ao logar envio", sendInsertError);
            failed++;
            continue;
          }

          const unsubscribeUrl = `${siteUrl()}/email/descadastro/${sendRow.unsubscribe_token}`;
          const html = `${body}<p style="margin-top:32px;font-size:11px;color:#888;">Não quer mais receber estes e-mails? <a href="${unsubscribeUrl}">Descadastre-se aqui</a>.</p>`;

          const result = await sendEmail({ to: enrollment.to_email, subject, html });

          if (result.ok) {
            await supabaseAdmin
              .from("email_sends")
              .update({
                status: "sent",
                provider_message_id: result.providerMessageId,
                sent_at: new Date().toISOString(),
              })
              .eq("id", sendRow.id);

            const nextIndex = enrollment.current_step_index + 1;
            const nextStep = steps[nextIndex];
            if (nextStep) {
              await supabaseAdmin
                .from("email_flow_enrollments")
                .update({
                  current_step_index: nextIndex,
                  next_run_at: new Date(Date.now() + nextStep.waitDays * 86_400_000).toISOString(),
                })
                .eq("id", enrollment.id);
            } else {
              await supabaseAdmin
                .from("email_flow_enrollments")
                .update({ status: "completed", next_run_at: null })
                .eq("id", enrollment.id);
              completed++;
            }
            sent++;
          } else {
            await supabaseAdmin
              .from("email_sends")
              .update({ status: "failed", error: result.error })
              .eq("id", sendRow.id);
            failed++;
          }
        }

        return new Response(
          JSON.stringify({ ok: true, scanned: due?.length ?? 0, sent, failed, completed }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
