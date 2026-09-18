import { describe, expect, it } from "vitest";
import { shouldRequireMfaChallenge } from "@/lib/mfa.functions";

/**
 * Covers the one piece of pure logic behind Phase 3 part 2's login-flow MFA
 * gate (see CLAUDE.md): the invariant that a user with no enrolled factor,
 * or a session that already satisfies aal2, must take EXACTLY the same
 * (unchanged) path through `src/routes/index.tsx` as before this feature
 * existed. Only the narrow "has a verified factor, hasn't verified it yet
 * this session" case should route to the challenge step.
 */
describe("shouldRequireMfaChallenge", () => {
  it("requires a challenge when a factor is enrolled and this session hasn't verified it", () => {
    expect(shouldRequireMfaChallenge("aal1", "aal2")).toBe(true);
  });

  it("does not require a challenge when no factor is enrolled (aal1 -> aal1)", () => {
    expect(shouldRequireMfaChallenge("aal1", "aal1")).toBe(false);
  });

  it("does not require a challenge when the session already satisfies aal2", () => {
    expect(shouldRequireMfaChallenge("aal2", "aal2")).toBe(false);
  });

  it("fails safe (no challenge) on null/undefined levels rather than blocking login", () => {
    expect(shouldRequireMfaChallenge(null, null)).toBe(false);
    expect(shouldRequireMfaChallenge(undefined, undefined)).toBe(false);
    expect(shouldRequireMfaChallenge(null, "aal2")).toBe(false);
  });

  it("does not require a challenge for an unexpected downgrade (aal2 -> aal1)", () => {
    expect(shouldRequireMfaChallenge("aal2", "aal1")).toBe(false);
  });
});
