import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook do Autentique (lógica em `autentique-webhook-handler.ts`). Eventos relevantes:
 * document.finished, signature.accepted, signature.rejected; o estado vem de `getDocument`
 * (nunca do tipo do evento). Segredo: AUTENTIQUE_WEBHOOK_SECRET.
 */
export const Route = createFileRoute("/api/webhooks/autentique")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleAutentiqueWebhook } =
          await import("@/lib/signature/autentique-webhook-handler");
        const result = await handleAutentiqueWebhook({
          rawBody: await request.text(),
          signatureHeader: request.headers.get("x-autentique-signature"),
          secret: process.env.AUTENTIQUE_WEBHOOK_SECRET?.trim(),
          getDeps: async () => {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { getSignatureProvider } = await import("@/lib/signature/autentique.server");
            const { createSupabaseContractRepo } =
              await import("@/lib/signature/influencer-contract-repo.server");
            return {
              repo: createSupabaseContractRepo(supabaseAdmin),
              provider: getSignatureProvider(),
            };
          },
        });
        return typeof result.body === "string"
          ? new Response(result.body, { status: result.status })
          : Response.json(result.body, { status: result.status });
      },
    },
  },
});
