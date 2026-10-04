import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DemoAccessState, DemoSessionView } from "@/lib/demo/demo-types";
import { LeadDemoCardView } from "./LeadDemoCard";

const NOW = new Date("2026-10-05T15:00:00.000Z");

function session(access: DemoAccessState): DemoSessionView {
  return {
    id: "s1",
    lead_id: "l1",
    cliente_id: "c1",
    campanha_id: "k1",
    organization_id: "o1",
    scenario: "campanha-completa",
    seed_version: 1,
    status: access === "encerrado" ? "closed" : "active",
    token_expires_at: "2026-10-19T15:00:00.000Z",
    access_revoked_at: access === "revogado" ? "2026-10-06T12:00:00.000Z" : null,
    closed_at: access === "encerrado" ? "2026-10-07T12:00:00.000Z" : null,
    last_client_access_at: null,
    realtime_key: "k",
    created_by: "u",
    created_at: "x",
    updated_at: "x",
    access,
  };
}

const noop = () => {};
const render = (
  s: DemoSessionView | null,
  pending: Parameters<typeof LeadDemoCardView>[0]["pending"] = null,
) =>
  renderToStaticMarkup(
    <LeadDemoCardView session={s} now={NOW} pending={pending} onCreate={noop} onAction={noop} />,
  );

describe("LeadDemoCardView", () => {
  it("sem demo: convite curto e UM botão de criar (sem menu, sem abrir)", () => {
    const html = render(null);
    expect(html).toContain("Demonstração");
    expect(html).toContain("Criar demonstração");
    expect(html).not.toContain("Abrir campanha");
    expect(html).not.toContain("Mais ações da demonstração");
  });

  it("ativa: selo verde, validade, Abrir campanha e menu •••", () => {
    const html = render(session("ativo"));
    expect(html).toContain("Ativa");
    expect(html).toContain("bg-success-soft");
    expect(html).toContain("Link válido até 19/10");
    expect(html).toContain("Abrir campanha");
    expect(html).toContain('aria-label="Mais ações da demonstração"');
    expect(html).not.toContain("Criar nova demonstração");
  });

  it("expirada e revogada: estados distintos, com menu", () => {
    expect(render(session("expirado"))).toContain("Link expirado");
    const rev = render(session("revogado"));
    expect(rev).toContain("Acesso revogado");
    expect(rev).toContain("bg-danger-soft");
    expect(rev).toContain('aria-label="Mais ações da demonstração"');
  });

  it("encerrada: oferece criar NOVA demonstração e não mostra menu de gestão", () => {
    const html = render(session("encerrado"));
    expect(html).toContain("Encerrada");
    expect(html).toContain("Criar nova demonstração");
    expect(html).toContain("Abrir campanha");
    expect(html).not.toContain("Mais ações da demonstração");
  });

  it("ação em andamento desabilita os botões (não dispara duas vezes)", () => {
    const html = render(session("ativo"), "reiniciar");
    const disabled = html.match(/disabled=""/g) ?? [];
    expect(disabled.length).toBeGreaterThanOrEqual(2); // Abrir campanha + menu
  });

  it("nunca imprime o token (a visão do time não o tem)", () => {
    expect(render(session("ativo"))).not.toMatch(/token"|\/demo\//);
  });

  it("'Copiar link' só com a demo ativa", () => {
    expect(render(session("ativo"))).toContain("Copiar link");
    for (const a of ["expirado", "revogado", "encerrado"] as const) {
      expect(render(session(a)), a).not.toContain("Copiar link");
    }
  });
});
