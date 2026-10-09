import type { DeletionRepo, DeletionRow } from "./meta-data-deletion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };
const T = "meta_deletion_requests";

/* eslint-disable @typescript-eslint/no-explicit-any */
const toRow = (r: any): DeletionRow => ({
  id: r.id,
  confirmationCode: r.confirmation_code,
  status: r.status,
  summary: r.summary ?? {},
  createdAt: r.created_at,
  completedAt: r.completed_at,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const fail = (e: { code?: string } | null) => {
  // nunca repassa error.message (pode conter valores do pedido)
  if (e) throw new Error(`db_error:${e.code ?? "unknown"}`);
};

export function createSupabaseDeletionRepo(db: Db): DeletionRepo {
  return {
    async findByUserAndIssued(hash, issuedAt) {
      const { data, error } = await db
        .from(T)
        .select()
        .eq("meta_user_hash", hash)
        .eq("issued_at", issuedAt)
        .maybeSingle();
      fail(error);
      return data ? toRow(data) : null;
    },
    async insert({ code, hash, issuedAt }) {
      const { data, error } = await db
        .from(T)
        .insert({ confirmation_code: code, meta_user_hash: hash, issued_at: issuedAt })
        .select()
        .single();
      if (error?.code === "23505") {
        const again = await this.findByUserAndIssued(hash, issuedAt);
        if (again) return again;
      }
      fail(error);
      return toRow(data);
    },
    async update(id, patch) {
      const { error } = await db
        .from(T)
        .update({
          status: patch.status,
          ...(patch.summary ? { summary: patch.summary } : {}),
          ...(patch.errorCode !== undefined ? { error_code: patch.errorCode } : {}),
          completed_at: patch.status === "completed" ? new Date().toISOString() : null,
        })
        .eq("id", id);
      fail(error);
    },
    async findByCode(code) {
      const { data, error } = await db.from(T).select().eq("confirmation_code", code).maybeSingle();
      fail(error);
      return data ? toRow(data) : null;
    },
  };
}
