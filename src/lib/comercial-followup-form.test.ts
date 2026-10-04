import { describe, expect, it } from "vitest";
import type { Lead } from "@/lib/comercial";
import {
  applyFollowUpToLead,
  buildFollowUpInput,
  defaultNextActionTime,
  hasPendingNextAction,
  initialFollowUpState,
  isFollowUpDirty,
  localDateTimeToIso,
  quickNextDates,
  suggestNextFromOutcome,
  validateFollowUp,
  type FollowUpFormState,
} from "./comercial-followup-form";

// 04/10/2026 10:28 (horário local do teste)
const NOW = new Date(2026, 9, 4, 10, 28, 0);

const ok = (over: Partial<FollowUpFormState> = {}): FollowUpFormState => ({
  ...initialFollowUpState(NOW),
  summary: "Mandei a proposta",
  nextActionDescription: "Cobrar retorno",
  nextDate: "2026-10-06",
  nextTime: "14:00",
  ...over,
});

describe("estado inicial — defaults inteligentes", () => {
  it("WhatsApp, momento da abertura e já com 'Cobrar retorno' amanhã às 09:00", () => {
    expect(initialFollowUpState(NOW)).toMatchObject({
      interactionType: "whatsapp",
      occurredDate: "2026-10-04",
      occurredTime: "10:28",
      outcome: "",
      summary: "",
      noNextAction: false,
      nextActionDescription: "Cobrar retorno",
      nextDate: "2026-10-05",
      nextTime: "09:00",
    });
  });
  it("lead com próxima ação por vir: o padrão é NÃO sobrescrevê-la", () => {
    const withPending = { nextActionAt: NOW.getTime() + 86_400_000 };
    expect(hasPendingNextAction(withPending, NOW)).toBe(true);
    expect(initialFollowUpState(NOW, withPending)).toMatchObject({
      noNextAction: true,
      nextActionDescription: "",
      nextDate: "",
    });
  });
  it("próxima ação vencida ou ausente não conta como pendente", () => {
    expect(hasPendingNextAction({ nextActionAt: NOW.getTime() - 1000 }, NOW)).toBe(false);
    expect(hasPendingNextAction({}, NOW)).toBe(false);
    expect(hasPendingNextAction(undefined, NOW)).toBe(false);
    expect(initialFollowUpState(NOW, { nextActionAt: NOW.getTime() - 1000 }).noNextAction).toBe(
      false,
    );
  });
  it("atalhos de data: hoje e amanhã", () => {
    expect(quickNextDates(NOW)).toEqual([
      { label: "Hoje", date: "2026-10-04" },
      { label: "Amanhã", date: "2026-10-05" },
    ]);
  });
});

describe("isFollowUpDirty — os padrões não contam", () => {
  it("só resumo, resultado, outro momento ou mexer na próxima ação contam", () => {
    const s = initialFollowUpState(NOW);
    expect(isFollowUpDirty(s)).toBe(false);
    expect(isFollowUpDirty({ ...s, summary: " x " })).toBe(true);
    expect(isFollowUpDirty({ ...s, outcome: "interessado" })).toBe(true);
    expect(isFollowUpDirty(s, true)).toBe(true);
  });
});

describe("suggestNextFromOutcome", () => {
  it("cada resultado sugere o passo natural; 'sem interesse' = sem próxima ação", () => {
    expect(suggestNextFromOutcome("proposta_solicitada", NOW)).toEqual({
      noNextAction: false,
      nextActionDescription: "Enviar proposta",
      nextDate: "2026-10-05",
    });
    expect(suggestNextFromOutcome("aguardando_retorno", NOW)?.nextActionDescription).toBe(
      "Cobrar retorno",
    );
    expect(suggestNextFromOutcome("nao_respondeu", NOW)?.nextActionDescription).toBe(
      "Cobrar retorno",
    );
    expect(suggestNextFromOutcome("interessado", NOW)?.nextActionDescription).toBe(
      "Agendar reunião",
    );
    expect(suggestNextFromOutcome("sem_interesse", NOW)).toEqual({
      noNextAction: true,
      nextActionDescription: "",
      nextDate: "",
    });
  });
  it("resultado sem sugestão não muda nada", () => {
    expect(suggestNextFromOutcome("respondeu", NOW)).toBeNull();
    expect(suggestNextFromOutcome("reuniao_agendada", NOW)).toBeNull();
  });
});

