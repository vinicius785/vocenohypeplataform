import { createFileRoute } from "@tanstack/react-router";
import { getGoogleOAuthRedirectUri, googleOAuthEnvTag } from "@/lib/google-oauth-config";
import { reasonForErrorCode } from "@/lib/google-connect-flow";
import {
  OAUTH_STATE_COOKIE,
  buildClearStateCookie,
  readCookie,
} from "@/lib/google-oauth-state-cookie";

function redirectTo(
  origin: string,
  status: "connected" | "error",
  clearCookie: string,
  reason?: string,
) {
  const query = `google=${status}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`;
  const headers = new Headers({ Location: `${origin}/time?section=configuracoes&${query}` });
  // O cookie de vínculo é de uso único: apagado em qualquer desfecho.
  headers.append("Set-Cookie", clearCookie);
  return new Response(null, { status: 302, headers });
}

export const Route = createFileRoute("/api/google/oauth-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const env = googleOAuthEnvTag();
        const { processGoogleOAuthCallback } = await import("@/lib/google-oauth-callback");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let redirectUri: string | null = null;
        const result = await processGoogleOAuthCallback(
          {
            fetch,
            now: Date.now,
            getRedirectUri: () => {
              redirectUri = getGoogleOAuthRedirectUri();
              return redirectUri;
            },
            getClientCredentials: () => {
              const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
              const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
              return clientId && clientSecret ? { clientId, clientSecret } : null;
            },
            // `delete().select()` é atômico no Postgres — uso único de verdade mesmo sob corrida
            // (duas chamadas com o mesmo `state` nunca ganham a mesma linha). O `user_id` vem
            // sempre desta linha, gravada no servidor quando o fluxo começou com sessão
            // autenticada — nunca de um parâmetro que o navegador poderia forjar.
            consumeState: async (token) => {
              const { data } = await supabaseAdmin
                .from("google_oauth_states")
                .delete()
                .eq("token", token)
                .select("user_id, created_at")
                .maybeSingle();
              return data ?? null;
            },
            saveConnection: async (record) => {
              const { error } = await supabaseAdmin
                .from("google_calendar_connections")
                .upsert(record);
              return error ? { errorCode: error.code } : null;
            },
            log: (event, meta) => {
              if (event === "callback_error") console.error("[google-oauth]", event, meta);
            },
          },
          {
            code: url.searchParams.get("code"),
            state: url.searchParams.get("state"),
            error: url.searchParams.get("error"),
            browserBinding: readCookie(request.headers.get("cookie"), OAUTH_STATE_COOKIE),
          },
        );

        console.log("[google-oauth] callback result", {
          env,
          redirectUri,
          outcome: result.outcome,
          errorCode: result.outcome === "error" ? result.code : undefined,
        });
        const clearCookie = buildClearStateCookie({ secure: origin.startsWith("https://") });
        if (result.outcome === "connected") return redirectTo(origin, "connected", clearCookie);
        return redirectTo(origin, "error", clearCookie, reasonForErrorCode(result.code));
      },
    },
  },
});
