// Server-only: envio de e-mail via Resend. Config lida de
// email_provider_settings (singleton, service-role only — ver migração
// 20260826200000_email_flows.sql, mesmo padrão de shared_calendar_connection).
// Nunca importado fora de *.server.ts / handlers server-side, mesma regra
// de client.server.ts.
import { Resend } from "resend";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type EmailProviderConfig = {
  provider: string;
  apiKey: string;
  fromEmail: string;
  fromName: string | null;
  replyTo: string | null;
};

export async function getEmailProviderConfig(): Promise<EmailProviderConfig | null> {
  const { data, error } = await supabaseAdmin
    .from("email_provider_settings")
    .select("provider, api_key, from_email, from_name, reply_to")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.api_key || !data.from_email) return null;
  return {
    provider: data.provider,
    apiKey: data.api_key,
    fromEmail: data.from_email,
    fromName: data.from_name,
    replyTo: data.reply_to,
  };
}

export type SendEmailResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

/** Único ponto que fala com a Resend de verdade — a rota do cron
 * (src/routes/api/cron/email-flows.ts) é a única chamadora hoje. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const config = await getEmailProviderConfig();
  if (!config) return { ok: false, error: "Provedor de e-mail não configurado." };

  const resend = new Resend(config.apiKey);
  const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail;
  const { data, error } = await resend.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    replyTo: config.replyTo ?? undefined,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, providerMessageId: data?.id ?? null };
}
