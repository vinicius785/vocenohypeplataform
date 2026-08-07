import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Integração Google Calendar: cada usuário conecta a própria conta (OAuth);
 * a plataforma é sempre a fonte da verdade — a sincronização é unidirecional
 * (reuniões daqui -> eventos no Google), nunca o contrário. O upsert é
 * idempotente via `extendedProperties.private.vnhMeetingId` (marca cada
 * evento do Google com o id da reunião), então não precisamos guardar o id
 * do evento do Google em lugar nenhum do nosso lado — evita qualquer risco
 * de condição de corrida ao gravar de volta no registro da reunião.
 */

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events openid email";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function requireGoogleEnv() {
  // .trim() blinda contra espaço/quebra de linha colada junto no valor ao
  // configurar a env var (ex: no painel do Vercel) — o Google rejeita o
  // client_id inteiro com "invalid_client" se sobrar um \n no final, um erro
  // silencioso e difícil de enxergar só olhando o campo no painel.
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Integração com Google Calendar não configurada (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ausentes).",
    );
  }
  return { clientId, clientSecret };
}

function redirectUriFromRequest(): string {
  const request = getRequest();
  const origin = new URL(request.url).origin;
  return `${origin}/api/google/oauth-callback`;
}

export const startGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { clientId } = requireGoogleEnv();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = crypto.randomUUID();
    const { error } = await supabaseAdmin
      .from("google_oauth_states")
      .insert({ token, user_id: context.userId });
    if (error) throw new Error(error.message);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUriFromRequest(),
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: GOOGLE_SCOPE,
      state: token,
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  });

export const getGoogleConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("google_calendar_connections")
      .select("google_email, connected_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!data) return { connected: false as const };
    return { connected: true as const, email: data.google_email, connectedAt: data.connected_at };
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("google_calendar_connections")
      .select("access_token")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (data?.access_token) {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.access_token)}`,
        {
          method: "POST",
        },
      ).catch(() => {
        /* best-effort — a desconexão local acontece de qualquer forma */
      });
    }
    await supabaseAdmin.from("google_calendar_connections").delete().eq("user_id", context.userId);
    return { ok: true };
  });

type AdminClient = SupabaseClient<Database>;

async function getValidAccessToken(admin: AdminClient, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("google_calendar_connections")
    .select("access_token, refresh_token, token_expiry")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;

  const expiresInMs = new Date(data.token_expiry).getTime() - Date.now();
  if (expiresInMs > 60_000) return data.access_token;

  const { clientId, clientSecret } = requireGoogleEnv();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.warn("[google-calendar] refresh token failed", await res.text());
    return null;
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  const tokenExpiry = new Date(Date.now() + json.expires_in * 1000).toISOString();
  await admin
    .from("google_calendar_connections")
    .update({
      access_token: json.access_token,
      token_expiry: tokenExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return json.access_token;
}

type SlimMeeting = {
  id: string;
  titulo: string;
  data: string;
  hora: string;
  duracao: number;
  local?: string;
  notas?: string;
  status?: string;
  criadorId?: string;
  participanteIds?: string[];
};

// `data`/`hora` são horário de Brasília (a plataforma nunca guarda outro
// fuso) — sem o offset explícito "-03:00", `new Date(...)` interpretaria a
// string no fuso do servidor (UTC nas functions do Vercel), deslocando o
// evento em 3h no Google Agenda em relação ao horário mostrado na plataforma.
function meetingTimeRange(m: SlimMeeting) {
  const start = new Date(`${m.data}T${m.hora}:00-03:00`);
  // Reuniões sem duração válida gerariam um evento de instante zero — o
  // Google Agenda renderiza isso como um chip minúsculo sem bloco de
  // horário (visualmente parece uma "tarefa", não uma reunião de verdade).
  const durationMin = m.duracao > 0 ? m.duracao : 60;
  const end = new Date(start.getTime() + durationMin * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function findGoogleEventId(accessToken: string, meetingId: string): Promise<string | null> {
  const url = new URL(EVENTS_URL);
  url.searchParams.set("privateExtendedProperty", `vnhMeetingId=${meetingId}`);
  url.searchParams.set("maxResults", "1");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const json = (await res.json()) as { items?: { id: string }[] };
  return json.items?.[0]?.id ?? null;
}

async function syncOneMeeting(
  accessToken: string,
  m: SlimMeeting,
  emailById: Map<string, string>,
): Promise<void> {
  const existingId = await findGoogleEventId(accessToken, m.id);

  if (m.status === "Cancelada") {
    if (existingId) {
      await fetch(`${EVENTS_URL}/${existingId}?sendUpdates=none`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {});
    }
    return;
  }

  const { start, end } = meetingTimeRange(m);
  const attendeeIds = new Set([
    ...(m.participanteIds ?? []),
    ...(m.criadorId ? [m.criadorId] : []),
  ]);
  const attendees = Array.from(attendeeIds)
    .map((id) => emailById.get(id))
    .filter((email): email is string => Boolean(email))
    .map((email) => ({ email }));

  const body = {
    summary: m.titulo || "Reunião",
    description: m.notas || undefined,
    location: m.local || undefined,
    start: { dateTime: start, timeZone: "America/Sao_Paulo" },
    end: { dateTime: end, timeZone: "America/Sao_Paulo" },
    attendees: attendees.length > 0 ? attendees : undefined,
    extendedProperties: { private: { vnhMeetingId: m.id } },
  };

  const url = existingId ? `${EVENTS_URL}/${existingId}` : EVENTS_URL;
  const method = existingId ? "PATCH" : "POST";
  const params = new URLSearchParams({ sendUpdates: "none" });
  const res = await fetch(`${url}?${params}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn(`[google-calendar] sync failed for meeting ${m.id}`, await res.text());
  }
}

export const syncMyMeetingsToGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accessToken = await getValidAccessToken(supabaseAdmin, context.userId);
    if (!accessToken) return { synced: 0, connected: false as const };

    const { data: rows, error } = await supabaseAdmin.from("reunioes").select("data");
    if (error) throw new Error(error.message);

    const mine = (rows ?? [])
      .map((r) => r.data as SlimMeeting)
      .filter((m) => m.criadorId === context.userId || m.participanteIds?.includes(context.userId));

    const allIds = new Set<string>();
    for (const m of mine) {
      m.participanteIds?.forEach((id) => allIds.add(id));
      if (m.criadorId) allIds.add(m.criadorId);
    }
    const emailById = new Map<string, string>();
    if (allIds.size > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("id", Array.from(allIds));
      for (const p of profiles ?? []) emailById.set(p.id, p.email);
    }

    for (const m of mine) {
      await syncOneMeeting(accessToken, m, emailById);
    }
    return { synced: mine.length, connected: true as const };
  });
