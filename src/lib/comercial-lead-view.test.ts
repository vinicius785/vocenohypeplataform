import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead, LeadHistoryEntry } from "@/lib/comercial";
import type { CommercialInteractionRow } from "@/lib/commercial-interactions.functions";

// O módulo real é um arquivo de server function (TanStack + Supabase); aqui só
// interessam os rótulos.
vi.mock("@/lib/commercial-interactions.functions", () => ({
  INTERACTION_TYPE_LABEL: {
    whatsapp: "WhatsApp",
    ligacao: "Ligação",
    email: "E-mail",
    reuniao: "Reunião",
    outro: "Outro",
  },
  INTERACTION_OUTCOME_LABEL: { sem_resposta: "Sem resposta", positivo: "Positivo" },
}));

const {
  buildCommercialTimeline,
  formatTimelineWhen,
  historyEventKind,
  nextActionDisplay,
  propostaMargem,
} = await import("./comercial-lead-view");

const interaction = (over: Partial<CommercialInteractionRow> = {}): CommercialInteractionRow => ({
  id: "f1",
  opportunity_id: "o1",
  created_by: "u1",
  created_by_name: "Ana",
  interaction_type: "whatsapp",
  occurred_at: "2026-10-03T15:00:00Z",
  summary: "Mandei a proposta",
  outcome: null,
  next_action_description: null,
  next_action_at: null,
  created_at: "2026-10-03T15:00:00Z",
  updated_at: "2026-10-03T15:00:00Z",
  ...over,
});

const entry = (over: Partial<LeadHistoryEntry> = {}): LeadHistoryEntry => ({
  id: "h1",
  type: "stage",
  text: "Etapa: Lead recebido → Contato feito",
  createdAt: Date.parse("2026-10-02T12:00:00Z"),
  kind: "stage_change",
  ...over,
});

describe("buildCommercialTimeline", () => {
  it("une follow-ups e eventos do funil, do mais recente para o mais antigo", () => {
    const items = buildCommercialTimeline({
      interactions: [interaction()],
      history: [
        entry(),
        entry({
          id: "h2",
          kind: "proposal",
          text: "Proposta criada",
          createdAt: Date.parse("2026-10-04T09:00:00Z"),
        }),
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["h:h2", "i:f1", "h:h1"]);
    expect(items[1]).toMatchObject({
      source: "interaction",
      kind: "whatsapp",
      title: "WhatsApp",
      author: "Ana",
      text: "Mandei a proposta",
    });
    expect(items[0]).toMatchObject({ source: "event", kind: "proposal", title: "Proposta" });
  });

  it("traz resultado e próxima ação do follow-up", () => {
    const [item] = buildCommercialTimeline({
      interactions: [
        interaction({
          outcome: "positivo" as never,
          next_action_description: "Enviar contrato",
          next_action_at: "2026-10-06T13:00:00Z",
        }),
      ],
      history: [],
    });
    expect(item.outcome).toBe("Positivo");
    expect(item.nextAction).toEqual({
      description: "Enviar contrato",
      at: Date.parse("2026-10-06T13:00:00Z"),
    });
  });

  it("entradas antigas sem `kind` entram pelo `type`; edição técnica fica de fora", () => {
    const items = buildCommercialTimeline({
      interactions: [],
      history: [
        entry({ id: "old-stage", kind: undefined, type: "stage" }),
        entry({ id: "old-created", kind: undefined, type: "created", text: "Lead criado" }),
        entry({ id: "old-edit", kind: undefined, type: "edit", text: "Nome alterado" }),
      ],
    });
    expect(items.map((i) => i.kind).sort()).toEqual(["created", "stage_change"]);
    expect(historyEventKind(entry({ kind: undefined, type: "edit" }))).toBeNull();
  });

  it("ignora data inválida de follow-up e não quebra sem histórico", () => {
    expect(
      buildCommercialTimeline({
        interactions: [interaction({ occurred_at: "não é data" })],
        history: undefined,
      }),
    ).toEqual([]);
  });

  it("empate de instante mantém follow-ups antes dos eventos", () => {
    const at = "2026-10-03T15:00:00Z";
    const items = buildCommercialTimeline({
      interactions: [interaction({ occurred_at: at })],
      history: [entry({ createdAt: Date.parse(at) })],
    });
    expect(items.map((i) => i.source)).toEqual(["interaction", "event"]);
  });
});

describe("formatTimelineWhen (horário de Brasília)", () => {
  // 04/10/2026 15:00 em Brasília (UTC-3)
  const now = new Date("2026-10-04T18:00:00Z");
  it("hoje, ontem e data curta", () => {
    expect(formatTimelineWhen(Date.parse("2026-10-04T17:30:00Z"), now)).toBe("Hoje · 14:30");
    expect(formatTimelineWhen(Date.parse("2026-10-03T12:10:00Z"), now)).toBe("Ontem · 09:10");
    expect(formatTimelineWhen(Date.parse("2026-09-28T12:00:00Z"), now)).toBe("28/09/26 · 09:00");
  });
  it("usa o dia de Brasília, não o de UTC (02:00Z ainda é o dia anterior aqui)", () => {
    expect(formatTimelineWhen(Date.parse("2026-10-04T02:00:00Z"), now)).toBe("Ontem · 23:00");
  });
});

describe("nextActionDisplay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0)); // 04/10/2026 12:00 local
  });
  afterEach(() => vi.useRealTimers());

  const lead = (over: Partial<Lead>) => ({ id: "o1", name: "x", ...over }) as Lead;

  it("sem próxima ação → null", () => {
    expect(nextActionDisplay(lead({}))).toBeNull();
  });
  it("vencida, hoje, amanhã e data futura", () => {
    expect(
      nextActionDisplay(
        lead({
          nextActionAt: new Date(2026, 9, 2, 9, 0).getTime(),
          nextActionDescription: "Ligar",
        }),
      ),
    ).toEqual({ tone: "red", text: "Vencida há 3d · Ligar" });
    expect(
      nextActionDisplay(lead({ nextActionAt: new Date(2026, 9, 4, 15, 30).getTime() })),
    ).toEqual({
      tone: "amber",
      text: "Hoje às 15:30",
    });
    expect(
      nextActionDisplay(lead({ nextActionAt: new Date(2026, 9, 5, 10, 0).getTime() })),
    ).toEqual({
      tone: "neutral",
      text: "Amanhã",
    });
    expect(
      nextActionDisplay(lead({ nextActionAt: new Date(2026, 9, 9, 10, 0).getTime() })),
    ).toEqual({
      tone: "neutral",
      text: "09/10",
    });
  });
});

describe("propostaMargem", () => {
  it("margem em R$ e % do preço final", () => {
    expect(propostaMargem({ precoFinal: 10000, custoTotal: 6000 })).toEqual({
      reais: 4000,
      pct: 0.4,
    });
  });
  it("preço zero não divide por zero", () => {
    expect(propostaMargem({ precoFinal: 0, custoTotal: 0 })).toEqual({ reais: 0, pct: null });
  });
});
