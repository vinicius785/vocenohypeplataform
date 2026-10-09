import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  IMPORT_WINDOW_MS_AFTER,
  IMPORT_WINDOW_MS_BEFORE,
  decodeSyncToken,
  encodeSyncToken,
  importCutoffDate,
  pruneCutoffDate,
} from "@/lib/google-sync-window";
import {
  canonicalOriginRedirect,
  getGoogleOAuthRedirectUri,
  googleOAuthEnvTag,
  originOf,
} from "@/lib/google-oauth-config";
import {
  ensureAccessToken,
  type ConnectionTokenStore,
  type GoogleConnectionTokens,
  type RefreshOutcome,
} from "@/lib/google-token";
import {
  connectionsToMarkSynced,
  outboundResultFor,
  processEachConnection,
  summarizeOutcomes,
  type ConnectionResult,
} from "@/lib/google-sync-runner";
import { updateMeetingData, type MeetingStore } from "@/lib/google-meeting-write";
import { buildStateCookie } from "@/lib/google-oauth-state-cookie";
import type { StartGoogleOAuthResult } from "@/lib/google-connect-flow";

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

/** Só equipe interna (ou admin) usa a integração: contas do portal do cliente são `authenticated`
 * comuns na mesma chave anon, e este módulo grava em `reunioes` e usa tokens de terceiros. */
export async function isInternalOrAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const [{ data: admin, error: adminErr }, { data: internal, error: internalErr }] =
    await Promise.all([
      supabase.rpc("is_admin", { _user_id: userId }),
      supabase.rpc("is_internal_team_member", { _user_id: userId }),
    ]);
  if (adminErr) throw new Error(adminErr.message);
  if (internalErr) throw new Error(internalErr.message);
  return Boolean(admin) || Boolean(internal);
}

export const startGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StartGoogleOAuthResult> => {
    if (!(await isInternalOrAdmin(context.supabase, context.userId))) {
      return { ok: false, error: "forbidden" };
    }

    // Fora do domínio canônico (`APP_URL`), manda o navegador para lá ANTES de iniciar: o callback
    // volta pelo domínio canônico e a sessão do usuário vive por origem. A origem da página vem do
    // cabeçalho `Origin`/`Referer` (só comparada com `APP_URL`); o destino é origem canônica +
    // caminho fixo — nada fornecido pelo navegador entra na URL. (A `request.url` aqui é a da
    // própria server function, `/_serverFn/…`, e NÃO serve para isso.)
    const request = getRequest();
    const requestOrigin =
      originOf(request.headers.get("origin")) ?? originOf(request.headers.get("referer"));
    let redirectHome: string | null;
    try {
      redirectHome = canonicalOriginRedirect(requestOrigin);
    } catch {
      console.error("[google-oauth] start: APP_URL ausente/inválida", { env: googleOAuthEnvTag() });
      return { ok: false, error: "not_configured" };
    }
    if (redirectHome) {
      console.log("[google-oauth] start: domínio não-canônico, redirecionando", {
        env: googleOAuthEnvTag(),
      });
      return { ok: true, url: redirectHome };
    }

    let clientId: string;
    let redirectUri: string;
    try {
      ({ clientId } = requireGoogleEnv());
      redirectUri = getGoogleOAuthRedirectUri();
    } catch {
      console.error("[google-oauth] start: configuração ausente", { env: googleOAuthEnvTag() });
      return { ok: false, error: "not_configured" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = crypto.randomUUID();
    const { error } = await supabaseAdmin
      .from("google_oauth_states")
      .insert({ token, user_id: context.userId });
    if (error) {
      console.error("[google-oauth] start: falha ao gravar o state", { dbCode: error.code });
      return { ok: false, error: "unavailable" };
    }

    // Vincula este `state` ao navegador que iniciou (cookie HttpOnly, 10 min): o callback só aceita
    // quem trouxer o mesmo valor — outra pessoa que receba a URL de autorização não consegue concluir.
    setResponseHeader(
      "Set-Cookie",
      buildStateCookie(token, { secure: redirectUri.startsWith("https://") }),
    );

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: GOOGLE_SCOPE,
      state: token,
    });
    console.log("[google-oauth] start", { env: googleOAuthEnvTag(), redirectUri });
    return { ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  });

export const getGoogleConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("google_calendar_connections")
      .select("google_email, connected_at, last_synced_at, last_error, token_invalid")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!data) return { connected: false as const };
    return {
      connected: true as const,
      email: data.google_email,
      connectedAt: data.connected_at,
      lastSyncedAt: data.last_synced_at,
      needsReconnect: data.token_invalid,
      lastError: data.last_error,
    };
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

/** Lê TODAS as linhas de `reunioes` (o Supabase corta em ~1000 por consulta; a tabela tem milhares
 * de ocorrências importadas do Google). Sem paginar, a sincronização só enxergava as 1000 mais
 * antigas: não casava/atualizava as demais e podia reimportar ou perder reuniões novas. */
async function fetchAllReunioes(
  admin: AdminClient,
): Promise<{ id: string; data: Database["public"]["Tables"]["reunioes"]["Row"]["data"] }[]> {
  const PAGE = 1000;
  const out: { id: string; data: Database["public"]["Tables"]["reunioes"]["Row"]["data"] }[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await admin
      .from("reunioes")
      .select("id, data")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    from += data.length;
  }
  return out;
}

type GoogleConnectionRow = GoogleConnectionTokens;

