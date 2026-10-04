import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { Lead } from "@/lib/comercial";
import type { CommercialInteractionRow } from "@/lib/commercial-interactions.functions";
import { applyFollowUpToCaches } from "./comercial-followup-cache";

const ID = "11111111-1111-4111-8111-111111111111";
const lead = (id: string, over: Partial<Lead> = {}) => ({ id, name: id, ...over }) as Lead;
const row = (id: string, occurred_at: string): CommercialInteractionRow => ({
  id,
  opportunity_id: ID,
  created_by: "u",
  created_by_name: "Ana",
  interaction_type: "whatsapp",
  occurred_at,
  summary: "x",
  outcome: null,
  next_action_description: null,
  next_action_at: null,
  created_at: occurred_at,
  updated_at: occurred_at,
});
const input = {
  interactionType: "whatsapp" as const,
  occurredAt: "2026-10-04T13:00:00Z",
  summary: "x",
  nextActionDescription: "Enviar contrato",
  nextActionAt: "2026-10-06T17:00:00Z",
};

describe("applyFollowUpToCaches", () => {
  it("entra no histórico já carregado, na posição certa, e atualiza o lead em toda lista", () => {
    const qc = new QueryClient();
    qc.setQueryData(["commercial-interactions", ID], [row("a", "2026-10-03T10:00:00Z")]);
    qc.setQueryData(["leads", { sort: "x" }], [lead(ID), lead("outro")]);
    qc.setQueryData(["leads"], [lead(ID)]); // lista do Início

    applyFollowUpToCaches(qc, ID, row("novo", "2026-10-04T13:00:00Z"), input);

    expect(
      qc
        .getQueryData<CommercialInteractionRow[]>(["commercial-interactions", ID])!
        .map((r) => r.id),
    ).toEqual(["novo", "a"]);
    for (const key of [["leads", { sort: "x" }], ["leads"]]) {
      const l = qc.getQueryData<Lead[]>(key)!.find((x) => x.id === ID)!;
      expect(l.nextActionAt).toBe(Date.parse("2026-10-06T17:00:00Z"));
      expect(l.nextActionDescription).toBe("Enviar contrato");
      expect(l.lastContactAt).toBe(Date.parse("2026-10-04T13:00:00Z"));
    }
    // outro lead intacto
    expect(qc.getQueryData<Lead[]>(["leads", { sort: "x" }])![1].nextActionAt).toBeUndefined();
  });

  it("não cria histórico parcial quando ele ainda não foi carregado", () => {
    const qc = new QueryClient();
    applyFollowUpToCaches(qc, ID, row("novo", "2026-10-04T13:00:00Z"), input);
    expect(qc.getQueryData(["commercial-interactions", ID])).toBeUndefined();
  });

  it("reaplicar o mesmo registro não duplica", () => {
    const qc = new QueryClient();
    qc.setQueryData(["commercial-interactions", ID], [row("novo", "2026-10-04T13:00:00Z")]);
    applyFollowUpToCaches(qc, ID, row("novo", "2026-10-04T13:00:00Z"), input);
    expect(qc.getQueryData<unknown[]>(["commercial-interactions", ID])).toHaveLength(1);
  });
});
