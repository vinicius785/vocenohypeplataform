/**
 * Testes das regras críticas de `src/lib/roadmap-engine.ts` — sem
 * framework de testes novo, só `node:test`/`node:assert` (ver decisão
 * registrada no plano da refatoração do Roadmap: repo não tem
 * vitest/jest, e o pedido original pede pra não introduzir bibliotecas
 * sem necessidade).
 *
 * Roda com: bun run scripts/test-roadmap-engine.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  faseProgresso,
  faseTaskCounts,
  faseStatusEfetivo,
  faseResponsaveis,
  tarefasSemFase,
  faseAtual,
  type ProjetoFase,
} from "../src/lib/roadmap-engine";
import { todayIsoInBrasilia } from "../src/lib/timezone";
import type { Task } from "../src/components/tasks/TaskBoard";

function fase(overrides: Partial<ProjetoFase> = {}): ProjetoFase {
  return {
    id: "fase-1",
    nome: "Fase 1",
    dataInicio: "2026-01-01",
    dataFim: "2026-12-31",
    status: "em_andamento",
    cor: "bg-sky-500 text-white",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    title: "Tarefa",
    status: "Aberto",
    priority: "Normal",
    ...overrides,
  } as Task;
}

test("faseProgresso: fase sem tarefas retorna null (nunca 0%)", () => {
  const f = fase();
  assert.equal(faseProgresso(f, []), null);
});

test("faseProgresso: fase 100% concluída", () => {
  const f = fase();
  const tasks = [
    task({ roadmapPhaseId: f.id, status: "Concluído" }),
    task({ roadmapPhaseId: f.id, status: "Concluído" }),
  ];
  assert.equal(faseProgresso(f, tasks), 100);
});

test("faseProgresso: progresso parcial arredondado", () => {
  const f = fase();
  const tasks = [
    task({ roadmapPhaseId: f.id, status: "Concluído" }),
    task({ roadmapPhaseId: f.id, status: "Aberto" }),
    task({ roadmapPhaseId: f.id, status: "Aberto" }),
  ];
  assert.equal(faseProgresso(f, tasks), 33);
});

test("faseTaskCounts: separa concluídas/em andamento/atrasadas, ignora Arquivado", () => {
  const f = fase();
  const today = todayIsoInBrasilia();
  const ontem = "2020-01-01";
  const tasks = [
    task({ roadmapPhaseId: f.id, status: "Concluído" }),
    task({ roadmapPhaseId: f.id, status: "Aberto", dueDate: ontem }),
    task({ roadmapPhaseId: f.id, status: "Aberto" }),
    task({ roadmapPhaseId: f.id, status: "Arquivado" }),
    task({ roadmapPhaseId: "outra-fase", status: "Aberto" }),
  ];
  const counts = faseTaskCounts(f, tasks);
  assert.equal(counts.total, 4); // Arquivado + outra fase não contam no total desta fase
  assert.equal(counts.concluidas, 1);
  assert.equal(counts.atrasadas, 1);
  assert.equal(counts.emAndamento, 1);
  void today;
});

test("faseStatusEfetivo: atrasada quando prazo vencido e há pendências", () => {
  const f = fase({ dataFim: "2020-01-01", status: "em_andamento" });
  const tasks = [task({ roadmapPhaseId: f.id, status: "Aberto" })];
  assert.equal(faseStatusEfetivo(f, tasks), "atrasada");
});

test("faseStatusEfetivo: nunca rebaixa uma fase manualmente concluída", () => {
  const f = fase({ dataFim: "2020-01-01", status: "concluida" });
  const tasks = [task({ roadmapPhaseId: f.id, status: "Aberto" })];
  assert.equal(faseStatusEfetivo(f, tasks), "concluida");
});

test("faseStatusEfetivo: em_risco quando faltam poucos dias e progresso baixo", () => {
  const emTresDias = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const f = fase({ dataFim: emTresDias, status: "em_andamento" });
  const tasks = [
    task({ roadmapPhaseId: f.id, status: "Concluído" }),
    task({ roadmapPhaseId: f.id, status: "Aberto" }),
    task({ roadmapPhaseId: f.id, status: "Aberto" }),
  ];
  assert.equal(faseStatusEfetivo(f, tasks), "em_risco");
});

test("faseStatusEfetivo: fase sem tarefa nunca fica atrasada automaticamente", () => {
  const f = fase({ dataFim: "2020-01-01", status: "em_andamento" });
  assert.equal(faseStatusEfetivo(f, []), "em_andamento");
});

test("faseResponsaveis: crédito integral por responsável, sem duplicar nomes (multi-assignee)", () => {
  const f = fase();
  const tasks = [
    task({ roadmapPhaseId: f.id, assignees: ["Ana", "Beto"] }),
    task({ roadmapPhaseId: f.id, assignee: "Ana" }),
  ];
  const responsaveis = faseResponsaveis(f, tasks);
  assert.deepEqual([...responsaveis].sort(), ["Ana", "Beto"]);
});

test("tarefasSemFase: inclui tarefas sem fase e tarefas apontando pra fase excluída", () => {
  const fases = [fase({ id: "fase-viva" })];
  const tasks = [
    task({ roadmapPhaseId: undefined }),
    task({ roadmapPhaseId: "fase-viva" }),
    task({ roadmapPhaseId: "fase-excluida" }),
  ];
  const semFase = tarefasSemFase(tasks, fases);
  assert.equal(semFase.length, 2);
  assert.ok(semFase.every((t) => t.roadmapPhaseId !== "fase-viva"));
});

test("faseAtual: primeira fase (por sortOrder) ainda não concluída", () => {
  const fases = [
    fase({ id: "f1", sortOrder: 0, status: "concluida" }),
    fase({ id: "f2", sortOrder: 1, status: "em_andamento" }),
    fase({ id: "f3", sortOrder: 2, status: "nao_iniciada" }),
  ];
  const atual = faseAtual(fases, []);
  assert.equal(atual?.id, "f2");
});

test("faseAtual: null quando todas as fases estão concluídas", () => {
  const fases = [fase({ id: "f1", status: "concluida" })];
  assert.equal(faseAtual(fases, []), null);
});
