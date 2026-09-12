import { describe, expect, it } from "vitest";
import {
  extractAssigneeName,
  extractDateTime,
  extractedDateTimeToUtcMs,
  extractPriority,
  extractScopeName,
  extractTitle,
} from "./hypito-extract";

describe("extractDateTime", () => {
  const now = new Date("2026-09-11T15:00:00.000Z"); // sexta, 12h BRT

  it("'amanhã às 10h' resolve pro dia seguinte, 10:00", () => {
    const dt = extractDateTime("cobrar as métricas amanhã às 10h", now)!;
    expect(dt.dateIso).toBe("2026-09-12");
    expect(dt.hour).toBe(10);
    expect(dt.minute).toBe(0);
  });

  it("'hoje às 14:30' resolve pro mesmo dia", () => {
    const dt = extractDateTime("revisar a proposta hoje às 14:30", now)!;
    expect(dt.dateIso).toBe("2026-09-11");
    expect(dt.hour).toBe(14);
    expect(dt.minute).toBe(30);
  });

  it("nome de dia da semana resolve pra próxima ocorrência futura", () => {
    // now é sexta (2026-09-11); "sexta às 16h" deve ir pra semana seguinte,
    // nunca "hoje mesmo" fora de contexto nem pro passado.
    const dt = extractDateTime("me avise sexta às 16h", now)!;
    expect(dt.dateIso).toBe("2026-09-18");
  });

  it("sem nenhuma referência temporal reconhecível, devolve null (nunca inventa)", () => {
    expect(extractDateTime("cobrar as métricas da campanha", now)).toBeNull();
  });

  it("hora fora do intervalo válido (25h) devolve null, nunca aceita silenciosamente", () => {
    expect(extractDateTime("hoje às 25h", now)).toBeNull();
  });
});

describe("extractedDateTimeToUtcMs", () => {
  it("converte corretamente pro fuso America/Sao_Paulo (sem UTC fixo manual)", () => {
    const ms = extractedDateTimeToUtcMs({ dateIso: "2026-09-12", hour: 10, minute: 0 });
    expect(new Date(ms).toISOString()).toBe("2026-09-12T13:00:00.000Z");
  });
});

describe("extractAssigneeName", () => {
  it("extrai nome depois de 'para'", () => {
    expect(extractAssigneeName("crie uma tarefa para Toni cobrar as métricas")).toBe("Toni");
  });

  it("extrai nome composto (duas palavras)", () => {
    expect(extractAssigneeName("crie uma tarefa para Lucas Ragnoni revisar o brief")).toBe(
      "Lucas Ragnoni",
    );
  });

  it("não confunde 'para a campanha X' com nome de pessoa", () => {
    expect(extractAssigneeName("crie uma tarefa para a campanha Jackery")).toBeNull();
  });

  it("sem 'para', devolve null", () => {
    expect(extractAssigneeName("revisar a proposta amanhã")).toBeNull();
  });
});

describe("extractScopeName", () => {
  it("reconhece campanha", () => {
    expect(extractScopeName("cobrar métricas da campanha Jackery amanhã")).toEqual({
      scope: "campanha",
      name: "Jackery amanhã".split(" ")[0] === "Jackery" ? "Jackery" : "Jackery",
    });
  });

  it("reconhece projeto", () => {
    const result = extractScopeName("revisar o roadmap do projeto HypeApp");
    expect(result?.scope).toBe("projeto");
    expect(result?.name).toBe("HypeApp");
  });

  it("sem menção a projeto/campanha, devolve null", () => {
    expect(extractScopeName("revisar a proposta amanhã")).toBeNull();
  });
});

describe("extractPriority", () => {
  it("reconhece urgente", () => {
    expect(extractPriority("isso é urgente")).toBe("Urgente");
  });

  it("reconhece alta prioridade", () => {
    expect(extractPriority("marcar como alta prioridade")).toBe("Alta");
  });

  it("sem prioridade mencionada, devolve null (nunca inventa uma)", () => {
    expect(extractPriority("cobrar as métricas")).toBeNull();
  });
});

describe("extractTitle", () => {
  it("remove o prefixo de comando e o nome do responsável", () => {
    const title = extractTitle(
      "Hypito, crie uma tarefa para Toni cobrar as métricas da campanha Jackery amanhã às 10h",
    );
    expect(title).not.toBeNull();
    expect(title!.toLowerCase()).toContain("cobrar as métricas");
    expect(title).not.toMatch(/toni/i);
    expect(title).not.toMatch(/jackery/i);
    expect(title).not.toMatch(/amanh[ãa]/i);
  });

  it("comando puro (sem conteúdo) devolve null — nunca vira título sozinho", () => {
    expect(extractTitle("Criar uma tarefa")).toBeNull();
    expect(extractTitle("criar tarefa")).toBeNull();
    expect(extractTitle("crie uma tarefa para")).toBeNull();
  });

  it("comando puro com erro de digitação também devolve null (mesma tolerância do reconhecimento de intenção)", () => {
    expect(extractTitle("Criar tarefs")).toBeNull();
    expect(extractTitle("cria uma tarefaa")).toBeNull();
  });

  it("remove 'amanhã'/'às Hh' mesmo com acento (evita bug de \\b do JS com letra acentuada)", () => {
    const title = extractTitle("Falar com o cliente da Jackery amanhã às 15h");
    expect(title).not.toBeNull();
    expect(title).not.toMatch(/amanh[ãa]/i);
    expect(title).not.toMatch(/\bàs\b/i);
    expect(title).not.toMatch(/15h/);
  });

  it("primeira letra maiúscula", () => {
    const title = extractTitle("me lembre de revisar a proposta amanhã às 14h")!;
    expect(title[0]).toBe(title[0].toUpperCase());
  });
});
