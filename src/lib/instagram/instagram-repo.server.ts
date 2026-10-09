import type { ConnectionRow, InstagramRepo, LinkRow } from "./instagram-service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };
const L = "instagram_connect_links";
const C = "instagram_connections";

/* eslint-disable @typescript-eslint/no-explicit-any */
const link = (r: any): LinkRow => ({
  id: r.id,
  influenciadorId: r.influenciador_id,
  expiresAt: r.expires_at,
  usedAt: r.used_at,
});
const conn = (r: any): ConnectionRow => ({
  influenciadorId: r.influenciador_id,
  igUserId: r.ig_user_id,
  tokenEnc: r.access_token_enc,
  tokenExpiresAt: r.token_expires_at,
  status: r.status,
  username: r.username,
  accountType: r.account_type,
  permissions: r.permissions ?? [],
  connectedAt: r.connected_at,
  lastSyncAt: r.last_sync_at,
  lastSyncError: r.last_sync_error,
  snapshot: r.snapshot ?? null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */
const fail = (e: { code?: string } | null) => {
  if (e) throw new Error(`db_error:${e.code ?? "unknown"}`); // nunca repassa error.message
};

export function createSupabaseInstagramRepo(db: Db): InstagramRepo {
  return {
    async influencerName(id) {
      const { data, error } = await db
        .from("banco_influenciadores")
        .select("data")
        .eq("id", id)
        .maybeSingle();
      fail(error);
      if (!data) return null;
      const nome = (data.data as { nome?: unknown } | null)?.nome;
      return typeof nome === "string" && nome.trim() ? nome : "Influenciador";
    },
    async insertLink(i) {
      const { error } = await db.from(L).insert({
        influenciador_id: i.influenciadorId,
        token_hash: i.tokenHash,
        expires_at: i.expiresAt,
        created_by: i.createdBy,
      });
      fail(error);
    },
    async findLinkByTokenHash(hash) {
      const { data, error } = await db.from(L).select().eq("token_hash", hash).maybeSingle();
      fail(error);
      return data ? link(data) : null;
    },
    async setLinkState(id, stateHash) {
      const { error } = await db.from(L).update({ oauth_state_hash: stateHash }).eq("id", id);
      fail(error);
    },
    async findLinkByStateHash(hash) {
      const { data, error } = await db.from(L).select().eq("oauth_state_hash", hash).maybeSingle();
      fail(error);
      return data ? link(data) : null;
    },
    async markLinkUsed(id) {
      const { error } = await db.from(L).update({ used_at: new Date().toISOString() }).eq("id", id);
      fail(error);
    },
    async upsertConnection(c) {
      const { error } = await db.from(C).upsert(
        {
          influenciador_id: c.influenciadorId,
          ig_user_id: c.igUserId,
          ig_user_hash: c.igUserHash,
          ig_app_user_hash: c.igAppUserHash,
          username: c.username,
          account_type: c.accountType,
          access_token_enc: c.tokenEnc,
          token_expires_at: c.tokenExpiresAt,
          permissions: c.permissions,
          status: c.status,
          connected_at: c.connectedAt,
          last_sync_at: c.lastSyncAt,
          last_sync_error: null,
          snapshot: c.snapshot,
        },
        { onConflict: "influenciador_id" },
      );
      fail(error);
    },
    async getConnection(id) {
      const { data, error } = await db.from(C).select().eq("influenciador_id", id).maybeSingle();
      fail(error);
      return data ? conn(data) : null;
    },
    async updateConnection(id, p) {
      const row: Record<string, unknown> = {};
      if (p.tokenEnc !== undefined) row.access_token_enc = p.tokenEnc;
      if (p.tokenExpiresAt !== undefined) row.token_expires_at = p.tokenExpiresAt;
      if (p.status !== undefined) row.status = p.status;
      if (p.lastSyncAt !== undefined) row.last_sync_at = p.lastSyncAt;
      if (p.lastSyncError !== undefined) row.last_sync_error = p.lastSyncError;
      if (p.snapshot !== undefined) row.snapshot = p.snapshot;
      if (p.username !== undefined) row.username = p.username;
      if (p.accountType !== undefined) row.account_type = p.accountType;
      const { error } = await db.from(C).update(row).eq("influenciador_id", id);
      fail(error);
    },
    async deleteConnection(id) {
      const { data, error } = await db.from(C).delete().eq("influenciador_id", id).select("id");
      fail(error);
      return (data ?? []).length > 0;
    },
    async listConnectedExpiringBefore(iso) {
      const { data, error } = await db
        .from(C)
        .select()
        .eq("status", "connected")
        .lt("token_expires_at", iso);
      fail(error);
      return (data ?? []).map(conn);
    },
    async deleteByUserHash(hash) {
      const a = await db.from(C).delete().eq("ig_user_hash", hash).select("id");
      fail(a.error);
      const b = await db.from(C).delete().eq("ig_app_user_hash", hash).select("id");
      fail(b.error);
      return (a.data ?? []).length + (b.data ?? []).length;
    },
  };
}
