import { describe, expect, it } from "vitest";
import {
  accessActivity,
  accessState,
  lastAccessAt,
  memberActions,
  relativeDay,
  INVITE_ACTIONS,
  inviteSentLabel,
  removeActionLabel,
  splitInvitesAndAccess,
} from "./portal-access-ui";
import { recordPortalAccessCore, ACCESS_RECORD_MIN_INTERVAL_MS } from "@/lib/portal-access-record";

const NOW = new Date(2026, 9, 8, 15, 0, 0); // 08/10/2026
const daysAgo = (n: number) => new Date(2026, 9, 8 - n, 10, 0, 0).toISOString();
const member = (o: Partial<Parameters<typeof accessActivity>[0]>) => ({
  status: "active",
  invited_at: daysAgo(10),
  accepted_at: null,
  last_access_at: null,
  ...o,
});

describe("estado x atividade", () => {
  it("caso 1: convite nunca aceito → Convite pendente + Convite enviado há X dias", () => {
    const m = member({ status: "invited", invited_at: daysAgo(3) });
    expect(accessState(m.status).label).toBe("Convite pendente");
    expect(accessActivity(m, NOW).text).toBe("Convite enviado há 3 dias");
  });

  it("caso 2: ativo que nunca entrou → Ativo + Nunca acessou (combinação válida)", () => {
    const m = member({});
    expect(accessState(m.status)).toMatchObject({ label: "Ativo", tone: "success" });
    expect(accessActivity(m, NOW).text).toBe("Nunca acessou");
  });

  it("caso 3: ativo que já entrou → Acessou há X dias / ontem / hoje", () => {
    expect(accessActivity(member({ last_access_at: daysAgo(2) }), NOW).text).toBe(
      "Acessou há 2 dias",
    );
    expect(accessActivity(member({ last_access_at: daysAgo(1) }), NOW).text).toBe("Acessou ontem");
    expect(
      accessActivity(member({ last_access_at: daysAgo(1), last_access_device: "mobile" }), NOW)
        .text,
    ).toBe("Acessou ontem · Celular");
    expect(
      accessActivity(member({ last_access_at: daysAgo(1), last_access_device: "desktop" }), NOW)
        .text,
    ).toBe("Acessou ontem · Computador");
    expect(accessActivity(member({ last_access_at: daysAgo(0) }), NOW).text).toBe("Acessou hoje");
  });

  it("caso 4: suspenso mantém o último acesso", () => {
    const m = member({ status: "suspended", last_access_at: daysAgo(5) });
    expect(accessState(m.status).label).toBe("Suspenso");
    expect(accessActivity(m, NOW).text).toBe("Último acesso há 5 dias");
  });

  it("caso 5: revogado — com e sem acesso real", () => {
    expect(accessState("removed").label).toBe("Revogado");
    expect(
      accessActivity(member({ status: "removed", last_access_at: daysAgo(12) }), NOW).text,
    ).toBe("Último acesso há 12 dias");
    expect(accessActivity(member({ status: "removed" }), NOW).text).toBe("Nunca acessou");
  });

  it("acesso antigo vira data (≥ 30 dias)", () => {
    expect(accessActivity(member({ last_access_at: "2026-08-24T12:00:00" }), NOW).text).toBe(
      "Último acesso em 24 ago. 2026",
    );
  });

  it("nunca inventa acesso a partir de convite/criação", () => {
    const m = member({ invited_at: daysAgo(1), last_access_at: null, accepted_at: null });
    expect(lastAccessAt(m)).toBeNull();
  });

  it("aceite do convite = primeiro login: vale como acesso quando não há last_access_at", () => {
    const m = member({ accepted_at: daysAgo(4) });
    expect(accessActivity(m, NOW).text).toBe("Acessou há 4 dias");
    // e o mais recente dos dois vence
    expect(lastAccessAt({ accepted_at: daysAgo(9), last_access_at: daysAgo(2) })).toBe(daysAgo(2));
  });

  it("tooltip traz data e hora completas", () => {
    expect(accessActivity(member({ last_access_at: daysAgo(2) }), NOW).title).toMatch(
      /\d{2}\/\d{2}\/\d{4}/,
    );
  });

  it("relativeDay", () => {
    expect(relativeDay(daysAgo(0), NOW)).toBe("hoje");
    expect(relativeDay(daysAgo(29), NOW)).toBe("há 29 dias");
  });
});

describe("ações por estado", () => {
  it("ativo", () =>
    expect(memberActions("active")).toEqual(["role", "campaigns", "suspend", "remove"]));
  it("convite pendente não tem ações de acesso (tem menu próprio: reenviar/excluir)", () => {
    expect(memberActions("invited")).toEqual([]);
    expect(INVITE_ACTIONS).toEqual(["resend", "cancel"]);
  });
  it("suspenso: reativar, sem suspender nem reenviar", () => {
    expect(memberActions("suspended")).toContain("reactivate");
    expect(memberActions("suspended")).not.toContain("suspend");
    expect(memberActions("suspended")).not.toContain("resend");
  });
  it("revogado: nenhuma ação (o domínio não reativa nem reconvida)", () => {
    expect(memberActions("removed")).toEqual([]);
  });
  it("ativo não reenvia convite", () => expect(memberActions("active")).not.toContain("resend"));
});

describe("registro do acesso (origem de last_access_at)", () => {
  function fakeAdmin() {
    const calls: { table: string; patch: unknown; filters: [string, unknown][]; or?: string }[] =
      [];
    const admin = {
      from: (table: string) => {
        const call = {
          table,
          patch: undefined as unknown,
          filters: [] as [string, unknown][],
          or: undefined as string | undefined,
        };
        const chain: Record<string, unknown> = {
          update: (patch: unknown) => {
            call.patch = patch;
            return chain;
          },
          eq: (k: string, v: unknown) => {
            call.filters.push([k, v]);
            return chain;
          },
          or: (expr: string) => {
            call.or = expr;
            calls.push(call);
            return Promise.resolve({ error: null });
          },
        };
        return chain;
      },
    };
    return { admin, calls };
  }

  it("grava só a linha do próprio usuário, só se ativo, e só se vazio/antigo", async () => {
    const { admin, calls } = fakeAdmin();
    const now = new Date("2026-10-08T15:00:00.000Z");
    await recordPortalAccessCore(admin as never, { userId: "u1", organizationId: "o1", now });
    expect(calls).toHaveLength(1);
    expect(calls[0].patch).toEqual({ last_access_at: now.toISOString() });
    expect(calls[0].filters).toEqual([
      ["user_id", "u1"],
      ["organization_id", "o1"],
      ["status", "active"],
    ]);
    const cutoff = new Date(now.getTime() - ACCESS_RECORD_MIN_INTERVAL_MS).toISOString();
    expect(calls[0].or).toBe(`last_access_at.is.null,last_access_at.lt.${cutoff}`);
  });
});

describe("convite x acesso", () => {
  it("convites e acessos são listas disjuntas", () => {
    const ms = [
      { status: "invited" },
      { status: "active" },
      { status: "suspended" },
      { status: "removed" },
    ];
    const { invites, access } = splitInvitesAndAccess(ms);
    expect(invites).toHaveLength(1);
    expect(access.map((m) => m.status)).toEqual(["active", "suspended", "removed"]);
  });
  it("rótulo do envio", () => {
    expect(inviteSentLabel(daysAgo(0), NOW)).toBe("Enviado hoje");
    expect(inviteSentLabel(daysAgo(3), NOW)).toBe("Enviado há 3 dias");
    expect(inviteSentLabel(null, NOW)).toBe("Enviado");
  });
});
