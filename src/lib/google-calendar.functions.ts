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
  seriesId?: string;
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
  origem?: string;
  /** Id do evento já criado no Google pra essa reunião — gravado na
   * primeira sincronização de saída e reutilizado depois, pra nunca mais
   * depender de buscar por `privateExtendedProperty` (esse filtro do
   * Google tem atraso de indexação: um evento recém-criado pode não
   * aparecer na busca por alguns ciclos, fazendo o sync pensar que não
   * existe e criar outro — duplicando o evento a cada ciclo). */
  googleEventId?: string;
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

/** Busca o evento do Google já criado pra essa reunião. Também
 * autocura duplicatas: se a mesma reunião foi criada mais de uma vez no
 * Google (ex: corrida entre 2 sessões sincronizando ao mesmo tempo, cada
 * uma sem ver ainda o evento que a outra estava criando), mantém só a
 * cópia mais antiga e apaga as demais — roda a cada ciclo de sync
 * (3min), então qualquer duplicata futura se autolimpa sozinha. */
async function findGoogleEventId(accessToken: string, meetingId: string): Promise<string | null> {
  const url = new URL(EVENTS_URL);
  url.searchParams.set("privateExtendedProperty", `vnhMeetingId=${meetingId}`);
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("orderBy", "updated");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const json = (await res.json()) as { items?: { id: string; created?: string }[] };
  const items = json.items ?? [];
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => (a.created ?? "").localeCompare(b.created ?? ""));
  const [keep, ...duplicates] = sorted;
  for (const dup of duplicates) {
    await fetch(`${EVENTS_URL}/${dup.id}?sendUpdates=all`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
  }
  return keep.id;
}

