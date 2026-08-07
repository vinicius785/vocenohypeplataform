import { createFileRoute } from "@tanstack/react-router";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

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
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const err = url.searchParams.get("error");
        if (err || !code || !state) return redirectTo(origin, "error");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: stateRow } = await supabaseAdmin
          .from("google_oauth_states")
          .select("user_id, created_at")
          .eq("token", state)
          .maybeSingle();
        await supabaseAdmin.from("google_oauth_states").delete().eq("token", state);
        if (!stateRow) return redirectTo(origin, "error");
        // Estado só vale por 10 minutos — depois disso, força reconectar.
        if (Date.now() - new Date(stateRow.created_at).getTime() > 10 * 60_000) {
          return redirectTo(origin, "error");
        }

        const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
        if (!clientId || !clientSecret) return redirectTo(origin, "error");

        const tokenRes = await fetch(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: `${origin}/api/google/oauth-callback`,
            grant_type: "authorization_code",
          }),
        });
        if (!tokenRes.ok) {
          console.error("[google-oauth] token exchange failed", await tokenRes.text());
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
          console.error("[google-oauth] no refresh_token returned");
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
          console.error("[google-oauth] failed to store connection", error);
          return redirectTo(origin, "error");
        }

        return redirectTo(origin, "connected");
      },
    },
  },
});
