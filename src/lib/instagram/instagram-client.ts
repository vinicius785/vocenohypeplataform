/**
 * Cliente da Instagram API com Instagram Login (somente leitura). Sem I/O além do `fetch` injetado.
 * Permissões: instagram_business_basic e instagram_business_manage_insights.
 * Nenhuma mensagem de erro contém token, segredo ou o corpo devolvido pela Meta.
 */
export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
] as const;
const AUTH_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";

export type InstagramErrorCode =
  | "not_configured"
  | "denied"
  | "invalid_code"
  | "token_invalid"
  | "permission_missing"
  | "rate_limited"
  | "unavailable";

export class InstagramError extends Error {
  constructor(
    public readonly code: InstagramErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "InstagramError";
  }
}

export type DemographicEntry = { id: string; label: string; percentual: number };
export type InstagramSnapshot = {
  fetchedAt: string;
  /** Janela em dias dos totais (alcance, interações...). */
  windowDays: number;
  profile: {
    username: string | null;
    accountType: string | null;
    followers: number | null;
    follows: number | null;
    media: number | null;
  };
  totals: Partial<
    Record<
      | "reach"
      | "views"
      | "accountsEngaged"
      | "totalInteractions"
      | "likes"
      | "comments"
      | "shares"
      | "saves",
      number
    >
  >;
  /** interações ÷ alcance, em % (só quando ambos existem e o alcance > 0). */
  interactionRateByReach: number | null;
  /** Seguidores por gênero/idade/país/cidade (%). Ausente com menos de 100 seguidores. */
  demographics: {
    gender?: DemographicEntry[];
    age?: DemographicEntry[];
    country?: DemographicEntry[];
    city?: DemographicEntry[];
  };
};

export function buildAuthorizeUrl(p: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", p.appId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", IG_SCOPES.join(","));
  u.searchParams.set("state", p.state);
  return u.toString();
}

type Fetch = typeof fetch;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const GENDER_LABEL: Record<string, string> = { F: "Feminino", M: "Masculino", U: "Não informado" };

/** `breakdowns[0].results` → fatias em % (top N), do maior para o menor. */
export function demographicEntries(
  data: unknown,
  kind: "gender" | "age" | "country" | "city",
  top = 6,
): DemographicEntry[] | undefined {
  const results = (
    data as { data?: { total_value?: { breakdowns?: { results?: unknown[] }[] } }[] }
  )?.data?.[0]?.total_value?.breakdowns?.[0]?.results;
  if (!Array.isArray(results) || results.length === 0) return undefined;
  const rows = results
    .map((r) => {
      const x = r as { dimension_values?: unknown[]; value?: unknown };
      const key = String(x.dimension_values?.[0] ?? "");
      return { key, value: num(x.value) ?? 0 };
    })
    .filter((r) => r.key && r.value > 0);
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!total) return undefined;
  return rows
    .sort((a, b) => b.value - a.value)
    .slice(0, top)
    .map((r) => ({
      id: `${kind}:${r.key}`,
      label: kind === "gender" ? (GENDER_LABEL[r.key] ?? r.key) : r.key,
      percentual: Math.round((r.value / total) * 1000) / 10,
    }));
}

export class InstagramClient {
  constructor(
    private readonly cfg: { appId: string; appSecret: string },
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async json(res: Response): Promise<Record<string, unknown>> {
    if (res.status === 429) throw new InstagramError("rate_limited");
    if (res.status >= 500) throw new InstagramError("unavailable");
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new InstagramError("unavailable");
    }
    if (!res.ok || body.error || body.error_type) {
      const err = body.error as { code?: number; type?: string } | undefined;
      if (res.status === 401 || err?.code === 190 || err?.type === "OAuthException")
        throw new InstagramError("token_invalid");
      if (err?.code === 10 || err?.code === 200) throw new InstagramError("permission_missing");
      throw new InstagramError("invalid_code");
    }
    return body;
  }

  /** Troca o `code` do redirect pelo token de curta duração (+ id app-scoped e permissões concedidas). */
  async exchangeCode(code: string, redirectUri: string) {
    const body = new URLSearchParams({
      client_id: this.cfg.appId,
      client_secret: this.cfg.appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });
    let res: Response;
    try {
      res = await this.fetchImpl(TOKEN_URL, { method: "POST", body });
    } catch {
      throw new InstagramError("unavailable");
    }
    const j = await this.json(res);
    const row = (Array.isArray(j.data) ? (j.data[0] as Record<string, unknown>) : j) ?? {};
    const token = typeof row.access_token === "string" ? row.access_token : null;
    const appUserId = row.user_id != null ? String(row.user_id) : null;
    if (!token || !appUserId) throw new InstagramError("invalid_code");
    const permissions =
      typeof row.permissions === "string"
        ? row.permissions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : Array.isArray(row.permissions)
          ? (row.permissions as string[])
          : [];
    return { shortToken: token, appUserId, permissions };
  }