/** Persistência da renovação via service role (só no servidor). */
function adminTokenStore(admin: AdminClient): ConnectionTokenStore {
  return {
    async saveRefreshed(userId, tokens) {
      const { error } = await admin
        .from("google_calendar_connections")
        .update({
          access_token: tokens.access_token,
          token_expiry: tokens.token_expiry,
          // Só troca o refresh_token quando o Google devolveu um novo; senão preserva o existente.
          ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : null),
          updated_at: new Date().toISOString(),
          token_invalid: false,
          last_error: null,
        })
        .eq("user_id", userId);
      return !error;
    },
    async markReauthRequired(userId, message) {
      const { error } = await admin
        .from("google_calendar_connections")
        .update({ token_invalid: true, last_error: message })
        .eq("user_id", userId);
      return !error;
    },
    async recordTransientError(userId, message) {
      const { error } = await admin
        .from("google_calendar_connections")
        .update({ last_error: message })
        .eq("user_id", userId);
      return !error;
    },
  };
}

/** Token válido da conta pessoal da conexão — renova via refresh_token quando perto de expirar.
 * Nunca lança: o desfecho (ok / reautorização / falha temporária) vem tipado. */
async function getValidAccessToken(
  admin: AdminClient,
  row: GoogleConnectionRow,
): Promise<RefreshOutcome> {
  let creds: { clientId: string; clientSecret: string };
  try {
    creds = requireGoogleEnv();
  } catch {
    return { kind: "transient", reason: "config", recorded: false };
  }
  return ensureAccessToken(
    {
      fetch,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      store: adminTokenStore(admin),
      log: (event, meta) => console.warn(`[google-calendar] ${event}`, meta),
    },
    row,
  );
}

function connectionResultFor(outcome: RefreshOutcome): ConnectionResult | null {
  if (outcome.kind === "ok") return null;
  return outcome.kind === "reauth_required" ? "reauth_required" : "transient";
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
  /** Link do Google Meet gerado pro evento — nasce vazio (`syncOneMeeting`
   * cria o evento sem esperar a resposta trazer o link antes desse campo
   * existir) e antes ficava vazio pra sempre: o import de entrada pula de
   * propósito qualquer evento com `vnhMeetingId` (pra não reimportar como
   * duplicata), então nunca havia uma segunda chance de capturar o link.
   * Agora `syncOneMeeting` também lê e grava esse campo, tanto na criação
   * quanto em toda atualização seguinte (auto-cura reuniões antigas). */
  meetLink?: string;
  googleHtmlLink?: string;
  googleCalendarId?: string;
  recurringEventId?: string;
  etag?: string;
  googleUpdatedAt?: string;
  syncStatus?: "synced" | "pending" | "error";
  lastSyncedAt?: string;
  lastSyncError?: string;
  /** Quando a última TENTATIVA (com sucesso ou não) rodou — diferente de
   * `lastSyncedAt`, que só avança em sucesso. Usado só pro backoff de
   * `shouldSkipSyncDueToBackoff`. */
  lastSyncAttemptAt?: string;
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

// Fase 6, "retentativas seguras": depois de uma falha, espera pelo menos
// esse tanto antes de tentar de novo a MESMA reunião — sem isso, um erro
// persistente (ex: token realmente revogado, evento rejeitado pelo Google
// por dado inválido) faria o disparo imediato de cada edição (debounce de
// 1.5s em `ReunioesSection.tsx`) bater na API do Google a cada poucos
// segundos, sem chance de o problema real (reconectar a conta, corrigir o
// dado) ser resolvido entre uma tentativa e outra. Não impede sync novo pra
// OUTRAS reuniões da mesma conta — só evita martelar a que já sabemos que
// está falhando.
const SYNC_RETRY_BACKOFF_MS = 60_000;

export function shouldSkipSyncDueToBackoff(
  m: Pick<SlimMeeting, "syncStatus" | "lastSyncAttemptAt">,
  now: number = Date.now(),
): boolean {
  if (m.syncStatus !== "error" || !m.lastSyncAttemptAt) return false;
  return now - new Date(m.lastSyncAttemptAt).getTime() < SYNC_RETRY_BACKOFF_MS;
}

/** Leitura/escrita de `reunioes` com condição por `updated_at` (ver `google-meeting-write.ts`). */
function adminMeetingStore(admin: AdminClient): MeetingStore {
  return {
    async read(id) {
      const { data, error } = await admin
        .from("reunioes")
        .select("data, updated_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("read_failed");
      return data
        ? { data: data.data as Record<string, unknown>, updated_at: data.updated_at }
        : null;
    },
    async writeIfUnchanged(id, data, expectedUpdatedAt) {
      const { data: rows, error } = await admin
        .from("reunioes")
        .update({ data: data as never })
        .eq("id", id)
        .eq("updated_at", expectedUpdatedAt)
        .select("id");
      if (error) return "error";
      return (rows?.length ?? 0) > 0 ? "written" : "conflict";
    },
  };
}

/** Aplica só os campos de sincronização sobre a versão fresca (`undefined` remove a chave). */
export function applySyncPatch(
  fresh: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...fresh };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete out[key];
    else out[key] = value;
  }
  return out;
}

