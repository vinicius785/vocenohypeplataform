import { createFileRoute } from "@tanstack/react-router";

/**
 * Redirect do Instagram Login: GET ?code&state (ou ?error=access_denied). Troca o código no servidor,
 * guarda o token criptografado e redireciona para a página pública de resultado, sem token na URL.
 */
export const Route = createFileRoute("/api/instagram/oauth-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        let result = "erro";
        try {
          const { completeOAuth } = await import("@/lib/instagram/instagram-service");
          const { buildInstagramDeps } = await import("@/lib/instagram/instagram-deps.server");
          result = await completeOAuth(await buildInstagramDeps(), {
            code: q.get("code"),
            state: q.get("state"),
            error: q.get("error"),
          });
        } catch {
          result = "erro";
        }
        const { getAppUrl } = await import("@/lib/google-oauth-config");
        let base = "";
        try {
          base = getAppUrl();
        } catch {
          base = new URL(request.url).origin;
        }
        return new Response(null, {
          status: 302,
          headers: { Location: `${base}/conectar-instagram/resultado?status=${result}` },
        });
      },
    },
  },
});
