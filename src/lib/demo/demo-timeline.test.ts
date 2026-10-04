import { describe, expect, it } from "vitest";
import type { Influ, InfluActivityEvent } from "@/lib/influencer-model";
import { buildDemoScenario, demoCampanhaId, demoClienteId } from "./cenario-campanha-completa";
import { buildDemoTimeline } from "./demo-timeline";
import type { DemoEventRow } from "./demo-types";

const SESSION = "11111111-2222-4333-8444-555555555555";
const NOW = new Date("2026-10-05T15:00:00.000Z");

const scenarioInflus = () =>
  buildDemoScenario({
    sessionId: SESSION,
    clienteId: demoClienteId(SESSION),
    campanhaId: demoCampanhaId(SESSION),
    now: NOW,
    empresa: "X",
    assetUrl: (s) => `https://x/${s.path}`,
  }).payload.influenciadores.map((r) => r.data);

const ev = (over: Partial<InfluActivityEvent>): InfluActivityEvent => ({
  id: "e",
  kind: "perfil_aprovado",
  actor: { type: "cliente", name: "C", initials: "C", color: "x" },
  createdAt: "2026-10-05T12:00:00.000Z",
  ...over,
});

const influ = (over: Partial<Influ>): Influ =>
  ({
    id: "i",
    nome: "Beatriz Costa",
    redes: [],
    entregas: [],
    status: "APROVADO",
    ...over,
  }) as Influ;

describe("frases da narrativa", () => {
  const cases: Array<[Partial<InfluActivityEvent>, string, string | undefined]> = [
    [
      { kind: "perfil_enviado", actor: { type: "equipe", name: "T", initials: "T", color: "" } },
      "Time enviou Beatriz Costa ao cliente",
      undefined,
    ],
    [{ kind: "perfil_aprovado" }, "Cliente aprovou Beatriz Costa", undefined],
    [
      { kind: "perfil_recusado", motivoLabel: "Público incompatível" },
      "Cliente reprovou Beatriz Costa",
      "Público incompatível",
    ],
    [{ kind: "perfil_reaberto" }, "Cliente reabriu a decisão sobre Beatriz Costa", undefined],
    [
      { kind: "comentario_cliente", comentario: "Gostei" },
      "Cliente comentou em Beatriz Costa",
      "Gostei",
    ],
    [
      {
        kind: "comentario_equipe",
        comentario: "Ok",
        actor: { type: "equipe", name: "T", initials: "T", color: "" },
      },
      "Time comentou em Beatriz Costa",
      "Ok",
    ],
  ];

  for (const [over, text, detail] of cases) {
    it(`${over.kind}: "${text}"`, () => {
      const [entry] = buildDemoTimeline([influ({ activityEvents: [ev(over)] })]);
      expect(entry.text).toBe(text);
      expect(entry.detail).toBe(detail);
    });
  }

  it("roteiro/conteúdo citam a entrega; reenvio (versão > 1) vira 'reenviou … #02'", () => {
    const i = influ({
      entregas: [
        {
          id: "en1",
          tipo: "Reels",
          titulo: "Reels de abertura",
          quantidade: 1,
          status: "combinado",
          stage: "ROTEIRO_APROVACAO",
        },
      ],
      activityEvents: [
        ev({
          id: "a",
          kind: "roteiro_enviado",
          entregaId: "en1",
          versao: 1,
          createdAt: "2026-10-05T10:00:00Z",
          actor: { type: "equipe", name: "T", initials: "T", color: "" },
        }),
        ev({
          id: "b",
          kind: "roteiro_ajustes_solicitados",
          entregaId: "en1",
          comentario: "Trocar a música",
          createdAt: "2026-10-05T11:00:00Z",
        }),
        ev({
          id: "c",
          kind: "roteiro_enviado",
          entregaId: "en1",
          versao: 2,
          createdAt: "2026-10-05T12:00:00Z",
          actor: { type: "equipe", name: "T", initials: "T", color: "" },
        }),
        ev({
          id: "d",
          kind: "conteudo_aprovado",
          entregaId: "en1",
          createdAt: "2026-10-05T13:00:00Z",
        }),
        ev({
          id: "e",
          kind: "publicado",
          entregaId: "en1",
          createdAt: "2026-10-05T14:00:00Z",
          actor: { type: "equipe", name: "T", initials: "T", color: "" },
        }),
      ],
    });
    const texts = buildDemoTimeline([i])
      .map((x) => x.text)
      .reverse();
    expect(texts).toEqual([
      "Time enviou o roteiro de Beatriz Costa — Reels de abertura",
      "Cliente pediu ajuste no roteiro de Beatriz Costa — Reels de abertura",
      "Time reenviou o roteiro #02 de Beatriz Costa — Reels de abertura",
      "Cliente aprovou o conteúdo de Beatriz Costa — Reels de abertura",
      "Time marcou como publicado: Beatriz Costa — Reels de abertura",
    ]);
  });

  it("entrega que não existe mais: cita só o influenciador (nada quebra)", () => {
    const [e] = buildDemoTimeline([
      influ({ activityEvents: [ev({ kind: "roteiro_aprovado", entregaId: "sumiu" })] }),
    ]);
    expect(e.text).toBe("Cliente aprovou o roteiro de Beatriz Costa");
  });
});

