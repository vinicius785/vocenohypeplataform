import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_INSIGHT_PATTERNS,
  generateInsightText,
  renderWeeklyReportMessage,
  type PersonEvidence,
  type WeeklyReportData,
} from "./hypito-insights";

function person(overrides: Partial<PersonEvidence> = {}): PersonEvidence {
  return {
    userId: overrides.userId ?? "user-1",
    name: overrides.name ?? "Pessoa Exemplo",
    completedThisWeek: overrides.completedThisWeek ?? [],
    overdueOpen: overrides.overdueOpen ?? [],
    dueNext7Days: overrides.dueNext7Days ?? [],
    awaitingApproval: overrides.awaitingApproval ?? [],
  };
}

function baseData(overrides: Partial<WeeklyReportData> = {}): WeeklyReportData {
  return {
    weekStartIso: "2026-09-07",
    weekLabelPt: "semana de 07 de setembro",
    generatedAtIso: "2026-09-11T20:00:00.000Z",
    metrics: {
      tasksCompleted: 0,
      tasksCreated: 0,
      tasksOpen: 0,
      tasksOverdue: 0,
      meetingsHeld: 0,
    },
    highlights: [],
    risks: [],
    nextWeek: [],
    people: [],
    unavailableSources: [],
    ...overrides,
  };
}

function scanForbidden(text: string): RegExp[] {
  return FORBIDDEN_INSIGHT_PATTERNS.filter((re) => re.test(text));
}

describe("generateInsightText — prioridade de evidência", () => {
  it("ausência total de evidência gera exatamente a mensagem neutra pedida", () => {
    expect(generateInsightText(person())).toBe(
      "Sem pendências críticas identificadas para a próxima semana.",
    );
  });

  it("tarefa em atraso tem prioridade sobre qualquer outra evidência", () => {
    const p = person({
      overdueOpen: [{ title: "Tarefa vencida" }],
      completedThisWeek: [{ title: "Tarefa concluída" }],
      dueNext7Days: [{ title: "Tarefa futura" }],
    });
    const text = generateInsightText(p);
    expect(text).toContain("Atenção ao prazo");
    expect(text).toContain("Tarefa vencida");
  });

  it("aprovação pendente vem antes de próxima ação/reconhecimento", () => {
    const p = person({
      awaitingApproval: [{ title: "Aguardando aprovação" }],
      dueNext7Days: [{ title: "Tarefa futura" }],
    });
    expect(generateInsightText(p)).toContain("aguardando aprovação");
  });

  it("reconhece avanço quando há conclusão E próxima ação", () => {
    const p = person({
      completedThisWeek: [{ title: "A" }, { title: "B" }],
      dueNext7Days: [{ title: "Próxima tarefa", dueDateIso: "2026-09-15" }],
    });
    const text = generateInsightText(p);
    expect(text).toContain("Bom avanço");
    expect(text).toContain("próxima ação sugerida");
  });

  it("só conclusão (sem próximos prazos) reconhece o avanço sem inventar risco", () => {
    const p = person({ completedThisWeek: [{ title: "A" }] });
    const text = generateInsightText(p);
    expect(text).toContain("Bom avanço");
    expect(text).toContain("Sem pendências críticas");
  });

  it("nunca usa números que não existem na evidência de entrada", () => {
    const p = person({ overdueOpen: [{ title: "X" }, { title: "Y" }, { title: "Z" }] });
    expect(generateInsightText(p)).toContain("3 tarefas em atraso");
  });
});

describe("proibição de linguagem de ranking/comparação/julgamento", () => {
  it("nenhum padrão proibido aparece em nenhum cenário de insight gerado", () => {
    const scenarios: PersonEvidence[] = [
      person(),
      person({ overdueOpen: [{ title: "T" }] }),
      person({ awaitingApproval: [{ title: "T" }] }),
      person({ dueNext7Days: [{ title: "T", dueDateIso: "2026-09-15" }] }),
      person({ completedThisWeek: [{ title: "T" }] }),
      person({ completedThisWeek: Array.from({ length: 20 }, (_, i) => ({ title: `T${i}` })) }),
    ];
    for (const scenario of scenarios) {
      const text = generateInsightText(scenario);
      expect(scanForbidden(text)).toEqual([]);
    }
  });

  it("nunca compara duas pessoas entre si — cada insight só referencia a própria pessoa", () => {
    const a = generateInsightText(person({ name: "Ana", completedThisWeek: [{ title: "T" }] }));
    const b = generateInsightText(person({ name: "Beto", overdueOpen: [{ title: "T" }] }));
    expect(a).not.toContain("Beto");
    expect(b).not.toContain("Ana");
  });
});

