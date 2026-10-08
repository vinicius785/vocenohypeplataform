import { describe, expect, it } from "vitest";
import type { ClienteActivityEntry } from "@/lib/clientes-store";
import {
  buildClienteHistorico,
  historicoDateLabel,
  isTimelineAuditAction,
  type AuditRowLike,
} from "./cliente-historico";
import {
  campanhasOverview,
  financeOverview,
  hasComercialData,
  visibleCampanhas,
  CAMPANHAS_INICIAIS,
} from "./cliente-overview";

const act = (
  id: string,
  at: string,
  action: string,
  author = "Vinícius",
): ClienteActivityEntry => ({
  id,
  author,
  action,
  createdAt: at,
});
const audit = (
  id: string,
  action: string,
  at: string,
  target: string | null = "u1",
): AuditRowLike => ({
  id,
  action,
  created_at: at,
  target_user_id: target,
});
const members = [{ user_id: "u1", fullName: "Maria", email: "maria@x.com" }];

describe("histórico do cliente", () => {
  it("sem permissão de auditoria: só activity, ordenado do mais recente", () => {
    const h = buildClienteHistorico({
      activity: [
        act("a", "2026-10-01T10:00:00Z", 'criou a campanha "X"'),
        act("b", "2026-10-05T10:00:00Z", "alterou o status de Captação para Ativo"),
      ],
      audit: null,
    });
    expect(h.map((e) => e.id)).toEqual(["activity:b", "activity:a"]);
    expect(h[1].text).toBe('Vinícius criou a campanha "X"');
  });

  it("admin: mescla, ordena e mostra o nome da pessoa — nunca JSON nem jargão", () => {
    const h = buildClienteHistorico({
      activity: [act("a", "2026-10-01T10:00:00Z", 'criou a campanha "X"')],
      audit: [audit("r1", "invite_sent", "2026-10-06T09:00:00Z")],
      members,
    });
    expect(h[0].text).toBe("Convite enviado para Maria");
    expect(h[0].person).toBe("Maria");
    for (const e of h) expect(e.text).not.toMatch(/access_audit|[{}]|invite_sent/);
  });

  it("ignora login/MFA/troca de ambiente", () => {
    expect(isTimelineAuditAction("login_success")).toBe(false);
    expect(isTimelineAuditAction("mfa_enrolled")).toBe(false);
    expect(
      buildClienteHistorico({
        activity: [],
        audit: [audit("r", "login_success", "2026-10-06T09:00:00Z")],
        members,
      }),
    ).toEqual([]);
  });

  it("evita duplicidade (suspended + member_suspended no mesmo minuto)", () => {
    const h = buildClienteHistorico({
      activity: [],
      audit: [
        audit("r1", "suspended", "2026-10-06T09:00:00Z"),
        audit("r2", "member_suspended", "2026-10-06T09:00:20Z"),
      ],
      members,
    });
    expect(h).toHaveLength(1);
    expect(h[0].text).toBe("Acesso de Maria suspenso");
  });

  it("alvo desconhecido: texto sem nome, sem quebrar", () => {
    const h = buildClienteHistorico({
      activity: [],
      audit: [audit("r", "invite_sent", "2026-10-06T09:00:00Z", "ghost")],
      members,
    });
    expect(h[0].text).toBe("Convite de acesso enviado");
  });

  it("motivo da troca de status vira observação", () => {
    const h = buildClienteHistorico({
      activity: [{ ...act("a", "2026-10-01T10:00:00Z", "alterou o status"), reason: " fechou " }],
    });
    expect(h[0].note).toBe("fechou");
  });

  it("rótulo de data: sem ano no ano corrente, com ano nos demais", () => {
    const now = new Date(2026, 9, 8);
    expect(historicoDateLabel(new Date(2026, 9, 8, 12).toISOString(), now)).toBe("08 out.");
    expect(historicoDateLabel(new Date(2025, 2, 3, 12).toISOString(), now)).toBe("03 mar. 2025");
    expect(historicoDateLabel("lixo", now)).toBe("");
  });
});

describe("núcleos", () => {
  it("campanhas: total e ativas", () => {
    const camps = [{ status: "active" }, { status: "planning" }, {}] as never[];
    expect(campanhasOverview(camps)).toEqual({ total: 3, ativas: 1 });
    expect(campanhasOverview([])).toEqual({ total: 0, ativas: 0 });
  });

  it("financeiro: sem lançamentos não inventa números", () => {
    expect(financeOverview([])).toEqual({ hasMovement: false });
  });

  it("financeiro: a receber e vencido (só receita)", () => {
    const e = (kind: string, status: string, vencimento: string, amount: number) =>
      ({ kind, status, vencimento, amount }) as never;
    const r = financeOverview(
      [
        e("receita", "a_receber", "2026-09-01", 100),
        e("receita", "a_receber", "2026-12-01", 50),
        e("despesa", "a_pagar", "2026-09-01", 999),
      ],
      "2026-10-08",
    );
    expect(r).toMatchObject({ hasMovement: true, aReceber: 150, vencido: 100 });
  });

  it("campanhas: mostra um número inicial e expande", () => {
    const list = Array.from({ length: 9 }, (_, i) => i);
    expect(visibleCampanhas(list, false)).toHaveLength(CAMPANHAS_INICIAIS);
    expect(visibleCampanhas(list, true)).toHaveLength(9);
  });

  it("comercial só existe com algum dado preenchido", () => {
    expect(hasComercialData({})).toBe(false);
    expect(hasComercialData({ proximoPasso: "  " })).toBe(false);
    expect(hasComercialData({ previsaoFechamento: "2026-12-01" })).toBe(true);
  });
});

describe("histórico: convite x acesso", () => {
  it("convite enviado NÃO diz que o acesso foi concedido", () => {
    const h = buildClienteHistorico({
      activity: [],
      audit: [audit("1", "invite_sent", "2026-10-06T09:00:00Z")],
      members,
    });
    expect(h[0].text).toBe("Convite enviado para Maria");
    expect(h[0].text).not.toMatch(/concedido/);
  });
  it("aceite concede o acesso", () => {
    const h = buildClienteHistorico({
      activity: [],
      audit: [audit("2", "invite_accepted", "2026-10-07T09:00:00Z")],
      members,
    });
    expect(h[0].text).toBe("Maria aceitou o convite e recebeu acesso ao portal");
  });
  it("convite excluído usa o nome guardado no evento (a conta não existe mais)", () => {
    const h = buildClienteHistorico({
      activity: [],
      audit: [
        {
          ...audit("3", "invite_cancelled", "2026-10-07T10:00:00Z", null),
          previous_value: { status: "invited", email: "t@x.com", name: "Atendimento Terê" },
        },
      ],
      members,
    });
    expect(h[0].text).toBe("Convite para Atendimento Terê excluído");
  });
  it("convite enviado a quem foi excluído mostra o nome gravado no envio", () => {
    const h = buildClienteHistorico({
      activity: [],
      audit: [
        {
          ...audit("4", "invite_sent", "2026-10-05T10:00:00Z", "gone"),
          new_value: { email: "f@x.com", name: "Fernando" },
        },
      ],
      members,
    });
    expect(h[0].text).toBe("Convite enviado para Fernando");
  });
  it("revogar acesso fala em acesso revogado", () => {
    const h = buildClienteHistorico({
      activity: [],
      audit: [audit("5", "removed", "2026-10-07T11:00:00Z")],
      members,
    });
    expect(h[0].text).toBe("Acesso de Maria revogado");
  });
});
