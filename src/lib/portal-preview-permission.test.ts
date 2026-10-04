import { describe, expect, it } from "vitest";
import {
  assertCanPreviewClientPortal,
  type PermissionRpcClient,
} from "./portal-preview-permission";

function client(grants: Record<string, boolean>, failOn?: string): PermissionRpcClient {
  return {
    rpc: async (fn, args) => {
      const key = fn === "has_permission" ? `perm:${args._permission}` : fn;
      if (failOn === key) return { data: null, error: { message: "boom" } };
      return { data: grants[key] ?? false, error: null };
    },
  };
}
const ctx = (supabase: PermissionRpcClient) => ({ supabase, userId: "u1" });

describe("assertCanPreviewClientPortal", () => {
  it("libera equipe interna com permissão em clientes ou campanhas", async () => {
    await expect(
      assertCanPreviewClientPortal(
        ctx(client({ is_internal_team_member: true, "perm:clientes": true })),
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertCanPreviewClientPortal(ctx(client({ is_admin: true, "perm:campanhas": true }))),
    ).resolves.toBeUndefined();
  });
  it("nega conta que não é da equipe, mesmo com permissão", async () => {
    await expect(
      assertCanPreviewClientPortal(ctx(client({ "perm:clientes": true }))),
    ).rejects.toThrow("Sem permissão");
  });
  it("nega equipe sem permissão em clientes/campanhas", async () => {
    await expect(
      assertCanPreviewClientPortal(ctx(client({ is_internal_team_member: true }))),
    ).rejects.toThrow("Sem permissão");
  });
  it("erro ao verificar nunca libera", async () => {
    await expect(
      assertCanPreviewClientPortal(
        ctx(client({ is_internal_team_member: true, "perm:clientes": true }, "perm:clientes")),
      ),
    ).rejects.toThrow("verificar");
  });
});