describe("renderWeeklyReportMessage", () => {
  it("estrutura básica sempre presente: abertura, resumo e encerramento", () => {
    const { text } = renderWeeklyReportMessage(baseData());
    expect(text).toContain("Aqui é o Hypito");
    expect(text).toContain("Resumo da semana");
    expect(text.length).toBeGreaterThan(0);
  });

  it("semana sem atividade nenhuma não inventa frase genérica — usa o texto de ausência", () => {
    const { text } = renderWeeklyReportMessage(baseData());
    expect(text).toContain("Nenhuma movimentação importante foi identificada nesta semana.");
  });

  it("destaques e riscos nunca passam de 3 itens", () => {
    const data = baseData({
      highlights: ["1", "2", "3", "4", "5"],
      risks: [{ title: "r1" }, { title: "r2" }, { title: "r3" }, { title: "r4" }],
    });
    const { text } = renderWeeklyReportMessage(data);
    const destaquesBlock = text.split("✅ Destaques")[1]?.split("⚠️")[0] ?? "";
    const riscosBlock = text.split("⚠️ Pontos de atenção")[1]?.split("📅")[0] ?? "";
    expect((destaquesBlock.match(/•/g) ?? []).length).toBe(3);
    expect((riscosBlock.match(/•/g) ?? []).length).toBe(3);
  });

  it("gera no máximo uma menção real por pessoa (mesmo se aparecer 2x na lista)", () => {
    const alice = person({ userId: "u1", name: "Alice" });
    const data = baseData({ people: [alice, alice] });
    const { mentions } = renderWeeklyReportMessage(data, { mentionUsers: true });
    expect(mentions.filter((m) => m.id === "u1")).toHaveLength(1);
  });

  it("cada menção usa o id real da pessoa e o kind 'user'", () => {
    const alice = person({ userId: "user-abc-123", name: "Alice Souza" });
    const data = baseData({ people: [alice] });
    const { mentions } = renderWeeklyReportMessage(data, { mentionUsers: true });
    expect(mentions).toEqual([{ kind: "user", id: "user-abc-123", label: "Alice Souza" }]);
  });

  it("nunca usa @Todos/menção coletiva — só menções individuais", () => {
    const data = baseData({ people: [person({ name: "Alice" }), person({ name: "Beto" })] });
    const { text, mentions } = renderWeeklyReportMessage(data, { mentionUsers: true });
    expect(text).not.toContain("@Todos");
    expect(text).not.toContain("__everyone__");
    expect(mentions.every((m) => m.kind === "user")).toBe(true);
  });

  it("quando mentionUsers=false, não gera nenhuma ChatMention (sem notificação)", () => {
    const data = baseData({ people: [person({ name: "Alice" })] });
    const { mentions, text } = renderWeeklyReportMessage(data, { mentionUsers: false });
    expect(mentions).toEqual([]);
    expect(text).toContain("Alice");
    expect(text).not.toContain("@Alice");
  });

  it("marca fontes indisponíveis discretamente, sem fingir que o dado existe", () => {
    const data = baseData({ unavailableSources: ["projetos (avanço de fase)"] });
    const { text } = renderWeeklyReportMessage(data);
    expect(text).toContain("projetos (avanço de fase)");
  });

  it("é determinístico: mesma entrada produz sempre o mesmo texto (retry seguro)", () => {
    const data = baseData({ people: [person({ name: "Alice" })] });
    const first = renderWeeklyReportMessage(data);
    const second = renderWeeklyReportMessage(data);
    expect(first.text).toBe(second.text);
  });

  it("nenhum padrão proibido aparece no texto final completo", () => {
    const data = baseData({
      highlights: ["3 tarefas concluídas"],
      risks: [{ title: "1 tarefa em atraso", responsibleName: "Alice" }],
      people: [
        person({ name: "Alice", overdueOpen: [{ title: "T" }] }),
        person({ name: "Beto", completedThisWeek: [{ title: "T" }] }),
      ],
    });
    const { text } = renderWeeklyReportMessage(data);
    expect(scanForbidden(text)).toEqual([]);
  });
});
