import { describe, expect, it, vi } from "vitest";
import {
  updateClientMemberRoleCore,
  inviteClientUserCore,
  ClientRoleEnum,
} from "@/lib/organization-invites.functions";

/**
 * Covers the role-collapse migration
 * (`20260922184944_collapse_client_roles_to_standard_viewer.sql`): the old
 * three-role model (client_admin/client_member/client_viewer) is now exactly
 * two roles (client_standard/client_viewer). This guards against a future
 * regression re-introducing 'client_admin'/'client_member' as an accepted
 * value anywhere invite/role-update input is validated.
 */
/**
 * Fakes the slice of the admin Supabase client surface `inviteClientUserCore`
 * touches: `profiles`/`organizations`/`organization_members` reads for the
 * internal-membership guard, `auth.admin.listUsers`/`createUser` for the
 * duplicate-email branch, and `organization_members`/`access_audit_log`
 * writes.
 */
function makeFakeInviteSupabaseAdmin(opts: {
  existingProfile?: { id: string } | null;
  internalMembership?: { id: string } | null;
  existingAuthUsers?: { id: string; email: string }[];
  existingLink?: { id: string } | null;
}) {
  const insertMemberSpy = vi.fn().mockResolvedValue({ error: null });
  const insertAuditSpy = vi.fn().mockResolvedValue({ error: null });
  const createUserSpy = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: "new-user-1" } }, error: null });

  const db = {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: opts.existingProfile ?? null, error: null }),
            }),
          }),
        };
      }
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { id: "org-internal" }, error: null }),
            }),
          }),
        };
      }
      if (table === "organization_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  in: () => ({
                    maybeSingle: () =>
                      Promise.resolve({ data: opts.internalMembership ?? null, error: null }),
                  }),
                }),
                maybeSingle: () =>
                  Promise.resolve({ data: opts.existingLink ?? null, error: null }),
              }),
            }),
          }),
          insert: insertMemberSpy,
        };
      }
      if (table === "access_audit_log") {
        return { insert: insertAuditSpy };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        listUsers: () =>
          Promise.resolve({ data: { users: opts.existingAuthUsers ?? [] }, error: null }),
        createUser: createUserSpy,
      },
    },
  };
  return { db: db as never, insertMemberSpy, insertAuditSpy, createUserSpy };
}

describe("inviteClientUserCore", () => {
  const baseInput = {
    organizationId: "org-client-a",
    email: "pessoa@clientea.com",
    fullName: "Pessoa Cliente",
    role: "client_standard" as const,
  };

  it("refuses to invite an email that already belongs to an active internal team membership", async () => {
    const { db, insertMemberSpy } = makeFakeInviteSupabaseAdmin({
      existingProfile: { id: "teammate-1" },
      internalMembership: { id: "membership-1" },
    });
    await expect(inviteClientUserCore(db, "admin-1", baseInput)).rejects.toThrow(
      /membro interno do time/i,
    );
    expect(insertMemberSpy).not.toHaveBeenCalled();
  });

  it("links an existing auth user instead of creating a duplicate account when the email already has one", async () => {
    const { db, insertMemberSpy, createUserSpy } = makeFakeInviteSupabaseAdmin({
      existingProfile: null,
      existingAuthUsers: [{ id: "existing-user-1", email: baseInput.email }],
      existingLink: null,
    });
    const result = await inviteClientUserCore(db, "admin-1", baseInput);
    expect(result).toEqual({
      id: "existing-user-1",
      email: baseInput.email,
      tempPassword: null,
      existingAccount: true,
    });
    expect(createUserSpy).not.toHaveBeenCalled();
    expect(insertMemberSpy).toHaveBeenCalledTimes(1);
  });

  it("creates a new auth user when no account exists for the email yet", async () => {
    const { db, insertMemberSpy, createUserSpy } = makeFakeInviteSupabaseAdmin({
      existingProfile: null,
      existingAuthUsers: [],
    });
    const result = await inviteClientUserCore(db, "admin-1", baseInput);
    expect(result.existingAccount).toBe(false);
    expect(result.id).toBe("new-user-1");
    expect(typeof result.tempPassword).toBe("string");
    expect(createUserSpy).toHaveBeenCalledTimes(1);
    expect(insertMemberSpy).toHaveBeenCalledTimes(1);
  });
});

describe("ClientRoleEnum (post role-collapse)", () => {
  it("accepts exactly client_standard and client_viewer", () => {
    expect(ClientRoleEnum.safeParse("client_standard").success).toBe(true);
    expect(ClientRoleEnum.safeParse("client_viewer").success).toBe(true);
  });

  it("rejects the retired client_admin and client_member role strings", () => {
    expect(ClientRoleEnum.safeParse("client_admin").success).toBe(false);
    expect(ClientRoleEnum.safeParse("client_member").success).toBe(false);
  });
});

/**
 * Covers the defense-in-depth check CLAUDE.md explicitly calls out:
 * `updateClientMemberRole` must refuse to touch a membership belonging to a
 * non-'client' organization (i.e. an internal team member), even though the
 * admin UI never offers that path. See `PortalAccessSection.tsx` / piece A.
 */

type FakeMembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  status: string;
  organizations: { id: string; type: string; name: string } | null;
};

/** Minimal fake of the admin Supabase client surface used by
 * `updateClientMemberRoleCore`: `.from("organization_members").select(...).eq().maybeSingle()`
 * for the read, `.update().eq()` for the write, and `.from("access_audit_log").insert()`
 * for the audit log. */
function makeFakeSupabaseAdmin(membership: FakeMembershipRow) {
  const updateSpy = vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) });
  const insertSpy = vi.fn().mockResolvedValue({ error: null });

  const db = {
    from(table: string) {
      if (table === "organization_members") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: () => Promise.resolve({ data: membership, error: null }),
                };
              },
            };
          },
          update: updateSpy,
        };
      }
      if (table === "access_audit_log") {
        return { insert: insertSpy };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { db: db as never, updateSpy, insertSpy };
}

describe("updateClientMemberRoleCore", () => {
  it("refuses to change the role of a membership belonging to a non-'client' organization", async () => {
    const { db, updateSpy } = makeFakeSupabaseAdmin({
      id: "member-1",
      organization_id: "org-internal",
      user_id: "user-1",
      role: "internal_member",
      status: "active",
      organizations: { id: "org-internal", type: "internal", name: "Você no Hype" },
    });

    await expect(
      updateClientMemberRoleCore(db, "admin-1", {
        organizationMemberId: "member-1",
        role: "client_standard",
      }),
    ).rejects.toThrow(/organizações de clientes/i);

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("allows changing the role of a membership belonging to a 'client' organization", async () => {
    const { db, updateSpy, insertSpy } = makeFakeSupabaseAdmin({
      id: "member-2",
      organization_id: "org-client-a",
      user_id: "user-2",
      role: "client_standard",
      status: "active",
      organizations: { id: "org-client-a", type: "client", name: "Cliente A" },
    });

    const result = await updateClientMemberRoleCore(db, "admin-1", {
      organizationMemberId: "member-2",
      role: "client_standard",
    });

    expect(result).toEqual({ ok: true });
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });
});
