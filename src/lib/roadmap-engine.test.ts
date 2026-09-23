import { describe, expect, it } from "vitest";
import type { Task } from "@/components/tasks/TaskBoard";
import {
  faseAtual,
  faseConcluidaComPendencias,
  faseProgresso,
  faseStatusEfetivo,
  faseTaskCounts,
  roadmapProgressoGeral,
  tarefasSemFase,
  type ProjetoFase,
} from "./roadmap-engine";

function fase(overrides: Partial<ProjetoFase> = {}): ProjetoFase {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    nome: "Fase",
    dataInicio: "2026-01-01",
    dataFim: "2026-12-31",
    status: "nao_iniciada",
    cor: "chart-1",
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    title: "Tarefa",
    status: "Aberto",
    ...overrides,
  } as Task;
}

function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("faseTaskCounts / faseProgresso", () => {
  it("fase sem tarefas: progresso null, nunca 0%", () => {
    const f = fase();
    expect(faseProgresso(f, [])).toBeNull();
  });

  it("não conta tarefas de outra fase nem tarefas sem fase", () => {
    const f = fase({ id: "f1" });
    const tasks = [
      task({ roadmapPhaseId: "f1", status: "Concluído" }),
      task({ roadmapPhaseId: "f2", status: "Concluído" }),
      task({ status: "Concluído" }), // sem fase
    ];
    expect(faseTaskCounts(f, tasks).total).toBe(1);
  });

  it("tarefa arquivada não conta em nenhum balde", () => {
    const f = fase({ id: "f1" });
    const tasks = [task({ roadmapPhaseId: "f1", status: "Arquivado" })];
    const counts = faseTaskCounts(f, tasks);
    expect(counts.total).toBe(0);
    expect(counts.concluidas).toBe(0);
  });

  it("progresso arredondado corretamente", () => {
    const f = fase({ id: "f1" });
    const tasks = [
      task({ roadmapPhaseId: "f1", status: "Concluído" }),
      task({ roadmapPhaseId: "f1", status: "Concluído" }),
      task({ roadmapPhaseId: "f1", status: "Aberto" }),
    ];
    expect(faseProgresso(f, tasks)).toBe(67);
  });
});

describe("tarefasSemFase", () => {
  it("inclui tarefas sem roadmapPhaseId e as de fases excluídas", () => {
    const fases = [fase({ id: "f1" })];
    const tasks = [
      task({ id: "a" }),
      task({ id: "b", roadmapPhaseId: "f1" }),
      task({ id: "c", roadmapPhaseId: "fase-excluida" }),
    ];
    const semFase = tarefasSemFase(tasks, fases);
    expect(semFase.map((t) => t.id).sort()).toEqual(["a", "c"]);
  });
});

describe("faseStatusEfetivo", () => {
  it("concluída manualmente nunca é rebaixada", () => {
    const f = fase({ status: "concluida", dataFim: daysFromToday(-10) });
    const tasks = [task({ roadmapPhaseId: f.id, status: "Aberto", dueDate: daysFromToday(-5) })];
    expect(faseStatusEfetivo(f, tasks)).toBe("concluida");
  });

  it("pausada manualmente é sticky, igual concluída", () => {
    const f = fase({ status: "pausada", dataFim: daysFromToday(-10) });
    const tasks = [task({ roadmapPhaseId: f.id, status: "Aberto", dueDate: daysFromToday(-5) })];
    expect(faseStatusEfetivo(f, tasks)).toBe("pausada");
  });

  it("prazo vencido com pendência vira atrasada", () => {
    const f = fase({ id: "f1", status: "em_andamento", dataFim: daysFromToday(-1) });
    const tasks = [task({ roadmapPhaseId: "f1", status: "Aberto" })];
    expect(faseStatusEfetivo(f, tasks)).toBe("atrasada");
  });

  it("sem tarefa vinculada nunca fica atrasada automaticamente", () => {
    const f = fase({ status: "em_andamento", dataFim: daysFromToday(-1) });
    expect(faseStatusEfetivo(f, [])).toBe("em_andamento");
  });
});