describe("junção de fontes", () => {
  it("do mais recente ao mais antigo, com `limit`", () => {
    const i = influ({
      activityEvents: [
        ev({ id: "1", createdAt: "2026-10-05T10:00:00Z" }),
        ev({ id: "2", createdAt: "2026-10-05T12:00:00Z" }),
        ev({ id: "3", createdAt: "2026-10-05T11:00:00Z" }),
      ],
    });
    expect(buildDemoTimeline([i]).map((x) => x.id)).toEqual(["evt:2", "evt:3", "evt:1"]);
    expect(buildDemoTimeline([i], [], 2)).toHaveLength(2);
  });

  it("`activity` espelhado de um evento (mesmo instante ±5 s) NÃO duplica; texto avulso entra", () => {
    const i = influ({
      activityEvents: [ev({ id: "e1", createdAt: "2026-10-05T12:00:00.000Z" })],
      activity: [
        {
          id: "a1",
          author: "Equipe VNH",
          initials: "VN",
          color: "",
          action: "aprovou a seleção",
          createdAt: "2026-10-05T12:00:00.800Z",
        },
        {
          id: "a2",
          author: "Equipe VNH",
          initials: "VN",
          color: "",
          action: "anotou algo",
          createdAt: "2026-10-05T09:00:00.000Z",
        },
      ],
    });
    const t = buildDemoTimeline([i]);
    expect(t.map((x) => x.id)).toEqual(["evt:e1", "act:a2"]);
    expect(t[1].text).toBe("Equipe VNH anotou algo (Beatriz Costa)");
    expect(t[1].actor).toBe("equipe");
  });

  it("ciclo de vida entra como 'sistema'; 'cliente abriu o link' é do cliente", () => {
    const life: DemoEventRow[] = [
      {
        id: "l1",
        session_id: "s",
        kind: "criada",
        actor_user_id: "u",
        data: {},
        created_at: "2026-10-05T08:00:00Z",
      },
      {
        id: "l2",
        session_id: "s",
        kind: "cliente_abriu_link",
        actor_user_id: null,
        data: {},
        created_at: "2026-10-05T09:00:00Z",
      },
      {
        id: "l3",
        session_id: "s",
        kind: "acesso_revogado",
        actor_user_id: "u",
        data: {},
        created_at: "2026-10-05T10:00:00Z",
      },
    ];
    const t = buildDemoTimeline([], life);
    expect(t.map((x) => [x.text, x.actor])).toEqual([
      ["Acesso do cliente revogado", "sistema"],
      ["Cliente abriu o link", "cliente"],
      ["Demonstração criada", "sistema"],
    ]);
  });

  it("sem dados: lista vazia", () => {
    expect(buildDemoTimeline([], [])).toEqual([]);
  });
});

describe("com o cenário completo", () => {
  const entries = buildDemoTimeline(scenarioInflus(), []);

  it("traz as frases pedidas ('Cliente reprovou Beatriz Costa', ajustes, aprovações) e nada 'indefinido'", () => {
    const texts = entries.map((e) => e.text);
    expect(texts).toContain("Cliente reprovou Beatriz Costa");
    expect(texts).toContain("Cliente aprovou Camila Duarte");
    expect(texts.some((t) => t.startsWith("Cliente pediu ajuste no roteiro de Lucas Ferraz"))).toBe(
      true,
    );
    expect(
      texts.some((t) => t.startsWith("Cliente pediu ajuste no conteúdo de Camila Duarte")),
    ).toBe(true);
    for (const t of texts) expect(t).not.toMatch(/undefined|null|\[object/);
  });

  it("o motivo da reprovação aparece como detalhe e os atores são só cliente/equipe", () => {
    const rep = entries.find((e) => e.text === "Cliente reprovou Beatriz Costa")!;
    expect(rep.detail).toBe("Público incompatível");
    expect(new Set(entries.map((e) => e.actor))).toEqual(new Set(["cliente", "equipe"]));
  });

  it("ordem cronológica decrescente", () => {
    const ats = entries.map((e) => e.at);
    expect(ats).toEqual([...ats].sort().reverse());
  });
});
