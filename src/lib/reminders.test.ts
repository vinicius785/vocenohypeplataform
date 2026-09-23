import { describe, expect, it } from "vitest";
import {
  reminderBucket,
  sortReminders,
  pendingReminders,
  groupReminders,
  type Reminder,
} from "./reminders";
import { todayIsoInBrasilia } from "./timezone";

const DAY = 24 * 60 * 60 * 1000;

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    title: "Lembrete",
    priority: "normal",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("reminderBucket", () => {
  it("sem dueAt é sem_data", () => {
    expect(reminderBucket(reminder({}))).toBe("sem_data");
  });

  it("data de ontem é atrasado", () => {
    const ontem = new Date(Date.now() - DAY).toISOString();
    expect(reminderBucket(reminder({ dueAt: ontem }))).toBe("atrasado");
  });

  it("data de hoje é hoje", () => {
    const hoje = new Date().toISOString();
    expect(reminderBucket(reminder({ dueAt: hoje }))).toBe("hoje");
  });

  it("data futura é proximo", () => {
    const futuro = new Date(Date.now() + 3 * DAY).toISOString();
    expect(reminderBucket(reminder({ dueAt: futuro }))).toBe("proximo");
  });
});

describe("sortReminders — vencidos, depois hoje, depois próximos, depois sem data", () => {
  it("ordena pelos 4 buckets nessa ordem", () => {
    const semData = reminder({ id: "sem-data" });
    const proximo = reminder({
      id: "proximo",
      dueAt: new Date(Date.now() + 3 * DAY).toISOString(),
    });
    const hoje = reminder({ id: "hoje", dueAt: new Date().toISOString() });
    const atrasado = reminder({
      id: "atrasado",
      dueAt: new Date(Date.now() - 2 * DAY).toISOString(),
    });
    const sorted = sortReminders([semData, proximo, hoje, atrasado]);
    expect(sorted.map((r) => r.id)).toEqual(["atrasado", "hoje", "proximo", "sem-data"]);
  });

  it("dentro do mesmo bucket, ordena pela data mais próxima primeiro", () => {
    const maisLonge = reminder({
      id: "longe",
      dueAt: new Date(Date.now() + 10 * DAY).toISOString(),
    });
    const maisPerto = reminder({
      id: "perto",
      dueAt: new Date(Date.now() + 1 * DAY).toISOString(),
    });
    const sorted = sortReminders([maisLonge, maisPerto]);
    expect(sorted.map((r) => r.id)).toEqual(["perto", "longe"]);
  });
});

describe("pendingReminders", () => {
  it("exclui concluídos", () => {
    const pendente = reminder({ id: "pendente" });
    const concluido = reminder({ id: "concluido", completedAt: new Date().toISOString() });
    const result = pendingReminders([pendente, concluido]);
    expect(result.map((r) => r.id)).toEqual(["pendente"]);
  });
});

describe("groupReminders — visão completa", () => {
  it("separa em 5 grupos corretamente, sem duplicar item entre grupos", () => {
    const atrasado = reminder({ id: "a", dueAt: new Date(Date.now() - DAY).toISOString() });
    const hoje = reminder({ id: "h", dueAt: new Date().toISOString() });
    const proximo = reminder({ id: "p", dueAt: new Date(Date.now() + 2 * DAY).toISOString() });
    const semData = reminder({ id: "s" });
    const concluido = reminder({
      id: "c",
      dueAt: new Date(Date.now() - DAY).toISOString(),
      completedAt: new Date().toISOString(),
    });
    const groups = groupReminders([atrasado, hoje, proximo, semData, concluido]);
    expect(groups.atrasados.map((r) => r.id)).toEqual(["a"]);
    expect(groups.hoje.map((r) => r.id)).toEqual(["h"]);
    expect(groups.proximos.map((r) => r.id)).toEqual(["p"]);
    expect(groups.semData.map((r) => r.id)).toEqual(["s"]);
    expect(groups.concluidos.map((r) => r.id)).toEqual(["c"]);
  });

  it("um lembrete concluído nunca aparece em atrasado/hoje/próximo mesmo com dueAt vencido", () => {
    const concluidoAtrasado = reminder({
      dueAt: new Date(Date.now() - 5 * DAY).toISOString(),
      completedAt: new Date().toISOString(),
    });
    const groups = groupReminders([concluidoAtrasado]);
    expect(groups.atrasados).toHaveLength(0);
    expect(groups.concluidos).toHaveLength(1);
  });
});

describe("todayIsoInBrasilia sanity (usado por reminderBucket)", () => {
  it("retorna uma data no formato YYYY-MM-DD", () => {
    expect(todayIsoInBrasilia()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
