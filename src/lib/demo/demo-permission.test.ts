import { describe, expect, it, vi } from "vitest";
import { DEMO_MANAGE_PERMISSION, assertCanManageDemo } from "./demo-permission";

function ctx(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { context: { supabase: { rpc }, userId: "user-1" }, rpc };
}

describe("assertCanManageDemo", () => {
  it("consulta `has_permission` com a permissão `comercial` do próprio usuário", async () => {
    const { context, rpc } = ctx({ data: true, error: null });
    await expect(assertCanManageDemo(context)).resolves.toBeUndefined();
    expect(DEMO_MANAGE_PERMISSION).toBe("comercial");
    expect(rpc).toHaveBeenCalledWith("has_permission", {
      _user_id: "user-1",
      _permission: "comercial",
    });
  });

  it("sem a permissão: recusa", async () => {
    const { context } = ctx({ data: false, error: null });
    await expect(assertCanManageDemo(context)).rejects.toThrow(/Sem permissão/);
  });

  it("qualquer resposta que não seja exatamente `true` recusa (fail-closed)", async () => {
    for (const data of [null, undefined, "true", 1, {}, []]) {
      await expect(
        assertCanManageDemo(ctx({ data, error: null }).context),
        String(data),
      ).rejects.toThrow(/Sem permissão/);
    }
  });

  it("erro do banco: recusa sem vazar o detalhe", async () => {
    const { context } = ctx({
      data: true,
      error: { message: "relation profiles: permission denied" },
    });
    const err = await assertCanManageDemo(context).catch((e: Error) => e);
    expect((err as Error).message).toBe("Não foi possível verificar sua permissão.");
    expect((err as Error).message).not.toMatch(/profiles|denied/);
  });
});
