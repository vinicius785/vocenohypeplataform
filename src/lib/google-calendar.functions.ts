import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Integração Google Calendar, por conta PESSOAL de cada usuário (sem conta
 * compartilhada — cada reunião sincroniza usando a conta Google de quem a
 * criou na plataforma, `google_calendar_connections`). Sincronização em
 * dois sentidos:
 * - Saída (`syncAllMeetingsToGoogle`): reuniões da plataforma viram eventos
 *   no Google, um `POST`/`PATCH` por criador conectado — plataforma é a
 *   fonte da verdade, upsert idempotente via
 *   `extendedProperties.private.vnhMeetingId` (marca o evento com o id da
 *   reunião, sem precisar guardar o id do evento no nosso lado).
 * - Entrada (`importGoogleEventsToMeetings`): eventos criados DIRETO no
 *   Google (sem esse marcador) viram Reunião na plataforma, atribuídos ao
 *   dono da conta conectada onde o evento apareceu — marcados com
 *   `origem: "google"` + `googleEventId` (dedupe do lado de cá, usando o
 *   `iCalUID` do evento quando disponível, já que o mesmo evento tem um
 *   `id` diferente em cada calendário de cada convidado).
 *
 * Reuniões cujo criador não tem conta Google conectada simplesmente não
 * sincronizam (sem erro) — cada pessoa precisa conectar a própria conta em
 * Configurações pra que as reuniões que ela cria apareçam no Google Agenda
 * dela, e vice-versa.
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

type GoogleConnectionRow = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
};

/** Token válido da conta pessoal de `userId` — renova via refresh_token
 * quando perto de expirar, gravando de volta na própria linha. */