async function syncOneMeeting(
  admin: AdminClient,
  accessToken: string,
  m: SlimMeeting,
  emailById: Map<string, string>,
): Promise<"synced" | "skipped" | "failed"> {
  if (shouldSkipSyncDueToBackoff(m)) return "skipped";

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
    return "synced";
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
    const errBody = await res.text();
    console.warn(`[google-calendar] sync failed for meeting ${m.id}`, res.status);
    // Persiste o estado de erro na própria reunião (Fase 2) — antes só ia
    // pro log do servidor, então a única forma de saber que uma reunião
    // específica parou de sincronizar era vasculhar logs do Vercel. Corta
    // a mensagem: nunca deve conter token/secret, mas o corpo bruto do
    // Google pode ser longo (ex.: HTML de erro) e não precisa ser guardado
    // inteiro pra ser útil.
    // Só os campos de sincronização, sobre a versão FRESCA da reunião (não sobrescreve edições
    // feitas pelo usuário depois que o ciclo leu a lista).
    await updateMeetingData(adminMeetingStore(admin), m.id, (fresh) =>
      applySyncPatch(fresh, {
        syncStatus: "error",
        lastSyncError: `Falha ao sincronizar com o Google (HTTP ${res.status}): ${errBody.slice(0, 300)}`,
        lastSyncAttemptAt: new Date().toISOString(),
      }),
    );
    return "failed";
  }
  // A resposta do POST/PATCH já traz o evento completo, incluindo o link
  // do Google Meet gerado (`hangoutLink`) — antes só o `id` era lido daqui,
  // então o link nunca chegava a ser salvo na reunião (ficava "preso" só
  // no Google, o join na plataforma nunca funcionava pra reuniões criadas
  // por ela). Roda em toda sincronização, não só na criação, pra também
  // auto-curar reuniões antigas que já sincronizaram sem capturar o link.
  const synced = (await res.json()) as {
    id: string;
    etag?: string;
    hangoutLink?: string;
    htmlLink?: string;
  };
  // Só os campos de sincronização, sobre a versão fresca da reunião (ver `applySyncPatch`).
  const nowIso = new Date().toISOString();
  const written = await updateMeetingData(adminMeetingStore(admin), m.id, (fresh) =>
    applySyncPatch(fresh, {
      ...(existingId ? null : { googleEventId: synced.id }),
      ...(synced.hangoutLink && synced.hangoutLink !== m.meetLink
        ? { meetLink: synced.hangoutLink }
        : null),
      ...(synced.htmlLink ? { googleHtmlLink: synced.htmlLink } : null),
      googleCalendarId: "primary",
      etag: synced.etag,
      syncStatus: "synced",
      lastSyncedAt: nowIso,
      lastSyncAttemptAt: nowIso,
      lastSyncError: undefined,
    }),
  );
  if (written === "conflict" || written === "error") {
    // O evento no Google já foi criado/atualizado, mas o registro local não pôde ser gravado sem
    // arriscar sobrescrever uma edição concorrente: conta como falha desta reunião e a próxima
    // rodada tenta de novo (o evento é reencontrado pelo marcador, sem duplicar).
    console.warn("[google-calendar] não foi possível gravar o resultado da sincronização", {
      result: written,
    });
    return "failed";
  }
  return "synced";
}

/** Sincroniza cada reunião contra a conta Google PESSOAL de quem a criou
 * (`criadorId`) — reuniões cujo criador não tem conta conectada são
 * puladas silenciosamente.
 *
 * Função "crua" (sem `createServerFn`/`requireSupabaseAuth`) pra poder ser
 * chamada tanto pelo server function abaixo (sessão de usuário logado)
 * quanto pelo endpoint de cron (`api/cron/google-calendar-sync.ts`, sem
 * nenhuma sessão — só o segredo do cron). Fase A da reconstrução: antes só
 * rodava via `setInterval` de 3min NO NAVEGADOR (`_authenticated/route.tsx`)
 * — sem nenhuma aba aberta, a sincronização simplesmente não acontecia,
 * nunca, em nenhum sentido. */
type OutboundDetail = {
  result: {
    synced: number;
    failedMeetings: number;
    connected: boolean;
    connections: ReturnType<typeof summarizeOutcomes>;
  };
  /** Por conexão — só uso interno (ids de usuário nunca saem do servidor). */
  outcomes: Map<string, ConnectionResult>;
};

async function runOutbound(): Promise<OutboundDetail> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: connections } = await supabaseAdmin
    .from("google_calendar_connections")
    .select("user_id, access_token, refresh_token, token_expiry, token_invalid");
  if (!connections || connections.length === 0) {
    return {
      result: {
        synced: 0,
        failedMeetings: 0,
        connected: false,
        connections: summarizeOutcomes(new Map()),
      },
      outcomes: new Map(),
    };
  }

  const rows = await fetchAllReunioes(supabaseAdmin);
  const meetings = rows.map((r) => r.data as SlimMeeting);

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
  let failedMeetings = 0;
  // Uma exceção ou falha de renovação de UM usuário nunca interrompe os demais.
  const outcomes = await processEachConnection(
    connections,
    async (conn) => {
      const creatorMeetings = meetingsByCreator.get(conn.user_id);
      if (!creatorMeetings || creatorMeetings.length === 0) return "skipped";
      const token = await getValidAccessToken(supabaseAdmin, conn);
      if (token.kind !== "ok") return connectionResultFor(token)!;
      const counts = { synced: 0, failed: 0 };
      for (const m of creatorMeetings) {
        const res = await syncOneMeeting(supabaseAdmin, token.accessToken, m, emailById);
        if (res === "synced") counts.synced++;
        else if (res === "failed") counts.failed++;
      }
      synced += counts.synced;
      failedMeetings += counts.failed;
      // total (ok) / parcial (partial) / falha total (transient: NÃO conta como sincronizada)
      return outboundResultFor(counts);
    },
    (errorName) =>
      console.warn("[google-calendar] outbound: falha isolada numa conexão", errorName),
  );
  return {
    result: {
      synced,
      failedMeetings,
      connected: true,
      connections: summarizeOutcomes(outcomes),
    },
    outcomes,
  };
}

export async function runSyncAllMeetingsToGoogle() {
  return (await runOutbound()).result;
}

/** Resposta para quem não é equipe interna/admin: nada é executado (sem erro, para não gerar ruído
 * em sessões que disparam o polling). */
const FORBIDDEN_SYNC = { ran: false as const, forbidden: true as const };

