import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Integração Google Calendar. Sincronização em dois sentidos:
 * - Saída (reuniões da plataforma -> eventos no Google): a plataforma é a
 *   fonte da verdade, upsert idempotente via
 *   `extendedProperties.private.vnhMeetingId`
 * - Entrada (`importGoogleEventsToMeetings`, mais abaixo): eventos criados
 *   DIRETO no Google (sem esse marcador) viram Reunião na plataforma,
 *   marcados com `origem: "google"` + `googleEventId` (dedupe do lado de
 *   cá) — nunca reimporta um evento que a própria plataforma criou.
 *
 * TODAS as reuniões saem de uma única conta compartilhada (ex.:
 * contato@vocenohype.com.br, `shared_calendar_connection`), conectada por um
 * admin em Configurações — isso garante Meet Pro (mais participantes,
 * gravação, etc. conforme a licença Workspace daquela conta) em toda
 * reunião, e permite convidar pessoas externas por e-mail de verdade. Além
 * disso, cada pessoa ainda pode conectar sua conta PESSOAL
 * (`google_calendar_connections`) via o card de Configurações — hoje isso
 * não alimenta a sincronização de reuniões (que usa só a conta
 * compartilhada), fica disponível pra uso futuro.
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

async function requireAdmin(context: {
  userId: string;
  supabase: SupabaseClient<Database>;
}): Promise<void> {
  const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!isAdmin)
    throw new Error("Apenas administradores podem gerenciar o calendário compartilhado.");
}

export const startGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { clientId } = requireGoogleEnv();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = crypto.randomUUID();
    const { error } = await supabaseAdmin
      .from("google_oauth_states")
      .insert({ token, user_id: context.userId, purpose: "personal" });
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

/** Mesmo fluxo de `startGoogleOAuth`, mas pra conectar a conta ÚNICA e
 * compartilhada (ex.: contato@vocenohype.com.br) que passa a ser dona de
 * TODOS os eventos de reunião — só admin pode iniciar essa conexão, já que
 * ela afeta a agenda de todo mundo. Quem faz login na tela de consentimento
 * do Google, nesse fluxo, precisa ser a própria conta contato@..., não quem
 * clicou no botão aqui dentro. */
export const startSharedGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { clientId } = requireGoogleEnv();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = crypto.randomUUID();
    const { error } = await supabaseAdmin
      .from("google_oauth_states")
      .insert({ token, user_id: context.userId, purpose: "shared" });
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

export const getSharedGoogleConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("shared_calendar_connection")
      .select("google_email, connected_at")
      .eq("id", true)
      .maybeSingle();
    if (!data) return { connected: false as const };
    return { connected: true as const, email: data.google_email, connectedAt: data.connected_at };
  });

export const disconnectSharedGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("shared_calendar_connection")
      .select("access_token")
      .eq("id", true)
      .maybeSingle();
    if (data?.access_token) {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.access_token)}`,
        { method: "POST" },
      ).catch(() => {
        /* best-effort — a desconexão local acontece de qualquer forma */
      });
    }
    await supabaseAdmin.from("shared_calendar_connection").delete().eq("id", true);
    return { ok: true };
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

/** Token da conta ÚNICA e compartilhada (ex.: contato@vocenohype.com.br) —
 * dona de todos os eventos de reunião. Mesma lógica de refresh de
 * `getValidAccessToken`, só que lendo/gravando `shared_calendar_connection`
 * em vez de uma linha por usuário. */
async function getValidSharedAccessToken(admin: AdminClient): Promise<string | null> {
  const { data } = await admin
    .from("shared_calendar_connection")
    .select("access_token, refresh_token, token_expiry")
    .eq("id", true)
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
    console.warn("[google-calendar] shared refresh token failed", await res.text());
    return null;
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  const tokenExpiry = new Date(Date.now() + json.expires_in * 1000).toISOString();
  await admin
    .from("shared_calendar_connection")
    .update({
      access_token: json.access_token,
      token_expiry: tokenExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
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
  const attendeeIds = new Set([
    ...(m.participanteIds ?? []),
    ...(m.criadorId ? [m.criadorId] : []),
  ]);
  const internalAttendees = Array.from(attendeeIds)
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
    // Gera um link de Google Meet de verdade (a conta compartilhada tem
    // Meet Pro) — sem isso, "local"/"notas" eram só texto livre, nunca um
    // link de videochamada real criado pelo Google.
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

/** Sincroniza TODAS as reuniões (não só as do usuário que aciona) contra a
 * conta compartilhada — antes cada pessoa sincronizava só as próprias
 * reuniões contra a própria conta Google; agora existe uma única fonte de
 * verdade (contato@vocenohype.com.br) dona de todos os eventos. */
export const syncAllMeetingsToGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accessToken = await getValidSharedAccessToken(supabaseAdmin);
    if (!accessToken) return { synced: 0, connected: false as const };

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

    for (const m of meetings) {
      await syncOneMeeting(accessToken, m, emailById);
    }
    return { synced: meetings.length, connected: true as const };
  });

type GoogleEvent = {
  id: string;
  status?: string; // "confirmed" | "cancelled" | ...
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean }[];
  extendedProperties?: { private?: Record<string, string> };
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

async function listSharedGoogleEvents(accessToken: string): Promise<GoogleEvent[]> {
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
 * Google Calendar da conta compartilhada (sem o marcador
 * `vnhMeetingId` — esses já são donos de uma Reunião e são ignorados aqui)
 * viram Reunião na plataforma. Dedupe via `googleEventId` guardado na
 * própria Reunião; eventos editados/cancelados no Google atualizam a
 * Reunião já importada em vez de duplicar. */
export const importGoogleEventsToMeetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accessToken = await getValidSharedAccessToken(supabaseAdmin);
    if (!accessToken) return { imported: 0, updated: 0, connected: false as const };

    const { data: rows, error } = await supabaseAdmin.from("reunioes").select("id, data");
    if (error) throw new Error(error.message);

    const byGoogleEventId = new Map<
      string,
      {
        id: string;
        data: SlimMeeting & { googleEventId?: string; origem?: string; status: string };
      }
    >();
    for (const r of rows ?? []) {
      const m = r.data as SlimMeeting & { googleEventId?: string; origem?: string; status: string };
      if (m.googleEventId) byGoogleEventId.set(m.googleEventId, { id: r.id, data: m });
    }

    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, email");
    const idByEmail = new Map<string, string>();
    for (const p of profiles ?? []) if (p.email) idByEmail.set(p.email.toLowerCase(), p.id);

    const events = await listSharedGoogleEvents(accessToken);

    let imported = 0;
    let updated = 0;
    for (const event of events) {
      // Já é uma reunião da plataforma (foi a própria `syncOneMeeting` que
      // criou esse evento) — nunca reimportar de volta.
      if (event.extendedProperties?.private?.vnhMeetingId) continue;
      // Evento de dia inteiro (só `date`, sem `dateTime`) — Reunião sempre
      // tem hora, fora de escopo aqui.
      if (!event.start?.dateTime || !event.end?.dateTime) continue;

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

      const existing = byGoogleEventId.get(event.id);
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
        participanteIds,
        convidadosExternos,
        local: event.location ?? "",
        notas: event.description,
        status: "Confirmada",
        googleEventId: event.id,
        origem: "google",
      };
      const { error: insertError } = await supabaseAdmin
        .from("reunioes")
        .insert({ id: meeting.id, data: meeting });
      if (insertError) {
        console.warn("[google-calendar] import insert failed", insertError.message);
        continue;
      }
      imported++;
    }

    return { imported, updated, connected: true as const };
  });
