import { describe, expect, it, vi, afterEach } from "vitest";
import { resolveActiveClientOrganization, assertCanMutate } from "@/lib/portal-auth.functions";

/**
 * Covers the two pieces of new authorization logic CLAUDE.md calls out for
 * Phase 2b: (1) `resolveActiveClientOrganization` must never trust the
 * active-org cookie blindly — it has to match a LIVE active `client`
 * membership row, and single-membership users must resolve directly
 * without even looking at the cookie; (2) `assertCanMutate` must reject
 * `client_viewer` (read-only per spec) and allow every other client role.
 */

type FakeRow = { organization_id: string; role: string };

// `resolveActiveClientOrganization` runs a single chained `.select().eq()...`
// query and reads the tail `.eq()` result directly as `{ data, error }` —
// mirror the real Supabase query-builder shape (thenable) instead of a deep
// literal per call to keep this in sync with the actual `.eq(...).eq(...)`
// chain length used in the implementation.
function fakeSupabaseFromRows(rows: FakeRow[]) {
  const builder = {
    eq: () => builder,
    then: (resolve: (v: { data: FakeRow[]; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return {
    from: () => ({ select: () => builder }),
  } as never;
}

describe("resolveActiveClientOrganization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("resolves directly when the user has exactly one active client org (no cookie needed)", async () => {
    const supabase = fakeSupabaseFromRows([{ organization_id: "org-1", role: "client_member" }]);
    const result = await resolveActiveClientOrganization({
      supabase,
      userId: "user-1",
    } as never);
    expect(result).toEqual({ organizationId: "org-1", role: "client_member" });
  });

  it("throws when the user has no active client org", async () => {
    const supabase = fakeSupabaseFromRows([]);
    await expect(
      resolveActiveClientOrganization({ supabase, userId: "user-1" } as never),
    ).rejects.toThrow(/nenhum ambiente/i);
  });

  it("uses the active-org cookie to disambiguate when the user has multiple active client orgs, but only if it matches a real membership", async () => {
    vi.resetModules();
    vi.doMock("@/lib/active-org-cookie.server", () => ({
      readActiveOrgCookie: () => "org-2",
    }));
    // Fresh import after mocking — `vi.doMock` only affects modules loaded
    // AFTER it's registered, and `resolveActiveClientOrganization` imports
    // `readActiveOrgCookie` at module top, so the module itself must be
    // re-imported too (`vi.resetModules()` above clears the cache).
    const { resolveActiveClientOrganization: resolveWithMock } =
      await import("@/lib/portal-auth.functions");
    const supabase = fakeSupabaseFromRows([
      { organization_id: "org-1", role: "client_member" },
      { organization_id: "org-2", role: "client_admin" },
    ]);
    const result = await resolveWithMock({ supabase, userId: "user-1" } as never);
    expect(result).toEqual({ organizationId: "org-2", role: "client_admin" });
  });

  it("rejects an active-org cookie that does not match any of the user's real memberships", async () => {
    vi.resetModules();
    vi.doMock("@/lib/active-org-cookie.server", () => ({
      readActiveOrgCookie: () => "org-attacker-controlled",
    }));
    const { resolveActiveClientOrganization: resolveWithMock } =
      await import("@/lib/portal-auth.functions");
    const supabase = fakeSupabaseFromRows([
      { organization_id: "org-1", role: "client_member" },
      { organization_id: "org-2", role: "client_admin" },
    ]);
    await expect(resolveWithMock({ supabase, userId: "user-1" } as never)).rejects.toThrow(
      /selecione um/i,
    );
  });
});

describe("assertCanMutate", () => {
  it("rejects client_viewer (read-only per spec)", () => {
    expect(() => assertCanMutate("client_viewer")).toThrow(/somente leitura/i);
  });

  it("allows client_member and client_admin", () => {
    expect(() => assertCanMutate("client_member")).not.toThrow();
    expect(() => assertCanMutate("client_admin")).not.toThrow();
  });
});
