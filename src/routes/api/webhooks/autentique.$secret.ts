import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook do Autentique: POST /api/webhooks/autentique/<AUTENTIQUE_WEBHOOK_PATH_SECRET>.
 * O Dashboard público não expõe secret HMAC, então a autenticação obrigatória é o segredo no
 * caminho (comparado em tempo constante). HMAC (`x-autentique-signature`) é camada extra e só é
 * exigido se AUTENTIQUE_WEBHOOK_SECRET_DOCUMENT/_SIGNATURE estiverem configurados. Lógica em
 * `autentique-webhook-handler.ts`; o estado vem de `getDocument`, nunca do payload.
 */
export const Route = createFileRoute("/api/webhooks/autentique/$secret")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { handleAutentiqueWebhook } =
          await import("@/lib/signature/autentique-webhook-handler");
        const { autentiqueWebhookSecretsFromEnv } =
          await import("@/lib/signature/autentique-webhook");
        const result = await handleAutentiqueWebhook({
          method: request.method,
          pathSecret: params.secret,
          expectedPathSecret: process.env.AUTENTIQUE_WEBHOOK_PATH_SECRET?.trim(),
          rawBody: await request.text(),
          signatureHeader: request.headers.get("x-autentique-signature"),
          secrets: autentiqueWebhookSecretsFromEnv(process.env),
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