export const syncAllMeetingsToGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isInternalOrAdmin(context.supabase, context.userId))) return FORBIDDEN_SYNC;
    // Mesma trava do ciclo automático: nunca em paralelo com cron/polling/outro disparo manual.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return runWithSyncLock(supabaseAdmin, () => runSyncAllMeetingsToGoogle());
  });

type GoogleEvent = {
  id: string;
  etag?: string;
  /** RFC3339 — quando o Google processou a última mudança neste evento
   * (não confundir com o horário do compromisso). Comparado junto do
   * `etag` antes de aceitar uma versão importada como mais nova que uma
   * edição local ainda não sincronizada. */
  updated?: string;
  iCalUID?: string;
  status?: string; // "confirmed" | "cancelled" | ...
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: {
    email?: string;
    displayName?: string;
    self?: boolean;
    /** RSVP do convidado: "accepted" | "declined" | "tentative" |
     * "needsAction". Usado só pra refletir resposta em eventos que a
     * própria plataforma criou (Fase 6) — ver `applyGoogleAttendeeResponses`. */
    responseStatus?: string;
  }[];
  extendedProperties?: { private?: Record<string, string> };
  hangoutLink?: string;
  htmlLink?: string;
  /** Presente só em ocorrências de um evento recorrente — mesmo valor
   * (id do evento mestre da série) em toda ocorrência, então serve
   * direto como `Meeting.seriesId` sem precisar gerar nada: a plataforma
   * já sabe tratar "só esta / todas" sempre que `seriesId` é compartilhado. */
  recurringEventId?: string;
};

/** `true` quando o evento vindo do Google é byte-a-byte o mesmo que já
 * está gravado (mesmo `etag`) — pula o UPDATE por completo, tanto por
 * eficiência quanto pra nunca arriscar sobrescrever um campo editado
 * localmente entre o momento em que o Google respondeu e agora. Exportada
 * pra ser testável sem precisar simular todo `runImportGoogleEventsToMeetings`. */
export function shouldSkipGoogleImportOverwrite(
  existingEtag: string | undefined,
  incomingEtag: string | undefined,
): boolean {
  return Boolean(existingEtag && incomingEtag && existingEtag === incomingEtag);
}

/** Fase 6, "respostas dos participantes": reflete o RSVP dos convidados de
 * um evento criado PELA PLATAFORMA (marcado com `vnhMeetingId`, enviado por
 * e-mail via `syncOneMeeting`) de volta em `confirmedBy`/`declinedBy` — sem
 * isso, alguém que respondesse ao convite direto no Gmail/Google Agenda
 * (em vez de usar os botões Confirmar/Recusar na plataforma) nunca via essa
 * resposta refletida aqui, e a plataforma continuava marcando a pessoa como
 * "pendente" pra sempre. Só toca esses dois campos — a plataforma continua
 * sendo a fonte de verdade pra todo o resto do evento (título, horário,
 * local etc.), então isso roda mesmo em eventos que a importação normal
 * pula de propósito (`vnhMeetingId` presente). Retorna `null` quando nada
 * mudou (nenhum convidado com conta na plataforma respondeu de forma nova),
 * pra quem chama não gravar um UPDATE à toa. */
export function applyGoogleAttendeeResponses<
  M extends { confirmedBy?: string[]; declinedBy?: string[] },
>(
  meeting: M,
  attendees: { email?: string; responseStatus?: string; self?: boolean }[] | undefined,
  idByEmail: Map<string, string>,
): M | null {
  if (!attendees || attendees.length === 0) return null;
  let confirmedBy = meeting.confirmedBy ?? [];
  let declinedBy = meeting.declinedBy ?? [];
  let changed = false;
  for (const a of attendees) {
    // `self` é a própria conta Google usada pra enviar o convite (o
    // organizador/criador na plataforma) — nunca um convidado de verdade.
    if (!a.email || a.self) continue;
    const uid = idByEmail.get(a.email.toLowerCase());
    if (!uid) continue; // convidado externo, sem conta na plataforma — nada a refletir aqui
    if (a.responseStatus === "accepted" && !confirmedBy.includes(uid)) {
      confirmedBy = [...confirmedBy, uid];
      declinedBy = declinedBy.filter((id) => id !== uid);
      changed = true;
    } else if (a.responseStatus === "declined" && !declinedBy.includes(uid)) {
      declinedBy = [...declinedBy, uid];
      confirmedBy = confirmedBy.filter((id) => id !== uid);
      changed = true;
    }
    // "needsAction"/"tentative" (ou ausente) — nunca regride uma resposta
    // explícita já registrada só por causa de um estado ambíguo do Google.
  }
  if (!changed) return null;
  return { ...meeting, confirmedBy, declinedBy };
}

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
const LIST_WINDOW_MS_BEFORE = IMPORT_WINDOW_MS_BEFORE;
const LIST_WINDOW_MS_AFTER = IMPORT_WINDOW_MS_AFTER;

type ListGoogleEventsResult = {
  events: GoogleEvent[];
  /** `null` quando nenhuma página trouxe um token novo (não deveria
   * acontecer numa listagem bem-sucedida, mas nunca sobrescreve o token
   * salvo com `null` por engano — só grava quando um valor real chega). */
  nextSyncToken: string | null;
  /** `true` só quando o Google respondeu `410 Gone` pro `syncToken`
   * enviado — o token antigo não serve mais, quem chamou precisa
   * invalidar e refazer uma sincronização completa (item 6 do pedido). */
  tokenInvalid: boolean;
  /** `true` quando a listagem NÃO foi concluída (erro HTTP ≠ 410 ou falha de rede): `events` pode
   * estar parcial e a conexão não conta como sincronizada neste ciclo. */
  failed: boolean;
};

