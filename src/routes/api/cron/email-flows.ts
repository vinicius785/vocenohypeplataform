import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { renderEmailTemplate } from "@/lib/email-template";
import type { RecipientRule } from "@/lib/email-campaigns-constants";

/**
 * Alvo do Vercel Cron (ver `crons` em vercel.json) — autenticado pelo
 * header `Authorization: Bearer $CRON_SECRET` que o próprio Vercel Cron
 * já manda sozinho quando essa env var existe.
 *
 * Motor da sequência (campanha → etapas ordenadas por `position`, cada
 * destinatário com `current_step_id`/`next_run_at`): a cada execução,
 * busca destinatários ativos com `next_run_at <= now()` e, pra cada um,
 * anda pela sequência a partir da etapa atual — processando etapas
 * 'wait' (só avança quando o prazo vence) e 'email' (renderiza, checa
 * regra de destinatário, manda via Resend, registra em email_sends) —
 * continuando no mesmo ciclo enquanto a etapa seguinte já estiver
 * vencida (ex: "aguardar 0 dias" ou "enviar imediatamente" encadeados),
 * até travar numa etapa futura ou concluir a campanha pro contato. O
 * laço é limitado pelo número de etapas da campanha (sempre anda pra
 * frente em `position`) — sem risco de laço infinito.
 */

type Step = {
  id: string;
  campaign_id: string;
  position: number;
  kind: "email" | "wait";
  template_id: string | null;
  internal_name: string | null;
  subject: string | null;
  body_html: string | null;
  recipient_rule: RecipientRule;
  send_mode: "imediato" | "agendado" | "apos_anterior";
  scheduled_at: string | null;
  wait_days: number | null;
};

type Recipient = {
  id: string;
  campaign_id: string;
  email: string;
  name: string | null;
  status: string;
  current_step_id: string | null;
  next_run_at: string | null;
};

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

function enterStep(step: Step | undefined): { stepId: string | null; nextRunAt: string | null } {
  if (!step) return { stepId: null, nextRunAt: null };
  if (step.kind === "wait") {
    const days = step.wait_days ?? 0;
    return { stepId: step.id, nextRunAt: new Date(Date.now() + days * 86_400_000).toISOString() };
  }
  if (step.send_mode === "agendado" && step.scheduled_at) {
    return { stepId: step.id, nextRunAt: step.scheduled_at };
  }
  return { stepId: step.id, nextRunAt: new Date().toISOString() };
}

