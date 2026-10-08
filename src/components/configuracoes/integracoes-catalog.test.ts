import { describe, expect, it } from "vitest";
import {
  INTEGRATIONS,
  filterIntegrations,
  integrationCardState,
  integrationCategories,
} from "./integracoes-catalog";

const ids = (l: { id: string }[]) => l.map((i) => i.id);

describe("catálogo de integrações", () => {
  it("só as integrações reais (3) e as categorias vêm delas", () => {
    expect(INTEGRATIONS).toHaveLength(3);
    expect(integrationCategories(INTEGRATIONS)).toEqual(["Calendário", "Automação"]);
  });
  it("busca por nome, categoria e descrição (sem acento/caixa)", () => {
    expect(ids(filterIntegrations(INTEGRATIONS, "Google", "todas"))).toEqual(["google-agenda"]);
    expect(ids(filterIntegrations(INTEGRATIONS, "automacao", "todas"))).toEqual([
      "webhook-leads",
      "webhooks-saida",
    ]);
    expect(ids(filterIntegrations(INTEGRATIONS, "calendário", "todas"))).toEqual(["google-agenda"]);
    expect(ids(filterIntegrations(INTEGRATIONS, "zapier", "todas"))).toEqual([
      "webhook-leads",
      "webhooks-saida",
    ]);
  });
  it("categoria e busca valem juntas; sem resultado devolve vazio", () => {
    expect(ids(filterIntegrations(INTEGRATIONS, "", "Calendário"))).toEqual(["google-agenda"]);
    expect(filterIntegrations(INTEGRATIONS, "google", "Automação")).toEqual([]);
    expect(filterIntegrations(INTEGRATIONS, "xyz", "todas")).toEqual([]);
  });
});

describe("estado no card", () => {
  const ctx = {
    isAdmin: true as boolean | null,
    google: "disconnected" as const,
    outgoingActive: 0 as number | null,
  };
  it("Google: conectado, atenção, não conectado, carregando", () => {
    expect(integrationCardState("google-agenda", { ...ctx, google: "connected" })?.label).toBe(
      "Conectado",
    );
    expect(integrationCardState("google-agenda", { ...ctx, google: "attention" })?.tone).toBe(
      "warn",
    );
    expect(integrationCardState("google-agenda", ctx)?.label).toBe("Não conectado");
    expect(integrationCardState("google-agenda", { ...ctx, google: "loading" })).toBeUndefined();
  });
  it("webhooks: só admin vê estado; contagem de ativos", () => {
    expect(integrationCardState("webhooks-saida", { ...ctx, isAdmin: false })?.label).toBe(
      "Somente administradores",
    );
    expect(integrationCardState("webhooks-saida", { ...ctx, outgoingActive: 2 })?.label).toBe(
      "2 ativos",
    );
    expect(integrationCardState("webhooks-saida", { ...ctx, outgoingActive: 1 })?.label).toBe(
      "1 ativo",
    );
    expect(integrationCardState("webhooks-saida", ctx)?.label).toBe("Nenhum webhook");
    expect(integrationCardState("webhook-leads", ctx)?.label).toBe("Disponível");
  });
  it("Google não é restrito a admin (cada pessoa conecta a própria conta)", () => {
    expect(integrationCardState("google-agenda", { ...ctx, isAdmin: false })?.label).toBe(
      "Não conectado",
    );
  });
});
