import { describe, expect, it, vi } from "vitest";
import {
  cancelClientInviteCore,
  duplicateInviteMessage,
} from "@/lib/organization-invites.functions";

type Membership = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  status: string;
  organizations: { type: string };
};

function fakeAdmin(opts: {
  membership: Membership | null;
  user?: {
    email?: string;
    last_sign_in_at?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null;
  otherMemberships?: number;
  campanhas?: { id: string }[];
}) {
  const calls = {
    deleteUser: vi.fn().mockResolvedValue({ error: null }),
    deleteMember: vi.fn(),
    deleteCampaignMembers: vi.fn(),
    audit: vi.fn().mockResolvedValue({ error: null }),
  };
  const db = {
    auth: {
      admin: {
        getUserById: () =>
          Promise.resolve({
            data: { user: opts.user === undefined ? null : opts.user },
            error: null,
          }),
        deleteUser: calls.deleteUser,
      },
    },
    from(table: string) {
      if (table === "organization_members") {
        return {
          select: (_c: string, o?: { head?: boolean }) =>
            o?.head
              ? {
                  eq: () => ({
                    neq: () => Promise.resolve({ count: opts.otherMemberships ?? 0, error: null }),
                  }),
                }
              : {
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: opts.membership, error: null }),
                  }),
                },
          delete: () => ({
            eq: (_k: string, id: string) => ({
              eq: (_k2: string, status: string) => {
                calls.deleteMember(id, status);
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }
      if (table === "clientes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { data: { campanhas: opts.campanhas ?? [] } },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "campaign_members") {
        return {
          delete: () => ({
            eq: () => ({
              in: (_k: string, ids: string[]) => {
                calls.deleteCampaignMembers(ids);
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }
      if (table === "access_audit_log") return { insert: calls.audit };
      throw new Error(`tabela inesperada ${table}`);
    },
  };
  return { db: db as never, calls };
}

const invited: Membership = {
  id: "m1",
  organization_id: "o1",
  user_id: "u1",
  role: "client_standard",
  status: "invited",
  organizations: { type: "client" },
};

describe("excluir convite", () => {
  it("conta criada pelo convite: apaga a conta (invalida link e senha temporária)", async () => {
    const { db, calls } = fakeAdmin({
      membership: invited,
      user: {
        email: "t@x.com",
        last_sign_in_at: null,
        user_metadata: { must_change_password: true, full_name: "Terê" },
      },
    });
    const r = await cancelClientInviteCore(db, "admin", "m1");
    expect(r.deletedAccount).toBe(true);
    expect(calls.deleteUser).toHaveBeenCalledWith("u1");
    expect(calls.deleteMember).not.toHaveBeenCalled();
    const entry = calls.audit.mock.calls[0][0];
    expect(entry).toMatchObject({ action: "invite_cancelled", target_user_id: null });
    expect(entry.previous_value).toMatchObject({ email: "t@x.com", name: "Terê" });
  });

  it("conta que já existia: só o vínculo (e campanhas deste cliente) sai; a conta fica", async () => {
    const { db, calls } = fakeAdmin({
      membership: invited,
      user: { email: "a@x.com", last_sign_in_at: "2026-01-01T00:00:00Z", user_metadata: {} },
      campanhas: [{ id: "c1" }, { id: "c2" }],
    });
    const r = await cancelClientInviteCore(db, "admin", "m1");
    expect(r.deletedAccount).toBe(false);
    expect(calls.deleteUser).not.toHaveBeenCalled();
    expect(calls.deleteMember).toHaveBeenCalledWith("m1", "invited");
    expect(calls.deleteCampaignMembers).toHaveBeenCalledWith(["c1", "c2"]);
  });

  it("nunca apaga a conta de quem tem outros vínculos", async () => {
    const { db, calls } = fakeAdmin({
      membership: invited,
      user: {
        email: "a@x.com",
        last_sign_in_at: null,
        user_metadata: { must_change_password: true },
      },
      otherMemberships: 1,
    });
    const r = await cancelClientInviteCore(db, "admin", "m1");
    expect(r.deletedAccount).toBe(false);
    expect(calls.deleteUser).not.toHaveBeenCalled();
  });

  it("só convites pendentes: acesso ativo/suspenso/revogado é recusado", async () => {
    for (const status of ["active", "suspended", "removed"]) {
      const { db, calls } = fakeAdmin({
        membership: { ...invited, status },
        user: { email: "a@x.com" },
      });
      await expect(cancelClientInviteCore(db, "admin", "m1")).rejects.toThrow(/convites pendentes/);
      expect(calls.deleteUser).not.toHaveBeenCalled();
      expect(calls.deleteMember).not.toHaveBeenCalled();
    }
  });

  it("recusa organização que não é de cliente", async () => {
    const { db } = fakeAdmin({ membership: { ...invited, organizations: { type: "internal" } } });
    await expect(cancelClientInviteCore(db, "admin", "m1")).rejects.toThrow(/clientes/);
  });

  it("falha ao apagar a conta: nada de falso sucesso", async () => {
    const { db, calls } = fakeAdmin({
      membership: invited,
      user: {
        email: "t@x.com",
        last_sign_in_at: null,
        user_metadata: { must_change_password: true },
      },
    });
    calls.deleteUser.mockResolvedValueOnce({ error: { message: "boom" } });
    await expect(cancelClientInviteCore(db, "admin", "m1")).rejects.toThrow("boom");
    expect(calls.audit).not.toHaveBeenCalled();
  });
});

describe("duplicidade de convite", () => {
  it("mensagem correta por estado do vínculo", () => {
    expect(duplicateInviteMessage("invited")).toMatch(/convite pendente/i);
    expect(duplicateInviteMessage("active")).toMatch(/já tem acesso/i);
    expect(duplicateInviteMessage("suspended")).toMatch(/já tem acesso/i);
    expect(duplicateInviteMessage("removed")).toMatch(/revogado/i);
  });
});
