import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  deliverPush: vi.fn().mockResolvedValue(undefined),
  adminQueries: 0,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      h.adminQueries += 1;
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [{ user_id: "admin-1" }, { user_id: "admin-2" }] }),
        }),
      };
    },
  },
}));
vi.mock("@/lib/push.functions", () => ({ deliverPush: h.deliverPush }));

import type { Entrega } from "@/lib/influencer-model";
import { notifyTeamEntregaResponse } from "./cliente-link.functions";

const entrega = { id: "e1", tipo: "Reels", titulo: "Abertura" } as Entrega;

beforeEach(() => {
  h.deliverPush.mockClear();
  h.adminQueries = 0;
});

describe("notifyTeamEntregaResponse × Demo", () => {
  it("cliente real: avisa TODOS os admins (comportamento de antes)", async () => {
    await notifyTeamEntregaResponse({ empresa: "Praia Bonita" }, entrega, "aprovado");
    expect(h.deliverPush).toHaveBeenCalledTimes(1);
    const [ids, payload] = h.deliverPush.mock.calls[0];
    expect(ids).toEqual(["admin-1", "admin-2"]);
    expect(payload).toMatchObject({
      title: "Entrega aprovada",
      body: 'Praia Bonita aprovou "Reels · Abertura".',
    });
  });

  it("pedido de ajuste mantém o texto de antes", async () => {
    await notifyTeamEntregaResponse({ empresa: "Praia Bonita" }, entrega, "reprovado");
    expect(h.deliverPush.mock.calls[0][1]).toMatchObject({ title: "Ajustes solicitados" });
  });

  it("DEMONSTRAÇÃO: nenhum push e nem sequer consulta os admins", async () => {
    await notifyTeamEntregaResponse(
      { empresa: "Praia Bonita", demoSessionId: "sessao-1" },
      entrega,
      "aprovado",
    );
    expect(h.deliverPush).not.toHaveBeenCalled();
    expect(h.adminQueries).toBe(0);
  });
});