async function getValidAccessToken(
  admin: AdminClient,
  row: GoogleConnectionRow,
): Promise<string | null> {
  const expiresInMs = new Date(row.token_expiry).getTime() - Date.now();
  if (expiresInMs > 60_000) return row.access_token;

  const { clientId, clientSecret } = requireGoogleEnv();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.warn(
      `[google-calendar] refresh token failed for user ${row.user_id}`,
      await res.text(),
    );
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
    .eq("user_id", row.user_id);
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
  convidadosExternos?: { nome: string; email: string }[];
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
      await fetch(`${EVENTS_URL}/${existingId}?sendUpdates=all`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {});
    }
    return;
  }

  const { start, end } = meetingTimeRange(m);
  // O criador é o organizador (dono da conta Google usada aqui) — não
  // entra na lista de attendees, senão o Google convidaria a própria conta
  // organizadora como se fosse uma participante externa.
  const internalAttendees = (m.participanteIds ?? [])
    .map((id) => emailById.get(id))
    .filter((email): email is string => Boolean(email));
  const externalAttendees = (m.convidadosExternos ?? []).map((g) => g.email).filter(Boolean);
  const attendees = Array.from(new Set([...internalAttendees, ...externalAttendees])).map(
    (email) => ({ email }),
  );

  const body = {
    summary: m.titulo || "Reunião",
    description: m.notas || undefined,
    location: m.local || undefined,
    start: { dateTime: start, timeZone: "America/Sao_Paulo" },
    end: { dateTime: end, timeZone: "America/Sao_Paulo" },
    attendees: attendees.length > 0 ? attendees : undefined,
    // Gera um link de Google Meet — disponível pra qualquer conta Google
    // (recursos extra tipo gravação dependem do plano de cada um).
    conferenceData: existingId
      ? undefined
      : { createRequest: { requestId: m.id, conferenceSolutionKey: { type: "hangoutsMeet" } } },
    extendedProperties: { private: { vnhMeetingId: m.id } },
  };

  const url = existingId ? `${EVENTS_URL}/${existingId}` : EVENTS_URL;
  const method = existingId ? "PATCH" : "POST";
  const params = new URLSearchParams({ sendUpdates: "all" });
  if (!existingId) params.set("conferenceDataVersion", "1");
  const res = await fetch(`${url}?${params}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn(`[google-calendar] sync failed for meeting ${m.id}`, await res.text());
  }
}

/** Sincroniza cada reunião contra a conta Google PESSOAL de quem a criou
 * (`criadorId`) — reuniões cujo criador não tem conta conectada são
 * puladas silenciosamente. */
export const syncAllMeetingsToGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: connections } = await supabaseAdmin
      .from("google_calendar_connections")
      .select("user_id, access_token, refresh_token, token_expiry");
    if (!connections || connections.length === 0) return { synced: 0, connected: false as const };

    const { data: rows, error } = await supabaseAdmin.from("reunioes").select("data");
    if (error) throw new Error(error.message);
    const meetings = (rows ?? []).map((r) => r.data as SlimMeeting);

    const allIds = new Set<string>();
    for (const m of meetings) {
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

    const meetingsByCreator = new Map<string, SlimMeeting[]>();
    for (const m of meetings) {
      if (!m.criadorId) continue;
      const list = meetingsByCreator.get(m.criadorId) ?? [];
      list.push(m);
      meetingsByCreator.set(m.criadorId, list);
    }

    let synced = 0;
    for (const conn of connections) {
      const creatorMeetings = meetingsByCreator.get(conn.user_id);
      if (!creatorMeetings || creatorMeetings.length === 0) continue;
      const accessToken = await getValidAccessToken(supabaseAdmin, conn);
      if (!accessToken) continue;
      for (const m of creatorMeetings) {
        await syncOneMeeting(accessToken, m, emailById);
        synced++;
      }
    }
    return { synced, connected: true as const };
  });

type GoogleEvent = {
  id: string;
  iCalUID?: string;
  status?: string; // "confirmed" | "cancelled" | ...
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean }[];
  extendedProperties?: { private?: Record<string, string> };
  hangoutLink?: string;
};

/** Converte um instante absoluto (`Date`/ISO) nos dois campos que `Meeting`
 * guarda em horário de Brasília — via `Intl.DateTimeFormat`, então funciona
 * certo não importa qual offset o Google mandou (diferente do truque de
 * string fixa usado só na saída, onde a plataforma controla o instante). */
function isoToSaoPauloParts(iso: string): { data: string; hora: string } {
  const instant = new Date(iso);
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return { data: dateFmt.format(instant), hora: timeFmt.format(instant) };
}

async function listGoogleEvents(accessToken: string): Promise<GoogleEvent[]> {
  const timeMin = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
  const timeMax = new Date(Date.now() + 120 * 24 * 60 * 60_000).toISOString();
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const url = new URL(EVENTS_URL);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      console.warn("[google-calendar] events.list failed", await res.text());
      break;
    }
    const json = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
    events.push(...(json.items ?? []));
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return events;
}

/** Caminho inverso de `syncAllMeetingsToGoogle`: eventos criados DIRETO no
 * Google Calendar de qualquer conta pessoal conectada (sem o marcador
 * `vnhMeetingId` — esses já são donos de uma Reunião e são ignorados aqui)
 * viram Reunião na plataforma, atribuídos ao dono da conta onde apareceram.
 * Dedupe via `googleEventId` (guarda o `iCalUID` do evento, estável entre
 * os calendários de todos os convidados — diferente do `id`, que o Google
 * dá um valor DIFERENTE por calendário pro mesmo evento); eventos
 * editados/cancelados no Google atualizam a Reunião já importada em vez de
 * duplicar. */
export const importGoogleEventsToMeetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: connections } = await supabaseAdmin
      .from("google_calendar_connections")
      .select("user_id, access_token, refresh_token, token_expiry");
    if (!connections || connections.length === 0)
      return { imported: 0, updated: 0, connected: false as const };

    const { data: rows, error } = await supabaseAdmin.from("reunioes").select("id, data");
    if (error) throw new Error(error.message);

    const byGoogleEventId = new Map<
      string,
      {
        id: string;
        data: SlimMeeting & {
          googleEventId?: string;
          origem?: string;
          status: string;
          meetLink?: string;
        };
      }
    >();
    for (const r of rows ?? []) {
      const m = r.data as SlimMeeting & {
        googleEventId?: string;
        origem?: string;
        status: string;
        meetLink?: string;
      };
      if (m.googleEventId) byGoogleEventId.set(m.googleEventId, { id: r.id, data: m });
    }

    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, email");
    const idByEmail = new Map<string, string>();
    for (const p of profiles ?? []) if (p.email) idByEmail.set(p.email.toLowerCase(), p.id);

    let imported = 0;
    let updated = 0;

    for (const conn of connections) {
      const accessToken = await getValidAccessToken(supabaseAdmin, conn);
      if (!accessToken) continue;
      const events = await listGoogleEvents(accessToken);

      for (const event of events) {
        // Já é uma reunião da plataforma (foi a própria `syncOneMeeting`
        // que criou esse evento) — nunca reimportar de volta.
        if (event.extendedProperties?.private?.vnhMeetingId) continue;
        // Evento de dia inteiro (só `date`, sem `dateTime`) — Reunião
        // sempre tem hora, fora de escopo aqui.
        if (!event.start?.dateTime || !event.end?.dateTime) continue;

        const dedupeKey = event.iCalUID ?? event.id;
        const { data: dataStr, hora } = isoToSaoPauloParts(event.start.dateTime);
        const duracao = Math.max(
          1,
          Math.round(
            (new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime()) /
              60_000,
          ),
        );

        const participanteIds: string[] = [];
        const convidadosExternos: { nome: string; email: string }[] = [];
        for (const a of event.attendees ?? []) {
          if (!a.email || a.self) continue;
          const uid = idByEmail.get(a.email.toLowerCase());
          if (uid) participanteIds.push(uid);
          else convidadosExternos.push({ nome: a.displayName || a.email, email: a.email });
        }

        const existing = byGoogleEventId.get(dedupeKey);
        const cancelled = event.status === "cancelled";

        if (existing) {
          const next = {
            ...existing.data,
            titulo: event.summary || existing.data.titulo,
            data: dataStr,
            hora,
            duracao,
            local: event.location,
            notas: event.description,
            participanteIds,
            convidadosExternos,
            meetLink: event.hangoutLink,
            status: cancelled ? "Cancelada" : (existing.data.status ?? "Confirmada"),
          };
          if (JSON.stringify(next) !== JSON.stringify(existing.data)) {
            await supabaseAdmin
              .from("reunioes")
              .update({ data: next, updated_at: new Date().toISOString() })
              .eq("id", existing.id);
            updated++;
          }
          continue;
        }

        if (cancelled) continue; // nunca vimos esse evento — nada a importar

        const meeting = {
          id: crypto.randomUUID(),
          titulo: event.summary || "Reunião",
          data: dataStr,
          hora,
          duracao,
          com: "",
          criadorId: conn.user_id,
          participanteIds,
          convidadosExternos,
          local: event.location ?? "",
          notas: event.description,
          meetLink: event.hangoutLink,
          status: "Confirmada",
          googleEventId: dedupeKey,
          origem: "google",
        };
        const { error: insertError } = await supabaseAdmin
          .from("reunioes")
          .insert({ id: meeting.id, data: meeting });
        if (insertError) {
          console.warn("[google-calendar] import insert failed", insertError.message);
          continue;
        }
        // Evita reimportar de novo no mesmo ciclo se o mesmo evento
        // aparecer no calendário de outro convidado também conectado.
        byGoogleEventId.set(dedupeKey, { id: meeting.id, data: meeting });
        imported++;
      }
    }

    return { imported, updated, connected: true as const };
  });
