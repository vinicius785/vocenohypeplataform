import { createFileRoute } from "@tanstack/react-router";

/**
 * Data Deletion Request Callback da Meta: POST `signed_request=<assinatura>.<payload>`
 * (application/x-www-form-urlencoded). A assinatura é validada com META_APP_SECRET antes de ler o
 * conteúdo; a resposta é `{ url, confirmation_code }`. Nada (segredo, signed_request, ID da Meta) é
 * registrado em log nem devolvido.
 */
export const Route = createFileRoute("/api/webhooks/meta-data-deletion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let signedRequest: string | null = null;
        try {
          const ct = request.headers.get("content-type") ?? "";
          const body = await request.text();
          signedRequest = ct.includes("application/json")
            ? ((JSON.parse(body) as { signed_request?: unknown }).signed_request as string | null)
            : new URLSearchParams(body).get("signed_request");
        } catch {
          return Response.json({ error: "invalid_request" }, { status: 400 });
        }
        try {
          const { handleMetaDeletionCallback } = await import("@/lib/meta-data-deletion");
          const { createSupabaseDeletionRepo } =
            await import("@/lib/meta-data-deletion-repo.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { getAppUrl } = await import("@/lib/google-oauth-config");
          const { createSupabaseInstagramRepo } =
            await import("@/lib/instagram/instagram-repo.server");
          const { instagramDeletionStore } = await import("@/lib/instagram/instagram-service");
          const metaSecret = process.env.META_APP_SECRET?.trim();
          const igSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
          const out = await handleMetaDeletionCallback({
            signedRequest: typeof signedRequest === "string" ? signedRequest : null,
            appSecrets: [metaSecret, igSecret].filter((v): v is string => !!v),
            hashKey: metaSecret,
            appUrl: getAppUrl,
            repo: createSupabaseDeletionRepo(supabaseAdmin),
            // armazenamentos reais com dados vinculados à identidade Meta/Instagram
            stores: [instagramDeletionStore(createSupabaseInstagramRepo(supabaseAdmin))],
          });
          return Response.json(out.body, { status: out.status });
        } catch {
          return Response.json({ error: "server_error" }, { status: 500 });
        }
      },
    },
  },
});
