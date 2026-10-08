import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook do Autentique. Ordem: segredo configurado → HMAC-SHA256 do corpo CRU → parse →
 * processamento idempotente. Eventos relevantes: document.finished, signature.accepted,
 * signature.rejected; o estado vem de `getDocument` (nunca do tipo do evento). 5xx em falha
 * transitória faz o Autentique reenviar (60/120/300 s). Segredo: AUTENTIQUE_WEBHOOK_SECRET.
 */
export const Route = createFileRoute("/api/webhooks/autentique")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.AUTENTIQUE_WEBHOOK_SECRET?.trim();
        if (!secret) return new Response("Webhook not configured", { status: 500 });

        const body = await request.text();
        const { verifyAutentiqueSignature, parseAutentiqueEvent } =
          await import("@/lib/signature/autentique-webhook");
        if (
          !verifyAutentiqueSignature(body, request.headers.get("x-autentique-signature"), secret)
        ) {
          return new Response("Unauthorized", { status: 401 });
        }

        let json: unknown;
        try {
          json = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const event = parseAutentiqueEvent(json);
        if (!event) return new Response("Invalid event", { status: 400 });

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { getSignatureProvider } = await import("@/lib/signature/autentique.server");
          const { createSupabaseContractRepo } =
            await import("@/lib/signature/influencer-contract-repo.server");
          const { processAutentiqueEvent } =
            await import("@/lib/signature/influencer-contract-service");
          const outcome = await processAutentiqueEvent(
            { repo: createSupabaseContractRepo(supabaseAdmin), provider: getSignatureProvider() },
            event,
          );
          return Response.json({ ok: true, outcome });
        } catch {
          return new Response("Processing failed", { status: 500 });
        }
      },
    },
  },
});