  private async graph(
    path: string,
    params: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const u = new URL(`${GRAPH}${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    let res: Response;
    try {
      res = await this.fetchImpl(u.toString());
    } catch {
      throw new InstagramError("unavailable");
    }
    return this.json(res);
  }

  async toLongLived(shortToken: string) {
    const j = await this.graph("/access_token", {
      grant_type: "ig_exchange_token",
      client_secret: this.cfg.appSecret,
      access_token: shortToken,
    });
    const token = typeof j.access_token === "string" ? j.access_token : null;
    const expiresIn = num(j.expires_in);
    if (!token || !expiresIn) throw new InstagramError("invalid_code");
    return { accessToken: token, expiresInSec: expiresIn };
  }

  async refresh(token: string) {
    const j = await this.graph("/refresh_access_token", {
      grant_type: "ig_refresh_token",
      access_token: token,
    });
    const next = typeof j.access_token === "string" ? j.access_token : null;
    const expiresIn = num(j.expires_in);
    if (!next || !expiresIn) throw new InstagramError("token_invalid");
    return { accessToken: next, expiresInSec: expiresIn };
  }

  async profile(token: string) {
    const fields = "user_id,username,account_type,followers_count,follows_count,media_count";
    let j: Record<string, unknown>;
    try {
      j = await this.graph("/me", { fields, access_token: token });
    } catch (e) {
      if (!(e instanceof InstagramError) || e.code === "token_invalid") throw e;
      j = await this.graph("/me", { fields: "user_id,username", access_token: token });
    }
    const userId = j.user_id != null ? String(j.user_id) : j.id != null ? String(j.id) : null;
    if (!userId) throw new InstagramError("invalid_code");
    return {
      userId,
      username: typeof j.username === "string" ? j.username : null,
      accountType: typeof j.account_type === "string" ? j.account_type : null,
      followers: num(j.followers_count),
      follows: num(j.follows_count),
      media: num(j.media_count),
    };
  }

  /** Totais dos últimos `days` dias + demografia dos seguidores. Métricas que falharem (ex.: poucos
   * seguidores) ficam ausentes; só erro de token/permissão/limite interrompe. */
  async snapshot(
    token: string,
    igUserId: string,
    now = new Date(),
    days = 30,
  ): Promise<InstagramSnapshot> {
    const profile = await this.profile(token);
    const until = Math.floor(now.getTime() / 1000);
    const since = until - days * 86400;
    const totals: InstagramSnapshot["totals"] = {};
    const METRICS: [keyof InstagramSnapshot["totals"], string][] = [
      ["reach", "reach"],
      ["views", "views"],
      ["accountsEngaged", "accounts_engaged"],
      ["totalInteractions", "total_interactions"],
      ["likes", "likes"],
      ["comments", "comments"],
      ["shares", "shares"],
      ["saves", "saves"],
    ];
    const fatal = (e: unknown) =>
      e instanceof InstagramError &&
      ["token_invalid", "permission_missing", "rate_limited"].includes(e.code);
    await Promise.all(
      METRICS.map(async ([k, metric]) => {
        try {
          const j = await this.graph(`/${igUserId}/insights`, {
            metric,
            metric_type: "total_value",
            period: "day",
            since: String(since),
            until: String(until),
            access_token: token,
          });
          const v = num(
            (j as { data?: { total_value?: { value?: unknown } }[] }).data?.[0]?.total_value?.value,
          );
          if (v != null) totals[k] = v;
        } catch (e) {
          if (fatal(e)) throw e;
        }
      }),
    );
    const demographics: InstagramSnapshot["demographics"] = {};
    await Promise.all(
      (["gender", "age", "country", "city"] as const).map(async (b) => {
        try {
          const j = await this.graph(`/${igUserId}/insights`, {
            metric: "follower_demographics",
            metric_type: "total_value",
            period: "lifetime",
            timeframe: "this_month",
            breakdown: b,
            access_token: token,
          });
          const e = demographicEntries(j, b);
          if (e) demographics[b] = e;
        } catch (e) {
          if (fatal(e)) throw e;
        }
      }),
    );
    const rate =
      totals.totalInteractions != null && totals.reach
        ? Math.round((totals.totalInteractions / totals.reach) * 1000) / 10
        : null;
    return {
      fetchedAt: now.toISOString(),
      windowDays: days,
      profile: {
        username: profile.username,
        accountType: profile.accountType,
        followers: profile.followers,
        follows: profile.follows,
        media: profile.media,
      },
      totals,
      interactionRateByReach: rate,
      demographics,
    };
  }
}
