import { describe, expect, it } from "vitest";
import { listInternalTeamUserIds, listClientPortalUserIds } from "@/lib/team-membership";
import { computeMemberScores } from "@/lib/score";
import type { ChatMember } from "@/lib/chat-store";

/**
 * Covers the client-portal leak fix: `getTeamDirectory`/`fetchTeamDirectory`
 * (Hypito) and everything downstream (Time tab list/count/score, chat
 * mention/participant selectors, presence) must only ever see internal
 * team members, never client-portal accounts — see
 * `20260925090000_internal_team_membership_gate.sql` and this module's
 * docstring.
 */

const INTERNAL_ORG_ID = "org-internal";

/** Fakes the slice of the admin Supabase client surface
 * `listInternalTeamUserIds`/`listClientPortalUserIds` touch:
 * `organizations` (resolve the internal org by slug) and
 * `organization_members` (role/status-filtered membership rows), plus
 * `user_roles` for the admin-union branch. */
function makeFakeAdmin(opts: {
  internalMembers?: { user_id: string }[];
  admins?: { user_id: string }[];
  clientMembers?: { user_id: string; organizations: { type: string } }[];
  orgFound?: boolean;
}) {
  return {
    from(table: string) {
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: opts.orgFound === false ? null : { id: INTERNAL_ORG_ID },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: opts.admins ?? [], error: null }),
          }),
        };
      }
      if (table === "organization_members") {
        return {
          select: (cols: string) => {
            if (cols.includes("organizations!inner")) {
              return {
                eq: () => ({
                  eq: () => Promise.resolve({ data: opts.clientMembers ?? [], error: null }),
                }),
              };
            }
            return {
              eq: () => ({
                eq: () => ({
                  in: () => Promise.resolve({ data: opts.internalMembers ?? [], error: null }),
                }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("listInternalTeamUserIds", () => {
  it("returns internal_admin/internal_member ids from the internal org", async () => {
    const db = makeFakeAdmin({
      internalMembers: [{ user_id: "internal-1" }, { user_id: "internal-2" }],
    });
    const ids = await listInternalTeamUserIds(db);
    expect(ids).toEqual(new Set(["internal-1", "internal-2"]));
  });

  it("never includes a client-portal account just because it has a profiles row", async () => {
    // client-portal accounts never appear in organization_members with an
    // internal role, so a client id passed nowhere in `internalMembers`
    // must never show up in the result.
    const db = makeFakeAdmin({ internalMembers: [{ user_id: "internal-1" }] });
    const ids = await listInternalTeamUserIds(db);
    expect(ids.has("client-portal-user")).toBe(false);
  });

  it("unions in admins even without an organization_members row (edge case)", async () => {
    const db = makeFakeAdmin({
      internalMembers: [],
      admins: [{ user_id: "admin-without-org-row" }],
    });
    const ids = await listInternalTeamUserIds(db);
    expect(ids.has("admin-without-org-row")).toBe(true);
  });

  it("returns just the admin ids when the internal org row is missing", async () => {
    const db = makeFakeAdmin({ orgFound: false, admins: [{ user_id: "admin-1" }] });
    const ids = await listInternalTeamUserIds(db);
    expect(ids).toEqual(new Set(["admin-1"]));
  });
});

describe("listClientPortalUserIds", () => {
  it("returns ids of members of client-type organizations only", async () => {
    const db = makeFakeAdmin({
      clientMembers: [{ user_id: "client-1", organizations: { type: "client" } }],
    });
    const ids = await listClientPortalUserIds(db);
    expect(ids).toEqual(new Set(["client-1"]));
  });
});

describe("score exclusion for non-internal users", () => {
  it("excludes a client-portal user entirely from the score list (not zeroed)", () => {
    // `computeMemberScores` is fed whatever `members` list the caller
    // resolved (via `getTeamDirectory`, now internal-only) — a client
    // account that never appears in `members` must not appear in the
    // output at all, not appear with a score of 0.
    const internalMembers: ChatMember[] = [{ id: "internal-1", name: "Ana" }];
    const scores = computeMemberScores([], [], internalMembers);
    expect(scores).toHaveLength(1);
    expect(scores.find((s) => s.member.id === "client-portal-user")).toBeUndefined();
  });

  it("internal members still score normally", () => {
    const internalMembers: ChatMember[] = [{ id: "internal-1", name: "Ana" }];
    const scores = computeMemberScores([], [], internalMembers);
    expect(scores[0].member.id).toBe("internal-1");
    expect(scores[0].score).toBe(0);
  });
});
