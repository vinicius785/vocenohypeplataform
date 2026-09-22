import { describe, expect, it } from "vitest";
import { accessAuditActionLabel, isInviteCosmeticallyExpired } from "@/lib/access-audit-labels";

describe("accessAuditActionLabel", () => {
  it("maps every known action to a PT-BR label", () => {
    expect(accessAuditActionLabel("invite_sent")).toBe("Convite enviado");
    expect(accessAuditActionLabel("role_changed")).toBe("Função alterada");
  });

  it("falls back to the raw string for an unmapped action", () => {
    expect(accessAuditActionLabel("something_new")).toBe("something_new");
  });
});

describe("isInviteCosmeticallyExpired", () => {
  const now = new Date("2026-09-22T12:00:00Z");

  it("is false for a non-invited status regardless of age", () => {
    expect(
      isInviteCosmeticallyExpired({ status: "active", invited_at: "2026-01-01T00:00:00Z" }, now),
    ).toBe(false);
  });

  it("is false for an invite younger than the expiry window", () => {
    expect(
      isInviteCosmeticallyExpired({ status: "invited", invited_at: "2026-09-20T12:00:00Z" }, now),
    ).toBe(false);
  });

  it("is true for an invite older than 7 days, still invited", () => {
    expect(
      isInviteCosmeticallyExpired({ status: "invited", invited_at: "2026-09-10T12:00:00Z" }, now),
    ).toBe(true);
  });

  it("is false when invited_at is missing", () => {
    expect(isInviteCosmeticallyExpired({ status: "invited", invited_at: null }, now)).toBe(false);
  });
});
