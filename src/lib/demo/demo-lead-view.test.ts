import { describe, expect, it } from "vitest";
import {
  DEMO_ACTION_CONFIRM,
  DEMO_ACTION_LABEL,
  DEMO_ACTION_SUCCESS,
  describeDemo,
  formatDemoDate,
  type DemoCardAction,
} from "./demo-lead-view";
import type { DemoAccessState, DemoSessionView } from "./demo-types";

const NOW = new Date("2026-10-05T15:00:00.000Z");

function session(access: DemoAccessState, over: Partial<DemoSessionView> = {}): DemoSessionView {
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
    created_by: "u1",
    created_at: "2026-10-05T15:00:00.000Z",
    updated_at: "2026-10-05T15:00:00.000Z",
    access,
    ...over,
  };
}

describe("describeDemo", () => {
  it("ativa: selo verde, validade e todas as ações de gestão", () => {
    const v = describeDemo(session("ativo"), NOW);
    expect(v).toMatchObject({ statusLabel: "Ativa", tone: "success", canCreateNew: false });
    expect(v.summary).toBe("Link válido até 19/10 · 14 dias restantes");
    expect(v.menu).toEqual([
      "abrir_cliente",
      "renovar",
      "novo_link",
      "reiniciar",
      "revogar",
      "encerrar",
    ]);
    expect(v.canShareLink).toBe(true);
  });

  it("perto do fim, o resumo avisa em vez de contar dias", () => {
    const v = describeDemo(session("ativo", { token_expires_at: "2026-10-05T20:00:00.000Z" }), NOW);
    expect(v.summary).toContain("expira hoje ou amanhã");
  });

  it("expirada: aviso, pode renovar; não oferece revogar (já não funciona)", () => {
    const v = describeDemo(session("expirado"), NOW);
    expect(v).toMatchObject({ statusLabel: "Link expirado", tone: "warning" });
    expect(v.menu).toEqual(["renovar", "novo_link", "reiniciar", "encerrar"]);
    expect(v.menu).not.toContain("revogar");
  });

  it("revogada: só novo link (renovar um link revogado gera token novo), reiniciar e encerrar", () => {
    const v = describeDemo(session("revogado"), NOW);
    expect(v).toMatchObject({ statusLabel: "Acesso revogado", tone: "danger" });
    expect(v.summary).toContain("06/10");
    expect(v.menu).toEqual(["novo_link", "reiniciar", "encerrar"]);
  });

  it("encerrada: sem ações de gestão e permite criar uma nova", () => {
    const v = describeDemo(session("encerrado"), NOW);
    expect(v).toMatchObject({ statusLabel: "Encerrada", tone: "secondary", canCreateNew: true });
    expect(v.menu).toEqual([]);
    expect(v.summary).toContain("07/10");
  });

  it("só a demo ATIVA oferece compartilhar o link (link morto não se copia)", () => {
    for (const a of ["expirado", "revogado", "encerrado"] as const) {
      const v = describeDemo(session(a), NOW);
      expect(v.canShareLink, a).toBe(false);
      expect(v.menu, a).not.toContain("abrir_cliente");
    }
  });

  it("só a encerrada permite nova demo (uma ativa por lead)", () => {
    for (const a of ["ativo", "expirado", "revogado"] as const) {
      expect(describeDemo(session(a), NOW).canCreateNew, a).toBe(false);
    }
  });
});

describe("rótulos e confirmações", () => {
  const all: DemoCardAction[] = [
    "abrir",
    "copiar_link",
    "abrir_cliente",
    "reiniciar",
    "renovar",
    "novo_link",
    "revogar",
    "encerrar",
  ];

  it("toda ação tem rótulo; toda ação do menu (exceto abrir) tem mensagem de sucesso", () => {
    for (const a of all) expect(DEMO_ACTION_LABEL[a], a).toBeTruthy();
    for (const a of all.filter((x) => x !== "abrir" && x !== "abrir_cliente")) {
      expect(DEMO_ACTION_SUCCESS[a as keyof typeof DEMO_ACTION_SUCCESS], a).toBeTruthy();
    }
  });

  it("ações que desfazem ou cortam acesso pedem confirmação dizendo o que acontece; renovar não", () => {
    for (const a of ["reiniciar", "revogar", "encerrar", "novo_link"] as const) {
      expect(DEMO_ACTION_CONFIRM[a]?.message.length, a).toBeGreaterThan(30);
    }
    expect(DEMO_ACTION_CONFIRM.renovar).toBeUndefined();
    expect(DEMO_ACTION_CONFIRM.abrir).toBeUndefined();
    expect(DEMO_ACTION_CONFIRM.encerrar?.destructive).toBe(true);
    expect(DEMO_ACTION_CONFIRM.novo_link?.destructive).toBe(false);
  });

  it("toda ação do menu de qualquer estado existe nos rótulos", () => {
    for (const a of ["ativo", "expirado", "revogado", "encerrado"] as const) {
      for (const m of describeDemo(session(a), NOW).menu) expect(DEMO_ACTION_LABEL[m]).toBeTruthy();
    }
  });
});

describe("formatDemoDate", () => {
  it("dd/mm no fuso de Brasília (01h UTC ainda é o dia anterior)", () => {
    expect(formatDemoDate("2026-10-06T01:00:00.000Z")).toBe("05/10");
    expect(formatDemoDate("2026-10-06T12:00:00.000Z")).toBe("06/10");
  });

  it("vazio ou inválido vira travessão", () => {
    for (const v of [null, undefined, "", "lixo"]) expect(formatDemoDate(v)).toBe("—");
  });
});
