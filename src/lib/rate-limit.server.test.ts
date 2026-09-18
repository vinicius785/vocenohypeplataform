import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

/**
 * Covers piece C of the 2026-09-18 security pass (see CLAUDE.md):
 * `checkRateLimit`'s core counting logic, and that it fails OPEN (never
 * blocks) on any Supabase error — a rate-limiter outage must never itself
 * become a login outage (see the incident note in CLAUDE.md).
 */

type FakeInsertResult = { error: { message: string } | null };
type FakeCountResult = { count: number | null; error: { message: string } | null };

function fakeSupabaseAdmin(opts: {
  insertResult?: FakeInsertResult;
  countResult?: FakeCountResult;
}) {
  const insertResult = opts.insertResult ?? { error: null };
  const countResult = opts.countResult ?? { count: 0, error: null };
  return {
    from: () => ({
      insert: () => Promise.resolve(insertResult),
      select: () => ({
        eq: () => ({
          gte: () => Promise.resolve(countResult),
        }),
      }),
    }),
  } as never;
}

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows the attempt when the count is within the limit", async () => {
    vi.doMock("@/integrations/supabase/client.server", () => ({
      supabaseAdmin: fakeSupabaseAdmin({ countResult: { count: 3, error: null } }),
    }));
    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    await expect(checkRateLimit("login:test@example.com", 10, 900)).resolves.toBe(true);
  });

  it("blocks the attempt once the count exceeds the limit", async () => {
    vi.doMock("@/integrations/supabase/client.server", () => ({
      supabaseAdmin: fakeSupabaseAdmin({ countResult: { count: 11, error: null } }),
    }));
    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    await expect(checkRateLimit("login:test@example.com", 10, 900)).resolves.toBe(false);
  });

  it("fails open (allows) when the insert errors", async () => {
    vi.doMock("@/integrations/supabase/client.server", () => ({
      supabaseAdmin: fakeSupabaseAdmin({ insertResult: { error: { message: "boom" } } }),
    }));
    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    await expect(checkRateLimit("login:test@example.com", 10, 900)).resolves.toBe(true);
  });

  it("fails open (allows) when the count query errors", async () => {
    vi.doMock("@/integrations/supabase/client.server", () => ({
      supabaseAdmin: fakeSupabaseAdmin({
        countResult: { count: null, error: { message: "boom" } },
      }),
    }));
    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    await expect(checkRateLimit("login:test@example.com", 10, 900)).resolves.toBe(true);
  });
});

describe("emailBucket", () => {
  it("normalizes case and whitespace so the same address always maps to one bucket", async () => {
    const { emailBucket } = await import("@/lib/rate-limit.server");
    expect(emailBucket("login", " Foo@Bar.com ")).toBe("login:foo@bar.com");
    expect(emailBucket("login", "foo@bar.com")).toBe("login:foo@bar.com");
  });
});