describe("faseAtual — prioridades", () => {
  it("prioridade 1: fase marcada manualmente como atual vence qualquer outra regra", () => {
    const f1 = fase({ id: "f1", sortOrder: 0, status: "nao_iniciada" });
    const f2 = fase({ id: "f2", sortOrder: 1, status: "em_andamento", manualCurrent: true });
    expect(faseAtual([f1, f2], [])?.id).toBe("f2");
  });

  it("prioridade 2: fase 'em_andamento' cujo período contém hoje, sem marcação manual", () => {
    const f1 = fase({ id: "f1", sortOrder: 0, status: "nao_iniciada" });
    const f2 = fase({
      id: "f2",
      sortOrder: 1,
      status: "em_andamento",
      dataInicio: daysFromToday(-5),
      dataFim: daysFromToday(5),
    });
    expect(faseAtual([f1, f2], [])?.id).toBe("f2");
  });

  it("prioridade 3: primeira fase não concluída/pausada por sortOrder", () => {
    const f1 = fase({ id: "f1", sortOrder: 0, status: "concluida" });
    const f2 = fase({ id: "f2", sortOrder: 1, status: "pausada" });
    const f3 = fase({ id: "f3", sortOrder: 2, status: "nao_iniciada" });
    expect(faseAtual([f1, f2, f3], [])?.id).toBe("f3");
  });

  it("todas concluídas ou pausadas: null (estado neutro, nunca inventa fase)", () => {
    const f1 = fase({ status: "concluida" });
    const f2 = fase({ status: "pausada" });
    expect(faseAtual([f1, f2], [])).toBeNull();
  });

  it("sem nenhuma fase: null", () => {
    expect(faseAtual([], [])).toBeNull();
  });

  it("nunca retorna mais de uma — sortOrder desempata entre duas manualCurrent", () => {
    const f1 = fase({ id: "f1", sortOrder: 1, manualCurrent: true });
    const f2 = fase({ id: "f2", sortOrder: 0, manualCurrent: true });
    expect(faseAtual([f1, f2], [])?.id).toBe("f2");
  });
});

describe("roadmapProgressoGeral", () => {
  it("soma tarefas de todas as fases — não é a média das porcentagens", () => {
    const f1 = fase({ id: "f1" });
    const f2 = fase({ id: "f2" });
    const tasks = [
      // f1: 1/1 = 100%
      task({ roadmapPhaseId: "f1", status: "Concluído" }),
      // f2: 1/9 ≈ 11%
      task({ roadmapPhaseId: "f2", status: "Concluído" }),
      ...Array.from({ length: 8 }, () => task({ roadmapPhaseId: "f2", status: "Aberto" })),
    ];
    // Média simples seria (100+11)/2 ≈ 56%; agregado real é 2/10 = 20%.
    const r = roadmapProgressoGeral([f1, f2], tasks);
    expect(r.total).toBe(10);
    expect(r.concluidas).toBe(2);
    expect(r.pct).toBe(20);
  });

  it("ignora tarefas sem fase", () => {
    const f1 = fase({ id: "f1" });
    const tasks = [task({ roadmapPhaseId: "f1", status: "Concluído" }), task({ status: "Aberto" })];
    expect(roadmapProgressoGeral([f1], tasks).total).toBe(1);
  });

  it("nenhuma fase com tarefas: pct null, nunca dividir por zero", () => {
    expect(roadmapProgressoGeral([fase()], []).pct).toBeNull();
  });
});

describe("faseConcluidaComPendencias", () => {
  it("fase concluída com tarefa aberta gera aviso", () => {
    const f = fase({ id: "f1", status: "concluida" });
    const tasks = [task({ roadmapPhaseId: "f1", status: "Aberto" })];
    expect(faseConcluidaComPendencias(f, tasks)).toBe(true);
  });

  it("fase concluída sem pendências não gera aviso", () => {
    const f = fase({ id: "f1", status: "concluida" });
    const tasks = [task({ roadmapPhaseId: "f1", status: "Concluído" })];
    expect(faseConcluidaComPendencias(f, tasks)).toBe(false);
  });

  it("fase não concluída nunca gera este aviso, mesmo com pendências", () => {
    const f = fase({ id: "f1", status: "em_andamento" });
    const tasks = [task({ roadmapPhaseId: "f1", status: "Aberto" })];
    expect(faseConcluidaComPendencias(f, tasks)).toBe(false);
  });
});