/** Fase C: sincronização incremental de verdade. Com `syncToken`, pede só
 * o que mudou desde a última chamada (criação, edição, cancelamento) em
 * vez de relistar a janela inteira do zero a cada ciclo. `showDeleted:
 * true` faz até exclusões de verdade (não só cancelamentos) aparecerem
 * como um item `status: "cancelled"` — dispensa o diff manual "sumiu da
 * lista" que existia antes disso. Sem `syncToken` (primeira vez, ou
 * depois de um 410), cai pra uma listagem completa da janela
 * configurada, da qual a ÚLTIMA página já traz o primeiro
 * `nextSyncToken` pra usar dali em diante. */
async function listGoogleEvents(
  accessToken: string,
  syncToken: string | null,
): Promise<ListGoogleEventsResult> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  for (let page = 0; page < 10; page++) {
    const url = new URL(EVENTS_URL);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("maxResults", "250");
    // syncToken só na primeira página — páginas seguintes usam só
    // pageToken. O Google rejeita timeMin/timeMax/orderBy junto de
    // syncToken, então esses só entram quando não há token nenhum.
    if (syncToken && !pageToken) {
      url.searchParams.set("syncToken", syncToken);
    } else if (!syncToken) {
      url.searchParams.set("timeMin", new Date(Date.now() - LIST_WINDOW_MS_BEFORE).toISOString());
      url.searchParams.set("timeMax", new Date(Date.now() + LIST_WINDOW_MS_AFTER).toISOString());
    }
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch {
      console.warn("[google-calendar] events.list: falha de rede");
      return { events, nextSyncToken: null, tokenInvalid: false, failed: true };
    }
    if (res.status === 410) {
      return { events: [], nextSyncToken: null, tokenInvalid: true, failed: false };
    }
    if (!res.ok) {
      // Só o status: o corpo do erro do Google não é registrado.
      console.warn("[google-calendar] events.list failed", res.status);
      return { events, nextSyncToken: null, tokenInvalid: false, failed: true };
    }
    const json = (await res.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    events.push(...(json.items ?? []));
    if (json.nextSyncToken) nextSyncToken = json.nextSyncToken;
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return { events, nextSyncToken, tokenInvalid: false, failed: false };
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
type InboundDetail = {
  result: {
    imported: number;
    updated: number;
    cancelled: number;
    pruned: number;
    connected: boolean;
    connections: ReturnType<typeof summarizeOutcomes>;
  };
  outcomes: Map<string, ConnectionResult>;
};

async function runInbound(): Promise<InboundDetail> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: connections } = await supabaseAdmin
    .from("google_calendar_connections")
    .select("user_id, access_token, refresh_token, token_expiry, token_invalid, sync_token");
  if (!connections || connections.length === 0)
    return {
      result: {
        imported: 0,
        updated: 0,
        cancelled: 0,
        pruned: 0,
        connected: false,
        connections: summarizeOutcomes(new Map()),
      },
      outcomes: new Map(),
    };

  const rows = await fetchAllReunioes(supabaseAdmin);
  const importCutoff = importCutoffDate();

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

  // Uma exceção ou falha de renovação de UM usuário nunca interrompe os demais.
  const outcomes = await processEachConnection(
    connections,
    async (conn) => {
      const token = await getValidAccessToken(supabaseAdmin, conn);
      if (token.kind !== "ok") return connectionResultFor(token)!;
      const accessToken = token.accessToken;

      let { events, nextSyncToken, tokenInvalid, failed } = await listGoogleEvents(
        accessToken,
        decodeSyncToken(conn.sync_token),
      );
      if (tokenInvalid) {
        // Fase C, item 6 do pedido: 410 Gone — o syncToken antigo não serve
        // mais (expirou por inatividade, ou o calendário mudou demais). Log
        // de recuperação, limpa o token salvo e refaz uma sincronização
        // completa — nunca duplica, porque o dedupe por `googleEventId`
        // (abaixo) é o mesmo em qualquer modo.
        console.warn(
          `[google-calendar] syncToken expirado (410) pra ${conn.user_id} — refazendo sincronização completa`,
        );
        await supabaseAdmin
          .from("google_calendar_connections")
          .update({ sync_token: null })
          .eq("user_id", conn.user_id);
        ({ events, nextSyncToken, tokenInvalid, failed } = await listGoogleEvents(
          accessToken,
          null,
        ));
      }

      for (const event of events) {
        // Já é uma reunião da plataforma (foi a própria `syncOneMeeting` que
        // criou esse evento) — nunca reimportar de volta, mas ainda assim
        // reflete a resposta RSVP dos convidados (Fase 6): é a única chance
        // de capturar alguém que respondeu direto no Gmail/Google Agenda em
        // vez de usar os botões Confirmar/Recusar na plataforma.
        const ownMeetingId = event.extendedProperties?.private?.vnhMeetingId;
        if (ownMeetingId) {
          // Relê e aplica sobre a versão fresca (concorrência otimista, retry limitado).
          await updateMeetingData(adminMeetingStore(supabaseAdmin), ownMeetingId, (fresh) =>
            applyGoogleAttendeeResponses(
              fresh as { confirmedBy?: string[]; declinedBy?: string[] },
              event.attendees,
              idByEmail,
            ),
          );
          continue;
        }
        // Evento de dia inteiro (só `date`, sem `dateTime`) — Reunião
        // sempre tem hora, fora de escopo aqui. Também é o formato de um
        // tombstone de exclusão (`showDeleted`) de um evento que nunca
        // tinha `dateTime` pra começo — nada a fazer aqui de qualquer jeito.
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
          // Etag inalterado desde a última importação — o Google não tem
          // nada de novo pra este evento. Pula o UPDATE por completo: além
          // de economizar uma escrita à toa a cada ciclo, evita o risco de
          // sobrescrever um campo editado localmente entre duas leituras
          // (comparação pedida explicitamente — nunca aceitar uma versão do
          // Google sem checar se ela é realmente mais nova que a gravada).
          if (!byTime && shouldSkipGoogleImportOverwrite(existing.data.etag, event.etag)) {
            continue;
          }
          // Casou só por criador+data+hora (`byTime`) — esse evento é a
          // própria reunião da plataforma sincronizada de saída, cujo
          // marcador não foi reconhecido por algum motivo. Só grava o id
          // do Google pra nunca mais duplicar; não deixa os campos do
          // Google (local/notas/participantes) sobrescreverem os da
          // plataforma, que já são a fonte de verdade aqui.
          const buildNext = (base: ImportRow): ImportRow =>
            byTime
              ? { ...base, googleEventId: dedupeKey }
              : {
                  ...base,
                  titulo: event.summary || base.titulo,
                  data: dataStr,
                  hora,
                  duracao,
                  local: event.location,
                  notas: event.description,
                  participanteIds,
                  convidadosExternos,
                  meetLink: event.hangoutLink,
                  googleHtmlLink: event.htmlLink,
                  // Backfill pra reuniões importadas antes desse campo
                  // existir — nunca troca um seriesId já gravado.
                  seriesId: base.seriesId ?? event.recurringEventId,
                  recurringEventId: event.recurringEventId,
                  googleCalendarId: "primary",
                  etag: event.etag,
                  googleUpdatedAt: event.updated,
                  syncStatus: "synced",
                  lastSyncedAt: new Date().toISOString(),
                  lastSyncError: undefined,
                  status: cancelled ? "Cancelada" : (base.status ?? "Confirmada"),
                };
          if (JSON.stringify(buildNext(existing.data)) !== JSON.stringify(existing.data)) {
            // Aplicado sobre a versão FRESCA da reunião: campos locais (presença, confirmações,
            // edições do usuário) feitos depois da leitura do ciclo não são perdidos.
            const result = await updateMeetingData(
              adminMeetingStore(supabaseAdmin),
              existing.id,
              (fresh) => buildNext(fresh as ImportRow) as unknown as Record<string, unknown>,
            );
            if (result === "written") {
              if (cancelled && existing.data.status !== "Cancelada") cancelled_++;
              else updated++;
            } else if (result === "conflict" || result === "error") {
              console.warn("[google-calendar] import: reunião não atualizada neste ciclo", {
                result,
              });
            }
          }
          continue;
        }

        if (cancelled) continue; // nunca vimos esse evento — nada a importar
        // Fora da janela (além de 45 dias): não importa — entra sozinho quando chegar perto.
        if (dataStr > importCutoff) continue;

        const meeting = {
          id: crypto.randomUUID(),
          seriesId: event.recurringEventId,
          recurringEventId: event.recurringEventId,
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
          googleHtmlLink: event.htmlLink,
          status: "Confirmada",
          googleEventId: dedupeKey,
          googleCalendarId: "primary",
          etag: event.etag,
          googleUpdatedAt: event.updated,
          syncStatus: "synced" as const,
          lastSyncedAt: new Date().toISOString(),
          origem: "google",
        };
        const { error: insertError } = await supabaseAdmin
          .from("reunioes")
          .insert({ id: meeting.id, data: meeting });
        if (insertError) {
          // 23505 = violação do índice único em googleEventId — outro
          // ciclo de sync concorrente (rodando em paralelo, ex: 2 abas
          // abertas) já importou essa mesma ocorrência entre a checagem
          // e esse INSERT. Não é falha nenhuma, só perdeu a corrida —
          // nunca loga como erro nem duplica.
          if (insertError.code !== "23505") {
            console.warn("[google-calendar] import insert failed", insertError.message);
          }
          continue;
        }
        // Evita reimportar de novo no mesmo ciclo se o mesmo evento
        // aparecer no calendário de outro convidado também conectado.
        byGoogleEventId.set(dedupeKey, { id: meeting.id, data: meeting });
        imported++;
      }

      // Fase C: com `showDeleted: true` (`listGoogleEvents`), uma exclusão
      // de verdade no Google já chega aqui como um item comum com
      // `status: "cancelled"` — tratado pelo `if (existing) {...}` acima
      // igual a um cancelamento normal. Não precisa mais de um diff manual
      // "sumiu da lista" separado (o que também dependia da listagem ser
      // sempre a janela inteira, incompatível com sincronização
      // incremental por `syncToken`).
      // Listagem incompleta (erro/rede/410 repetido): não guarda o token incremental e não conta
      // como sincronização desta conexão — a próxima rodada tenta de novo, sem duplicar.
      if (failed || tokenInvalid) return "transient";
      if (nextSyncToken) {
        await supabaseAdmin
          .from("google_calendar_connections")
          .update({ sync_token: encodeSyncToken(nextSyncToken) })
          .eq("user_id", conn.user_id);
      }
      return "ok";
    },
    (errorName) => console.warn("[google-calendar] inbound: falha isolada numa conexão", errorName),
  );

  // Limpeza: importados do Google MUITO à frente (de quando a janela era de 120 dias) são só
  // espelhos regeneráveis — apaga para enxugar a tabela. Nunca toca em reunião criada na plataforma.
  const { count: pruned, error: pruneError } = await supabaseAdmin
    .from("reunioes")
    .delete({ count: "exact" })
    .filter("data->>origem", "eq", "google")
    .gt("data->>data", pruneCutoffDate());
  if (pruneError)
    console.warn("[google-calendar] limpeza de importados distantes falhou", pruneError.message);

  return {
    result: {
      imported,
      updated,
      cancelled: cancelled_,
      pruned: pruned ?? 0,
      connected: true,
      connections: summarizeOutcomes(outcomes),
    },
    outcomes,
  };
}

