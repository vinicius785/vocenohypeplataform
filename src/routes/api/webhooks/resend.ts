import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Recebe eventos de entrega/abertura/clique/bounce da Resend (webhook
 * criado no dashboard deles, apontando pra esta URL) — é o que torna a
 * aba Resultados real (sem isso, opened_at/clicked_at nunca são
 * escritos). Resend assina via Svix: headers `svix-id`/`svix-timestamp`/
 * `svix-signature`, segredo `whsec_<base64>` colado pelo admin em
 * Configuração (email_provider_settings.webhook_secret).
 */

function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  body: string,
  svixSignatureHeader: string,
): boolean {
  const secretBytes = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected);
  return svixSignatureHeader
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter(Boolean)
    .some((sig) => {
      const sigBuf = Buffer.from(sig);
      return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
    });
}

type ResendEvent = {
  type: string;
  data: { email_id?: string };
};

export const Route = createFileRoute("/api/webhooks/resend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const svixId = request.headers.get("svix-id") ?? "";
        const svixTimestamp = request.headers.get("svix-timestamp") ?? "";
        const svixSignature = request.headers.get("svix-signature") ?? "";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: config } = await supabaseAdmin
          .from("email_provider_settings")
          .select("webhook_secret")
          .eq("id", true)
          .maybeSingle();
        if (!config?.webhook_secret) {
          return new Response("Webhook not configured", { status: 500 });
        }
        if (
          !svixId ||
          !svixTimestamp ||
          !svixSignature ||
          !verifySvixSignature(config.webhook_secret, svixId, svixTimestamp, body, svixSignature)
        ) {
          return new Response("Unauthorized", { status: 401 });
        }

        let event: ResendEvent;
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const messageId = event.data?.email_id;
        if (!messageId) return new Response("ok", { status: 200 });

        const now = new Date().toISOString();
        switch (event.type) {
          case "email.delivered":
            await supabaseAdmin
              .from("email_sends")
              .update({ status: "delivered", delivered_at: now })
              .eq("provider_message_id", messageId)
              .in("status", ["queued", "sent"]);
            break;
          case "email.opened":
            await supabaseAdmin
              .from("email_sends")
              .update({ status: "opened", opened_at: now })
              .eq("provider_message_id", messageId)
              .is("opened_at", null);
            break;
          case "email.clicked":
            await supabaseAdmin
              .from("email_sends")
              .update({ status: "clicked", clicked_at: now, opened_at: now })
              .eq("provider_message_id", messageId)
              .is("clicked_at", null);
            break;
          case "email.bounced":
            await supabaseAdmin
              .from("email_sends")
              .update({ status: "bounced", bounced_at: now })
              .eq("provider_message_id", messageId);
            break;
          default:
            break;
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
