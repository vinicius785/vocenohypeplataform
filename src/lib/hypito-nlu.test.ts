import { describe, expect, it } from "vitest";
import { parseIntent, resolveDateRange } from "./hypito-nlu";

describe("parseIntent", () => {
  it("reconhece saudação", () => {
    expect(parseIntent("Oi Hypito").type).toBe("greeting");
  });

  it("reconhece tarefas atrasadas", () => {
    expect(parseIntent("Quais tarefas estão atrasadas?").type).toBe("overdue_tasks");
  });

  it("reconhece próxima reunião", () => {
    expect(parseIntent("Qual é minha próxima reunião?").type).toBe("next_meeting");
  });

  it("reconhece 'compromissos' como consulta de agenda/reuniões", () => {
    const intent = parseIntent("Quais são meus compromissos de hoje?");
    expect(intent).toEqual({ type: "my_meetings", range: { kind: "today" } });
  });

  it("reconhece reuniões da semana", () => {
    const intent = parseIntent("Tenho alguma reunião essa semana?");
    expect(intent).toEqual({ type: "my_meetings", range: { kind: "this_week" } });
  });

  it("reconhece aprovações pendentes", () => {
    expect(parseIntent("O que depende da minha aprovação?").type).toBe("pending_approvals");
  });

  it("reconhece resumo de projeto com o nome", () => {
    const intent = parseIntent("Resuma o projeto HypeApp.");
    expect(intent).toEqual({ type: "project_summary", query: "hypeapp" });
  });

  it("reconhece resumo de campanha com o nome", () => {
    const intent = parseIntent("Resuma a campanha Jackery.");
    expect(intent).toEqual({ type: "campaign_summary", query: "jackery" });
  });

  it("reconhece pergunta sobre tarefas de outra pessoa", () => {
    const intent = parseIntent("O que o Lucas precisa entregar esta semana?");
    expect(intent).toEqual({ type: "person_tasks", personQuery: "Lucas" });
  });

  it("reconhece tarefas vencendo esta semana", () => {
    expect(parseIntent("Quais tarefas vencem esta semana?")).toEqual({
      type: "upcoming_tasks",
      days: 7,
    });
  });

  it("reconhece criação de tarefa", () => {
    expect(
      parseIntent("Hypito, crie uma tarefa para Toni cobrar as métricas amanhã às 10h").type,
    ).toBe("create_task");
  });

  it("reconhece criação de lembrete a partir de 'me lembre'", () => {
    expect(parseIntent("Me lembre de revisar a proposta amanhã às 14h").type).toBe(
      "create_reminder",
    );
  });

  it("reconhece criação de lembrete a partir de 'me avise'", () => {
    expect(parseIntent("Me avise sexta às 16h para cobrar as métricas").type).toBe(
      "create_reminder",
    );
  });

  it("texto sem padrão reconhecido vira 'unknown', nunca um erro", () => {
    const intent = parseIntent("blablabla xpto 12345");
    expect(intent.type).toBe("unknown");
  });

  it("texto vazio vira 'unknown'", () => {
    expect(parseIntent("").type).toBe("unknown");
    expect(parseIntent("   ").type).toBe("unknown");
  });
});

describe("resolveDateRange", () => {
  const now = new Date("2026-09-11T15:00:00.000Z"); // sexta, meio da tarde BRT

  it("'none' não filtra por data (retorna null)", () => {
    expect(resolveDateRange({ kind: "none" }, now)).toBeNull();
  });

  it("'today' é um intervalo de 24h a partir da meia-noite local", () => {
    const range = resolveDateRange({ kind: "today" }, now)!;
    expect(range.end.getTime() - range.start.getTime()).toBe(86_400_000);
  });

  it("'tomorrow' começa um dia depois de 'today'", () => {
    const today = resolveDateRange({ kind: "today" }, now)!;
    const tomorrow = resolveDateRange({ kind: "tomorrow" }, now)!;
    expect(tomorrow.start.getTime() - today.start.getTime()).toBe(86_400_000);
  });

  it("'this_week' começa na segunda-feira da semana", () => {
    const range = resolveDateRange({ kind: "this_week" }, now)!;
    // 2026-09-07 é segunda-feira.
    expect(range.start.toISOString().slice(0, 10)).toBe("2026-09-07");
  });
});