describe("validateFollowUp", () => {
  it("válido com resumo e os padrões", () => {
    expect(validateFollowUp(ok(), NOW)).toMatchObject({ valid: true, errors: {} });
  });
  it("resumo é obrigatório (só espaços não vale)", () => {
    expect(validateFollowUp(ok({ summary: "   " }), NOW).errors.summary).toBeTruthy();
  });
  it("contato no futuro é bloqueado (5 min de folga)", () => {
    expect(validateFollowUp(ok({ occurredDate: "2026-10-05" }), NOW).errors.occurredAt).toMatch(
      /futuro/,
    );
    expect(validateFollowUp(ok({ occurredTime: "10:33" }), NOW).errors.occurredAt).toBeUndefined();
    expect(validateFollowUp(ok({ occurredTime: "10:40" }), NOW).errors.occurredAt).toMatch(
      /futuro/,
    );
  });
  it("com próxima ação: descrição E data são obrigatórias (estado inconsistente é barrado)", () => {
    const v = validateFollowUp(ok({ nextActionDescription: "", nextDate: "" }), NOW);
    expect(v.valid).toBe(false);
    expect(v.errors.nextActionDescription).toBeTruthy();
    expect(v.errors.nextDate).toBeTruthy();
  });
  it("hora inválida da próxima ação é erro", () => {
    expect(validateFollowUp(ok({ nextTime: "25:99" }), NOW).errors.nextTime).toBeTruthy();
  });
  it("'Sem próxima ação' dispensa os campos de próxima ação", () => {
    expect(
      validateFollowUp(ok({ noNextAction: true, nextActionDescription: "", nextDate: "" }), NOW)
        .valid,
    ).toBe(true);
  });
  it("próxima ação no passado avisa, mas NÃO bloqueia", () => {
    const v = validateFollowUp(ok({ nextDate: "2026-10-04", nextTime: "09:00" }), NOW);
    expect(v.valid).toBe(true);
    expect(v.warnings.nextActionPast).toBeTruthy();
  });
});

describe("buildFollowUpInput — mesmo payload de antes", () => {
  it("o momento do contato é a data + hora exibidas (padrão: a abertura do modal)", () => {
    expect(buildFollowUpInput(ok())!.occurredAt).toBe(localDateTimeToIso("2026-10-04", "10:28"));
    expect(
      buildFollowUpInput(ok({ occurredDate: "2026-10-03", occurredTime: "16:10" }))!.occurredAt,
    ).toBe(localDateTimeToIso("2026-10-03", "16:10"));
  });
  it("com próxima ação", () => {
    const input = buildFollowUpInput(ok({ outcome: "interessado", summary: "  oi  " }))!;
    expect(input).toEqual({
      interactionType: "whatsapp",
      occurredAt: localDateTimeToIso("2026-10-04", "10:28"),
      summary: "oi",
      outcome: "interessado",
      nextActionDescription: "Cobrar retorno",
      nextActionAt: localDateTimeToIso("2026-10-06", "14:00"),
    });
  });
  it("'Sem próxima ação' não envia nenhum campo de próxima ação (nem limpa a existente)", () => {
    const input = buildFollowUpInput(ok({ noNextAction: true }))!;
    expect(input.nextActionAt).toBeUndefined();
    expect(input.nextActionDescription).toBeUndefined();
  });
  it("sem resultado → outcome ausente", () => {
    expect(buildFollowUpInput(ok())!.outcome).toBeUndefined();
  });
});

describe("defaultNextActionTime", () => {
  it("hoje → próxima hora cheia; outro dia → 09:00", () => {
    expect(defaultNextActionTime("2026-10-04", NOW)).toBe("11:00");
    expect(defaultNextActionTime("2026-10-05", NOW)).toBe("09:00");
    expect(defaultNextActionTime("2026-10-04", new Date(2026, 9, 4, 23, 40))).toBe("23:00");
  });
});

describe("applyFollowUpToLead — espelha o servidor", () => {
  const lead = {
    id: "o1",
    name: "x",
    lastContactAt: Date.parse("2026-10-03T12:00:00Z"),
    nextActionAt: Date.parse("2026-10-10T12:00:00Z"),
    nextActionDescription: "Antiga",
  } as Lead;

  it("avança o último contato e troca a próxima ação quando o follow-up traz uma", () => {
    const out = applyFollowUpToLead(lead, {
      interactionType: "ligacao",
      occurredAt: "2026-10-04T13:00:00Z",
      summary: "ok",
      nextActionDescription: "Enviar contrato",
      nextActionAt: "2026-10-06T17:00:00Z",
    });
    expect(out.lastContactAt).toBe(Date.parse("2026-10-04T13:00:00Z"));
    expect(out.nextActionAt).toBe(Date.parse("2026-10-06T17:00:00Z"));
    expect(out.nextActionDescription).toBe("Enviar contrato");
  });
  it("sem próxima ação no follow-up, a existente continua", () => {
    const out = applyFollowUpToLead(lead, {
      interactionType: "email",
      occurredAt: "2026-10-04T13:00:00Z",
      summary: "ok",
    });
    expect(out.nextActionAt).toBe(lead.nextActionAt);
    expect(out.nextActionDescription).toBe("Antiga");
  });
  it("o último contato nunca retrocede (follow-up com data antiga)", () => {
    const out = applyFollowUpToLead(lead, {
      interactionType: "email",
      occurredAt: "2026-09-01T13:00:00Z",
      summary: "ok",
    });
    expect(out.lastContactAt).toBe(lead.lastContactAt);
  });
  it("lead nunca contatado passa a ter último contato", () => {
    const out = applyFollowUpToLead(
      { ...lead, lastContactAt: undefined },
      { interactionType: "email", occurredAt: "2026-10-04T13:00:00Z", summary: "ok" },
    );
    expect(out.lastContactAt).toBe(Date.parse("2026-10-04T13:00:00Z"));
  });
});
