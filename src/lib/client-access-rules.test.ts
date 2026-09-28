import { describe, expect, it } from "vitest";
import {
  countActiveAdmins,
  isClientAdminRole,
  isValidClientAccessRole,
  wouldRemoveLastAdmin,
} from "./client-access-rules";

describe("isClientAdminRole", () => {
  it("só client_standard é admin", () => {
    expect(isClientAdminRole("client_standard")).toBe(true);
    expect(isClientAdminRole("client_approver")).toBe(false);
    expect(isClientAdminRole("client_viewer")).toBe(false);
  });
});

describe("isValidClientAccessRole", () => {
  it("aceita só os 3 papéis reais", () => {
    expect(isValidClientAccessRole("client_standard")).toBe(true);
    expect(isValidClientAccessRole("client_approver")).toBe(true);
    expect(isValidClientAccessRole("client_viewer")).toBe(true);
    expect(isValidClientAccessRole("internal_admin")).toBe(false);
    expect(isValidClientAccessRole("admin")).toBe(false);
  });
});

describe("countActiveAdmins", () => {
  it("conta só admins com status ativo", () => {
    const members = [
      { role: "client_standard", status: "active" },
      { role: "client_standard", status: "removed" },
      { role: "client_approver", status: "active" },
      { role: "client_viewer", status: "active" },
    ];
    expect(countActiveAdmins(members)).toBe(1);
  });
});

describe("wouldRemoveLastAdmin — nunca deixa a empresa sem administrador", () => {
  it("true ao tentar remover/rebaixar o único admin ativo", () => {
    const members = [
      { id: "m1", role: "client_standard", status: "active" },
      { id: "m2", role: "client_viewer", status: "active" },
    ];
    expect(wouldRemoveLastAdmin(members, "m1")).toBe(true);
  });

  it("false quando existe outro admin ativo", () => {
    const members = [
      { id: "m1", role: "client_standard", status: "active" },
      { id: "m2", role: "client_standard", status: "active" },
    ];
    expect(wouldRemoveLastAdmin(members, "m1")).toBe(false);
  });

  it("false pro alvo que não é admin (nunca bloqueia mudança de não-admin)", () => {
    const members = [
      { id: "m1", role: "client_standard", status: "active" },
      { id: "m2", role: "client_viewer", status: "active" },
    ];
    expect(wouldRemoveLastAdmin(members, "m2")).toBe(false);
  });

  it("false quando o admin alvo já não está ativo (removido, convite pendente)", () => {
    const members = [
      { id: "m1", role: "client_standard", status: "removed" },
      { id: "m2", role: "client_viewer", status: "active" },
    ];
    expect(wouldRemoveLastAdmin(members, "m1")).toBe(false);
  });

  it("um admin ativo + um segundo admin com convite pendente ainda conta como último admin ATIVO", () => {
    const members = [
      { id: "m1", role: "client_standard", status: "active" },
      { id: "m2", role: "client_standard", status: "invited" },
    ];
    expect(wouldRemoveLastAdmin(members, "m1")).toBe(true);
  });
});