const BATCH_SIZE = 50;
const MAX_HOPS_PER_RECIPIENT = 30;

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

        const { data: due, error: dueError } = await supabaseAdmin
          .from("email_campaign_recipients")
          .select("*")
          .eq("status", "active")
          .lte("next_run_at", new Date().toISOString())
          .limit(BATCH_SIZE);
        if (dueError) {
          console.error("[cron/email-flows] busca de destinatários vencidos falhou", dueError);
          return new Response(JSON.stringify({ error: dueError.message }), { status: 500 });
        }

        let sent = 0;
        let skipped = 0;
        let failed = 0;
        let completed = 0;

        for (const recipient of (due ?? []) as Recipient[]) {
          const { data: campaign } = await supabaseAdmin
            .from("email_campaigns")
            .select("status")
            .eq("id", recipient.campaign_id)
            .single();
          if (!campaign || campaign.status !== "ativa") continue; // pausada — fica na fila, sem perder estado

          const { data: unsub } = await supabaseAdmin
            .from("email_unsubscribes")
            .select("email")
            .eq("email", recipient.email)
            .maybeSingle();
          if (unsub) {
            await supabaseAdmin
              .from("email_campaign_recipients")
              .update({ status: "unsubscribed", cancelled_reason: "e-mail descadastrado" })
              .eq("id", recipient.id);
            continue;
          }

          const { data: steps } = await supabaseAdmin
            .from("email_campaign_steps")
            .select("*")
            .eq("campaign_id", recipient.campaign_id)
            .order("position", { ascending: true });
          const stepList = (steps ?? []) as Step[];

          const { data: priorSends } = await supabaseAdmin
            .from("email_sends")
            .select("opened_at")
            .eq("recipient_id", recipient.id);

          let currentStepId = recipient.current_step_id;
          let nextRunAt = recipient.next_run_at;
          let recipientStatus: string = recipient.status;
          let hops = 0;

          while (hops < MAX_HOPS_PER_RECIPIENT) {
            hops++;
            if (!currentStepId) break;
            if (!nextRunAt || new Date(nextRunAt).getTime() > Date.now()) break;

            const step = stepList.find((s) => s.id === currentStepId);
            if (!step) {
              recipientStatus = "cancelled";
              await supabaseAdmin
                .from("email_campaign_recipients")
                .update({
                  status: "cancelled",
                  cancelled_reason: "etapa removida",
                  current_step_id: null,
                  next_run_at: null,
                })
                .eq("id", recipient.id);
              break;
            }

            const nextStep = stepList.find((s) => s.position === step.position + 1);

            if (step.kind === "wait") {
              const advance = enterStep(nextStep);
              currentStepId = advance.stepId;
              nextRunAt = advance.nextRunAt;
              if (!advance.stepId) {
                recipientStatus = "completed";
                await supabaseAdmin
                  .from("email_campaign_recipients")
                  .update({ status: "completed", current_step_id: null, next_run_at: null })
                  .eq("id", recipient.id);
                completed++;
                break;
              }
              await supabaseAdmin
                .from("email_campaign_recipients")
                .update({ current_step_id: currentStepId, next_run_at: nextRunAt })
                .eq("id", recipient.id);
              continue;
            }

            // step.kind === "email"
            const rulePasses =
              step.recipient_rule === "todos"
                ? true
                : step.recipient_rule === "nao_abriu"
                  ? !(priorSends ?? []).some((s) => s.opened_at)
                  : recipientStatus !== "responded";

            if (rulePasses && step.subject && step.body_html) {
              const vars = { nome: recipient.name ?? "", email: recipient.email };
              const subject = renderEmailTemplate(step.subject, vars);
              const body = renderEmailTemplate(step.body_html, vars);

              const { data: sendRow, error: sendInsertError } = await supabaseAdmin
                .from("email_sends")
                .insert({
                  campaign_id: recipient.campaign_id,
                  step_id: step.id,
                  recipient_id: recipient.id,
                  to_email: recipient.email,
                  subject,
                  status: "queued",
                })
                .select("id, unsubscribe_token")
                .single();

              if (sendInsertError || !sendRow) {
                console.error("[cron/email-flows] falha ao logar envio", sendInsertError);
                failed++;
              } else {
                const unsubscribeUrl = `${siteUrl()}/email/descadastro/${sendRow.unsubscribe_token}`;
                const html = `${body}<p style="margin-top:32px;font-size:11px;color:#888;">Não quer mais receber estes e-mails? <a href="${unsubscribeUrl}">Descadastre-se aqui</a>.</p>`;
                const result = await sendEmail({ to: recipient.email, subject, html });
                if (result.ok) {
                  await supabaseAdmin
                    .from("email_sends")
                    .update({
                      status: "sent",
                      provider_message_id: result.providerMessageId,
                      sent_at: new Date().toISOString(),
                    })
                    .eq("id", sendRow.id);
                  sent++;
                } else {
                  await supabaseAdmin
                    .from("email_sends")
                    .update({ status: "failed", error: result.error })
                    .eq("id", sendRow.id);
                  failed++;
                }
              }
            } else {
              skipped++;
            }

            const advance = enterStep(nextStep);
            currentStepId = advance.stepId;
            nextRunAt = advance.nextRunAt;
            if (!advance.stepId) {
              recipientStatus = "completed";
              await supabaseAdmin
                .from("email_campaign_recipients")
                .update({ status: "completed", current_step_id: null, next_run_at: null })
                .eq("id", recipient.id);
              completed++;
              break;
            }
            await supabaseAdmin
              .from("email_campaign_recipients")
              .update({ current_step_id: currentStepId, next_run_at: nextRunAt })
              .eq("id", recipient.id);
          }
        }

        return new Response(
          JSON.stringify({ ok: true, scanned: due?.length ?? 0, sent, skipped, failed, completed }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