export async function runImportGoogleEventsToMeetings() {
  return (await runInbound()).result;
}

export const importGoogleEventsToMeetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isInternalOrAdmin(context.supabase, context.userId))) return FORBIDDEN_SYNC;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return runWithSyncLock(supabaseAdmin, () => runImportGoogleEventsToMeetings());
  });

/**
 * Quais eventos do Google a exclusão de reunião pode apagar. O pedido traz `criadorId` e
 * `googleEventId` vindos do navegador e a reunião já foi removida do banco (não dá para conferir o
 * par), então a regra é verificada NO EVENTO, que é a fonte confiável:
 * - evento criado pela plataforma (`vnhMeetingId` = a reunião excluída) → permitido;
 * - evento com `vnhMeetingId` de OUTRA reunião → nunca;
 * - evento sem marcador (importado: nasceu no Google do próprio dono) → só o dono da conta ou admin.
 */
export function canDeleteGoogleEvent(input: {
  eventMarker: string | undefined;
  meetingId: string;
  requesterId: string;
  calendarOwnerId: string;
  requesterIsAdmin: boolean;
}): boolean {
  if (input.eventMarker) return input.eventMarker === input.meetingId;
  return input.requesterIsAdmin || input.requesterId === input.calendarOwnerId;
}

const DeleteGoogleEventsInput = z
  .array(
    z.object({
      meetingId: z.string().uuid(),
      criadorId: z.string().uuid().optional(),
      // IDs de evento do Google são curtos; o limite evita payloads abusivos.
      googleEventId: z
        .string()
        .min(1)
        .max(256)
        .regex(/^[A-Za-z0-9_\-@.]+$/)
        .optional(),
    }),
  )
  .max(200);

