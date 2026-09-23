import { createFileRoute } from "@tanstack/react-router";
import {
  getGoogleOAuthRedirectUri,
  googleOAuthEnvTag,
  isOAuthStateExpired,
} from "@/lib/google-oauth-config";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/** Códigos categorizados pro log estruturado (item 11 do pedido) — nunca o
 * texto cru do erro do Google (pode conter fragmentos do client_secret em
 * mensagens de "invalid_client", por exemplo) nem qualquer token. */
type GoogleOAuthErrorCode =
  | "app_url_invalid"
  | "google_denied_or_missing_params"
  | "state_invalid_or_reused"
  | "state_expired"
  | "env_missing"
  | "token_exchange_failed"
  | "no_refresh_token"
  | "db_upsert_failed";

function logResult(
  env: string,
  redirectUri: string | null,
  outcome: "connected" | "error",
  errorCode?: GoogleOAuthErrorCode,
) {
  console.log("[google-oauth] callback result", { env, redirectUri, outcome, errorCode });
}

function redirectTo(origin: string, status: "connected" | "error") {
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/time?section=configuracoes&google=${status}` },
  });
}

export const Route = createFileRoute("/api/google/oauth-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const env = googleOAuthEnvTag();

        let redirectUri: string;
        try {
          redirectUri = getGoogleOAuthRedirectUri();
        } catch (err) {
          console.error(
            "[google-oauth] APP_URL inválida/ausente",
            err instanceof Error ? err.message : String(err),
          );
          logResult(env, null, "error", "app_url_invalid");
          return redirectTo(origin, "error");
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const err = url.searchParams.get("error");
        if (err || !code || !state) {
          logResult(env, redirectUri, "error", "google_denied_or_missing_params");
          return redirectTo(origin, "error");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // `delete().select()` é atômico no Postgres — garante uso único de
        // verdade mesmo sob corrida (2 chamadas simultâneas ao callback com
        // o mesmo `state` nunca podem ambas "ganhar" a mesma linha), ao
        // contrário do SELECT seguido de DELETE separados que existia antes.
        // `user_id` vem sempre dessa linha gravada no servidor quando o
        // fluxo começou (`startGoogleOAuth`, com sessão autenticada) — nunca
        // de um parâmetro que o navegador poderia forjar.
        const { data: stateRow } = await supabaseAdmin
          .from("google_oauth_states")
          .delete()
          .eq("token", state)
          .select("user_id, created_at")
          .maybeSingle();
        if (!stateRow) {
          logResult(env, redirectUri, "error", "state_invalid_or_reused");
          return redirectTo(origin, "error");
        }
        if (isOAuthStateExpired(stateRow.created_at)) {
          logResult(env, redirectUri, "error", "state_expired");
          return redirectTo(origin, "error");
        }

        const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
        if (!clientId || !clientSecret) {
          logResult(env, redirectUri, "error", "env_missing");
          return redirectTo(origin, "error");
        }

        const tokenRes = await fetch(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            // Mesma função usada em `startGoogleOAuth` pra montar a URL de
            // autorização — precisa ser byte-a-byte igual, senão o Google
            // recusa a troca com "redirect_uri_mismatch" mesmo já tendo
            // aceitado o mesmo valor na tela de consentimento.
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });
        if (!tokenRes.ok) {
          console.error("[google-oauth] token exchange failed", tokenRes.status);
          logResult(env, redirectUri, "error", "token_exchange_failed");
          return redirectTo(origin, "error");
        }
        const tokenJson = (await tokenRes.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
        };
        if (!tokenJson.refresh_token) {
          // Sem refresh_token (ex: usuário já tinha autorizado antes sem
          // "prompt=consent" pegar) — sem ele não dá pra manter a conexão
          // viva depois que o access_token expira em ~1h.
          logResult(env, redirectUri, "error", "no_refresh_token");
          return redirectTo(origin, "error");
        }

        const userInfoRes = await fetch(USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        });
        const userInfo = userInfoRes.ok ? ((await userInfoRes.json()) as { email?: string }) : {};

        const tokenExpiry = new Date(Date.now() + tokenJson.expires_in * 1000).toISOString();
        const { error } = await supabaseAdmin.from("google_calendar_connections").upsert({
          user_id: stateRow.user_id,
          google_email: userInfo.email ?? null,
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token,
          token_expiry: tokenExpiry,
          updated_at: new Date().toISOString(),
        });
        if (error) {
          console.error("[google-oauth] failed to store connection", error.code);
          logResult(env, redirectUri, "error", "db_upsert_failed");
          return redirectTo(origin, "error");
        }

        logResult(env, redirectUri, "connected");
        return redirectTo(origin, "connected");
      },
    },
  },
});
