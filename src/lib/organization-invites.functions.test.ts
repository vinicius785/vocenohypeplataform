import { describe, expect, it, vi } from "vitest";
import { updateClientMemberRoleCore } from "@/lib/organization-invites.functions";

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
        role: "client_admin",
      }),
    ).rejects.toThrow(/organizações de clientes/i);

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("allows changing the role of a membership belonging to a 'client' organization", async () => {
    const { db, updateSpy, insertSpy } = makeFakeSupabaseAdmin({
      id: "member-2",
      organization_id: "org-client-a",
      user_id: "user-2",
      role: "client_member",
      status: "active",
      organizations: { id: "org-client-a", type: "client", name: "Cliente A" },
    });

    const result = await updateClientMemberRoleCore(db, "admin-1", {
      organizationMemberId: "member-2",
      role: "client_admin",
    });

    expect(result).toEqual({ ok: true });
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });
});