/** Exclusão nos dois sentidos: excluir uma reunião na plataforma também
 * apaga o evento correspondente no Google (se o criador tiver conta
 * conectada) — sem isso, o evento ficava órfão no Google pra sempre.
 * Chamado pelo `ReunioesSection` logo após remover a(s) reunião(ões) do
 * estado local, com o `criadorId`/`googleEventId` de cada uma capturados
 * antes da remoção. Best-effort: falha aqui nunca deveria travar a
 * exclusão na plataforma, que já aconteceu.
 *
 * Correção de segurança (auditoria): o `.validator` antes era só uma
 * assinatura de tipo (sem checagem em runtime), e a função nunca
 * verificava permissão nenhuma — qualquer sessão autenticada podia
 * montar um payload arbitrário (`criadorId` de outra pessoa +
 * `googleEventId` adivinhado/observado) e a função usaria o TOKEN GOOGLE
 * daquele outro usuário pra apagar um evento do calendário dele. Não dá
 * pra validar o par (meetingId, criadorId) contra a tabela `reunioes`
 * aqui porque a reunião já foi apagada do banco ANTES desta chamada (ver
 * comentário de `cleanupGoogleEvents` em `ReunioesSection.tsx` — é
 * limpeza best-effort pós-exclusão). A mitigação possível sem quebrar o
 * fluxo real é exigir a mesma permissão `'reunioes'` (ou admin) já usada
 * pra excluir reuniões — limita quem pode sequer chamar esta function a
 * quem já tem acesso legítimo ao domínio de Reuniões. */
export const deleteGoogleEventsForMeetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => DeleteGoogleEventsInput.parse(raw))
  .handler(async ({ context, data: targets }) => {
    const [{ data: isAdmin, error: adminError }, { data: hasPerm, error: permError }] =
      await Promise.all([
        context.supabase.rpc("is_admin", { _user_id: context.userId }),
        context.supabase.rpc("has_permission", {
          _user_id: context.userId,
          _permission: "reunioes",
        }),
      ]);
    if (adminError) throw new Error(adminError.message);
    if (permError) throw new Error(permError.message);
    if (!isAdmin && !hasPerm) {
      throw new Error("Sem permissão para gerenciar eventos de reuniões.");
    }
    // Além da permissão: só equipe interna (contas do portal do cliente nunca chegam aqui).
    if (!(await isInternalOrAdmin(context.supabase, context.userId))) {
      throw new Error("Sem permissão para gerenciar eventos de reuniões.");
    }

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
      .select("user_id, access_token, refresh_token, token_expiry, token_invalid")
      .in("user_id", Array.from(byCreator.keys()));

    let deleted = 0;
    for (const conn of connections ?? []) {
      const token = await getValidAccessToken(supabaseAdmin, conn);
      if (token.kind !== "ok") continue;
      const accessToken = token.accessToken;
      for (const t of byCreator.get(conn.user_id) ?? []) {
        // Já sabemos o id — apaga direto. Reunião antiga sem o campo
        // gravado ainda cai na busca por `vnhMeetingId` (que já limpa
        // qualquer duplicata que tenha sobrado, então uma exclusão aqui
        // remove todas as cópias de uma vez).
        let eventId: string | null = null;
        if (t.googleEventId) {
          // Confere no PRÓPRIO evento (ver `canDeleteGoogleEvent`) antes de apagar o que o
          // navegador pediu: nada fora da reunião excluída é tocado.
          const check = await fetch(`${EVENTS_URL}/${encodeURIComponent(t.googleEventId)}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }).catch(() => null);
          if (!check || !check.ok) continue;
          const event = (await check.json().catch(() => null)) as {
            extendedProperties?: { private?: Record<string, string> };
          } | null;
          const allowed = canDeleteGoogleEvent({
            eventMarker: event?.extendedProperties?.private?.vnhMeetingId,
            meetingId: t.meetingId,
            requesterId: context.userId,
            calendarOwnerId: conn.user_id,
            requesterIsAdmin: Boolean(isAdmin),
          });
          if (!allowed) {
            console.warn("[google-calendar] exclusão de evento negada", { reason: "not_owned" });
            continue;
          }
          eventId = t.googleEventId;
        } else {
          // Busca por `vnhMeetingId`: só encontra eventos criados pela plataforma para essa reunião.
          eventId = await findGoogleEventId(accessToken, t.meetingId);
        }
        if (!eventId) continue;
        await fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => {});
        deleted++;
      }
    }
    return { deleted };
  });

/** Trava de concorrência (Fase A) — linha única (`id = true`, mesmo padrão
 * singleton de `shared_calendar_connection`, já removida). Sem ela, os
 * múltiplos disparadores que agora existem (cron externo a cada 5-10min,
 * cron diário da Vercel como rede de segurança, disparo imediato ao
 * criar/editar/excluir reunião, polling do navegador mantido como reforço)
 * podiam rodar ao mesmo tempo e duplicar evento no Google — antes só
 * existia UM disparador (o setInterval do navegador), então isso nunca
 * tinha sido um problema de verdade. `UPDATE ... WHERE` é atômico no
 * Postgres: só uma chamada concorrente ganha a corrida (as outras recebem
 * 0 linhas afetadas), sem precisar de lock explícito nenhum. Trava
 * considerada "presa" (processo anterior morreu sem liberar) depois de 4
 * minutos — se autocura sozinha, nunca fica travada pra sempre. */
const SYNC_LOCK_STALE_AFTER_MS = 4 * 60_000;

async function acquireSyncLock(admin: AdminClient): Promise<boolean> {
  const staleBefore = new Date(Date.now() - SYNC_LOCK_STALE_AFTER_MS).toISOString();
  const { data, error } = await admin
    .from("google_calendar_sync_state")
    .update({ running: true, started_at: new Date().toISOString(), finished_at: null })
    .eq("id", true)
    .or(`running.eq.false,started_at.lt.${staleBefore}`)
    .select("id");
  if (error) {
    console.warn("[google-calendar] acquireSyncLock failed", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

async function releaseSyncLock(
  admin: AdminClient,
  result: { ok: true; result: unknown } | { ok: false; error: string },
): Promise<void> {
  await admin
    .from("google_calendar_sync_state")
    .update({
      running: false,
      finished_at: new Date().toISOString(),
      last_error: result.ok ? null : result.error,
      last_result: result.ok ? (result.result as never) : null,
    })
    .eq("id", true);
}

/** Ponto de entrada único pra rodar um ciclo completo de sincronização nos
 * dois sentidos, protegido pela trava acima — usado pelo cron
 * (`api/cron/google-calendar-sync.ts`), pelo disparo imediato ao
 * criar/editar/excluir reunião, e pelo polling do navegador. Nunca roda
 * duas vezes ao mesmo tempo; se a trava já estiver ocupada, simplesmente
 * não faz nada nesta chamada (o próximo disparo tenta de novo). */
/**
 * Executa `work` sob a trava singleton existente (`google_calendar_sync_state`): se outra execução
 * (cron, polling, edição de reunião, botão manual) já a detém, NÃO roda e devolve `{ ran: false }`.
 * Libera a trava também em caso de erro (que é propagado).
 */
export async function runWithSyncLock<T>(
  admin: AdminClient,
  work: () => Promise<T>,
): Promise<{ ran: false } | { ran: true; value: T }> {
  const acquired = await acquireSyncLock(admin);
  if (!acquired) return { ran: false };
  try {
    const value = await work();
    await releaseSyncLock(admin, { ok: true, result: value });
    return { ran: true, value };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await releaseSyncLock(admin, { ok: false, error: message });
    throw err;
  }
}

export async function runGoogleCalendarSyncCycle(): Promise<{
  ran: boolean;
  outbound?: OutboundDetail["result"];
  inbound?: InboundDetail["result"];
  /** Conexões cujo `last_synced_at` avançou neste ciclo (contagem; sem ids). */
  markedSynced?: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const locked = await runWithSyncLock(supabaseAdmin, async () => {
    const outbound = await runOutbound();
    const inbound = await runInbound();
    // `last_synced_at` = "esta conexão foi sincronizada com sucesso agora" (token válido, envio e
    // listagem concluídos). Executar o ciclo NÃO basta: conexões que falharam, estão com falha
    // temporária ou exigem reautorização mantêm o valor anterior.
    const syncedIds = connectionsToMarkSynced(outbound.outcomes, inbound.outcomes);
    if (syncedIds.length > 0) {
      const { error } = await supabaseAdmin
        .from("google_calendar_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .in("user_id", syncedIds);
      if (error)
        console.warn("[google-calendar] last_synced_at não gravado", { dbCode: error.code });
    }
    return {
      outbound: outbound.result,
      inbound: inbound.result,
      markedSynced: syncedIds.length,
    };
  });
  return locked.ran ? { ran: true, ...locked.value } : { ran: false };
}

/** Versão chamável pelo cliente (sessão logada) do ciclo combinado —
 * substitui as duas chamadas separadas (`syncAllMeetingsToGoogle` +
 * `importGoogleEventsToMeetings`) que o polling do navegador fazia sem
 * nenhuma trava entre si. */
export const runGoogleCalendarSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isInternalOrAdmin(context.supabase, context.userId))) return FORBIDDEN_SYNC;
    return runGoogleCalendarSyncCycle();
  });