async function syncOneMeeting(
  admin: AdminClient,
  accessToken: string,
  m: SlimMeeting,
  emailById: Map<string, string>,
): Promise<void> {
  // Fonte de verdade é o id já gravado na própria reunião — nunca busca
  // por `privateExtendedProperty` quando já sabemos o id (esse filtro do
  // Google é eventualmente consistente e pode não achar um evento recém
  // criado, fazendo o sync recriar duplicado a cada ciclo). Só cai pra
  // busca (com autocura de duplicatas) em reuniões antigas que ainda não
  // tinham esse campo gravado.
  let existingId = m.googleEventId ?? null;
  if (existingId) {
    const check = await fetch(`${EVENTS_URL}/${existingId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (check.status === 404 || check.status === 410) existingId = null;
  } else {
    existingId = await findGoogleEventId(accessToken, m.id);
  }

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
    return;
  }
  if (!existingId) {
    const created = (await res.json()) as { id: string };
    await admin
      .from("reunioes")
      .update({ data: { ...m, googleEventId: created.id }, updated_at: new Date().toISOString() })
      .eq("id", m.id);
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
      // Reunião importada do Google (nasceu de lá, não na plataforma) —
      // reenviar pro Google criaria um evento duplicado, já que ela não
      // carrega o marcador vnhMeetingId no evento original.
      if (m.origem === "google") continue;
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
        await syncOneMeeting(supabaseAdmin, accessToken, m, emailById);
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
  /** Presente só em ocorrências de um evento recorrente — mesmo valor
   * (id do evento mestre da série) em toda ocorrência, então serve
   * direto como `Meeting.seriesId` sem precisar gerar nada: a plataforma
   * já sabe tratar "só esta / todas" sempre que `seriesId` é compartilhado. */
  recurringEventId?: string;
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

// Janela de tempo consultada em `listGoogleEvents` — compartilhada com o
// passo de "detectar evento excluído no Google" logo abaixo, pra só
// cancelar reuniões que de fato caberiam dentro dessa mesma busca.
const LIST_WINDOW_MS_BEFORE = 2 * 24 * 60 * 60_000;
const LIST_WINDOW_MS_AFTER = 120 * 24 * 60 * 60_000;

async function listGoogleEvents(accessToken: string): Promise<GoogleEvent[]> {
  const timeMin = new Date(Date.now() - LIST_WINDOW_MS_BEFORE).toISOString();
  const timeMax = new Date(Date.now() + LIST_WINDOW_MS_AFTER).toISOString();
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

    type ImportRow = SlimMeeting & {
      googleEventId?: string;
      origem?: string;
      status: string;
      meetLink?: string;
    };

    const byGoogleEventId = new Map<string, { id: string; data: ImportRow }>();
    // Segunda rede de segurança, além do marcador `vnhMeetingId`: casa por
    // criador+data+hora contra reuniões da própria plataforma que ainda não
    // têm `googleEventId` gravado. Existe porque já vimos o evento criado
    // por `syncOneMeeting` (que sempre grava o marcador) ser reimportado
    // como se fosse externo mesmo assim — sem essa rede, isso duplica a
    // reunião na plataforma além de já duplicar no Google.
    const byCreatorTime = new Map<string, { id: string; data: ImportRow }>();
    for (const r of rows ?? []) {
      const m = r.data as ImportRow;
      if (m.googleEventId) byGoogleEventId.set(m.googleEventId, { id: r.id, data: m });
      else if (m.origem !== "google" && m.criadorId) {
        byCreatorTime.set(`${m.criadorId}|${m.data}|${m.hora}`, { id: r.id, data: m });
      }
    }

    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, email");
    const idByEmail = new Map<string, string>();
    for (const p of profiles ?? []) if (p.email) idByEmail.set(p.email.toLowerCase(), p.id);

    let imported = 0;
    let updated = 0;
    let cancelled_ = 0;

    for (const conn of connections) {
      const accessToken = await getValidAccessToken(supabaseAdmin, conn);
      if (!accessToken) continue;
      const events = await listGoogleEvents(accessToken);
      // Ids vistos nesse ciclo pra essa conta — usado depois pra detectar
      // reuniões cujo evento sumiu do Google (excluído por lá, não só
      // cancelado) e cancelar do lado da plataforma também.
      const seen = new Set<string>();
      const listWindowStart = Date.now() - LIST_WINDOW_MS_BEFORE;
      const listWindowEnd = Date.now() + LIST_WINDOW_MS_AFTER;

      for (const event of events) {
        // Já é uma reunião da plataforma (foi a própria `syncOneMeeting`
        // que criou esse evento) — nunca reimportar de volta.
        if (event.extendedProperties?.private?.vnhMeetingId) continue;
        // Evento de dia inteiro (só `date`, sem `dateTime`) — Reunião
        // sempre tem hora, fora de escopo aqui.
        if (!event.start?.dateTime || !event.end?.dateTime) continue;

        // `id` é único por OCORRÊNCIA dentro da conta (o que precisamos
        // aqui) — `iCalUID` parecia mais robusto (mesmo evento, ids
        // diferentes em cada calendário de cada convidado), mas o Google
        // usa o MESMO `iCalUID` pra TODA ocorrência de uma recorrência.
        // Usar só `iCalUID` fazia cada ocorrência nova "atualizar" a
        // mesma linha em vez de criar uma por dia, sobrando só a última
        // ocorrência da janela. `id` também é o valor que precisamos pra
        // apagar o evento certo depois (exclusão espelhada), então vira
        // a única chave — dedupe entre contas conectadas diferentes pro
        // mesmo evento fica sem cobertura, uma perda aceitável perto do
        // bug que isso corrige.
        const dedupeKey = event.id;
        seen.add(dedupeKey);
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

        const byId = byGoogleEventId.get(dedupeKey);
        const byTime = byId ? undefined : byCreatorTime.get(`${conn.user_id}|${dataStr}|${hora}`);
        const existing = byId ?? byTime;
        const cancelled = event.status === "cancelled";

        if (existing) {
          // Casou só por criador+data+hora (`byTime`) — esse evento é a
          // própria reunião da plataforma sincronizada de saída, cujo
          // marcador não foi reconhecido por algum motivo. Só grava o id
          // do Google pra nunca mais duplicar; não deixa os campos do
          // Google (local/notas/participantes) sobrescreverem os da
          // plataforma, que já são a fonte de verdade aqui.
          const next = byTime
            ? { ...existing.data, googleEventId: dedupeKey }
            : {
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
                // Backfill pra reuniões importadas antes desse campo
                // existir — nunca troca um seriesId já gravado.
                seriesId: existing.data.seriesId ?? event.recurringEventId,
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
          seriesId: event.recurringEventId,
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

      // Reunião cujo evento foi de fato EXCLUÍDO no Google (não só
      // cancelado — exclusão não aparece como item "cancelled" numa
      // listagem sem syncToken, só some da lista) — cancela também na
      // plataforma. Só considera reuniões dentro da mesma janela de tempo
      // buscada (`listGoogleEvents`), pra não cancelar por engano algo que
      // nunca poderia aparecer nessa página de resultados.
      for (const [, row] of byGoogleEventId) {
        if (row.data.criadorId !== conn.user_id) continue;
        if (row.data.status === "Cancelada") continue;
        if (!row.data.googleEventId || seen.has(row.data.googleEventId)) continue;
        const start = new Date(`${row.data.data}T${row.data.hora}:00-03:00`).getTime();
        if (start < listWindowStart || start > listWindowEnd) continue;
        await supabaseAdmin
          .from("reunioes")
          .update({
            data: { ...row.data, status: "Cancelada" },
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        cancelled_++;
      }
    }

    return { imported, updated, cancelled: cancelled_, connected: true as const };
  });

/** Exclusão nos dois sentidos: excluir uma reunião na plataforma também
 * apaga o evento correspondente no Google (se o criador tiver conta
 * conectada) — sem isso, o evento ficava órfão no Google pra sempre.
 * Chamado pelo `ReunioesSection` logo após remover a(s) reunião(ões) do
 * estado local, com o `criadorId`/`googleEventId` de cada uma capturados
 * antes da remoção. Best-effort: falha aqui nunca deveria travar a
 * exclusão na plataforma, que já aconteceu. */
export const deleteGoogleEventsForMeetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { meetingId: string; criadorId?: string; googleEventId?: string }[]) => data)
  .handler(async ({ data: targets }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const byCreator = new Map<string, { meetingId: string; googleEventId?: string }[]>();
    for (const t of targets) {
      if (!t.criadorId) continue;
      const list = byCreator.get(t.criadorId) ?? [];
      list.push(t);
      byCreator.set(t.criadorId, list);
    }
    if (byCreator.size === 0) return { deleted: 0 };

    const { data: connections } = await supabaseAdmin
      .from("google_calendar_connections")
      .select("user_id, access_token, refresh_token, token_expiry")
      .in("user_id", Array.from(byCreator.keys()));

    let deleted = 0;
    for (const conn of connections ?? []) {
      const accessToken = await getValidAccessToken(supabaseAdmin, conn);
      if (!accessToken) continue;
      for (const t of byCreator.get(conn.user_id) ?? []) {
        // Já sabemos o id — apaga direto. Reunião antiga sem o campo
        // gravado ainda cai na busca por `vnhMeetingId` (que já limpa
        // qualquer duplicata que tenha sobrado, então uma exclusão aqui
        // remove todas as cópias de uma vez).
        const eventId = t.googleEventId ?? (await findGoogleEventId(accessToken, t.meetingId));
        if (!eventId) continue;
        await fetch(`${EVENTS_URL}/${eventId}?sendUpdates=all`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => {});
        deleted++;
      }
    }
    return { deleted };
  });
