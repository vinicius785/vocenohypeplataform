import { describe, expect, it } from "vitest";
import type { Project, Task } from "@/lib/projetos";
import {
  computeProjectMetrics,
  countActiveProjectFilters,
  DEFAULT_PROJECT_FILTERS,
  filterProjects,
  sortProjects,
  statusMenuActions,
  type ProjectFiltersState,
} from "./projeto-ui";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    title: "Tarefa",
    status: "Aberto",
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: "Projeto",
    description: "",
    features: ["kanban"],
    createdAt: Date.now(),
    milestones: [],
    tasks: [],
    docs: [],
    status: "ativo",
    ...overrides,
  };
}

function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("computeProjectMetrics — progresso", () => {
  it("projeto sem tarefas: total 0, progresso null (nunca divide por zero)", () => {
    const m = computeProjectMetrics(project({ tasks: [] }), []);
    expect(m.total).toBe(0);
    expect(m.progressPct).toBeNull();
  });

  it("conta corretamente concluídas vs total, ignorando tarefas arquivadas", () => {
    const p = project({
      tasks: [
        task({ status: "Concluído" }),
        task({ status: "Concluído" }),
        task({ status: "Aberto" }),
        task({ status: "Arquivado" }), // não é "tarefa válida" — fora da conta
      ],
    });
    const m = computeProjectMetrics(p, []);
    expect(m.total).toBe(3);
    expect(m.completed).toBe(2);
    expect(m.progressPct).toBe(67);
  });

  it("não desce em subtarefas aninhadas (evita contar a mesma entrega duas vezes)", () => {
    const p = project({
      tasks: [
        task({
          status: "Aberto",
          subtasks: [task({ status: "Concluído" }), task({ status: "Concluído" })],
        }),
      ],
    });
    const m = computeProjectMetrics(p, []);
    expect(m.total).toBe(1);
    expect(m.completed).toBe(0);
  });
});

describe("computeProjectMetrics — atrasadas e vencendo", () => {
  it("tarefa aberta com prazo vencido conta como atrasada", () => {
    const p = project({ tasks: [task({ status: "Aberto", dueDate: daysFromToday(-2) })] });
    const m = computeProjectMetrics(p, []);
    expect(m.overdueCount).toBe(1);
    expect(m.dueSoonCount).toBe(0);
  });

  it("tarefa concluída com prazo no passado NÃO conta como atrasada", () => {
    const p = project({ tasks: [task({ status: "Concluído", dueDate: daysFromToday(-2) })] });
    const m = computeProjectMetrics(p, []);
    expect(m.overdueCount).toBe(0);
  });

  it("tarefa aberta vencendo dentro da janela de 7 dias conta como 'vencendo'", () => {
    const p = project({ tasks: [task({ status: "Aberto", dueDate: daysFromToday(3) })] });
    const m = computeProjectMetrics(p, []);
    expect(m.dueSoonCount).toBe(1);
    expect(m.overdueCount).toBe(0);
  });

  it("bloqueio ativo é contado independentemente do status", () => {
    const p = project({
      tasks: [
        task({
          status: "Bloqueada",
          blockedState: {
            blockId: "b1",
            category: "outro",
            reason: "x",
            blockedAt: new Date().toISOString(),
            blockedByUserId: "u1",
            blockedByName: "Fulano",
            pausesDeadline: false,
          },
        }),
      ],
    });
    const m = computeProjectMetrics(p, []);
    expect(m.blockedCount).toBe(1);
  });
});

describe("computeProjectMetrics — saúde operacional", () => {
  function tasksAbertas(n: number, atrasadas: number): Task[] {
    return Array.from({ length: n }, (_, i) =>
      task({ status: "Aberto", dueDate: i < atrasadas ? daysFromToday(-1) : daysFromToday(30) }),
    );
  }

  it("saudável: sem bloqueios e menos de 10% de tarefas abertas atrasadas", () => {
    const p = project({ tasks: tasksAbertas(10, 0) });
    expect(computeProjectMetrics(p, []).health).toBe("saudavel");
  });

  it("atenção: entre 10% e 25% das tarefas abertas atrasadas", () => {
    const p = project({ tasks: tasksAbertas(10, 2) }); // 20%
    expect(computeProjectMetrics(p, []).health).toBe("atencao");
  });

  it("em risco: mais de 25% das tarefas abertas atrasadas", () => {
    const p = project({ tasks: tasksAbertas(10, 3) }); // 30%
    expect(computeProjectMetrics(p, []).health).toBe("em_risco");
  });

  it("um único bloqueio já marca em risco (bloqueio tratado como crítico)", () => {
    const p = project({
      tasks: [
        task({
          status: "Bloqueada",
          blockedState: {
            blockId: "b1",
            category: "outro",
            reason: "x",
            blockedAt: new Date().toISOString(),
            blockedByUserId: "u1",
            blockedByName: "Fulano",
            pausesDeadline: false,
          },
        }),
      ],
    });
    expect(computeProjectMetrics(p, []).health).toBe("em_risco");
  });

  it("prazo final vencido com trabalho pendente marca em risco", () => {
    const p = project({
      milestones: [{ id: "m1", title: "Entrega final", date: daysFromToday(-5), done: false }],
      tasks: [task({ status: "Aberto" })],
    });
    expect(computeProjectMetrics(p, []).health).toBe("em_risco");
  });

  it("prazo próximo (sem estar vencido) marca atenção", () => {
    const p = project({
      milestones: [{ id: "m1", title: "Entrega final", date: daysFromToday(3), done: false }],
      tasks: [task({ status: "Aberto", dueDate: daysFromToday(30) })],
    });
    expect(computeProjectMetrics(p, []).health).toBe("atencao");
  });

  it("saúde é null para projetos que não estão ativos", () => {
    const p = project({ status: "pausado", tasks: tasksAbertas(10, 5) });
    expect(computeProjectMetrics(p, []).health).toBeNull();
  });

  it("uma única pendência pequena não derruba o projeto pra 'em risco'", () => {
    const p = project({ tasks: tasksAbertas(20, 1) }); // 5%
    expect(computeProjectMetrics(p, []).health).toBe("saudavel");
  });
});

describe("computeProjectMetrics — responsáveis", () => {
  it("sem tarefas com assignee: sem responsável (estado válido, não erro)", () => {
    const p = project({ tasks: [task({ status: "Aberto" })] });
    const m = computeProjectMetrics(p, []);
    expect(m.principal).toBeNull();
    expect(m.participantes).toEqual([]);
  });

  it("responsável principal é quem mais aparece em tarefas abertas", () => {
    const p = project({
      tasks: [
        task({ status: "Aberto", assignee: "Ana" }),
        task({ status: "Aberto", assignee: "Ana" }),
        task({ status: "Aberto", assignee: "Bruno" }),
        task({ status: "Concluído", assignee: "Carla" }), // fechada, não conta
      ],
    });
    const m = computeProjectMetrics(p, []);
    expect(m.principal?.name).toBe("Ana");
    expect(m.participantes.map((x) => x.name)).toEqual(["Bruno"]);
  });
});

describe("filterProjects", () => {
  const projetos = [
    project({ id: "1", name: "Alpha", status: "ativo", features: ["kanban"] }),
    project({ id: "2", name: "Beta", status: "pausado", features: ["roadmap"] }),
    project({
      id: "3",
      name: "Gama",
      status: "ativo",
      tasks: [
        task({
          status: "Bloqueada",
          blockedState: {
            blockId: "b",
            category: "outro",
            reason: "x",
            blockedAt: new Date().toISOString(),
            blockedByUserId: "u",
            blockedByName: "u",
            pausesDeadline: false,
          },
        }),
      ],
    }),
  ];
  const metricsById = new Map(projetos.map((p) => [p.id, computeProjectMetrics(p, [])]));

  it("sem filtro nenhum retorna tudo", () => {
    expect(filterProjects(projetos, metricsById, "", DEFAULT_PROJECT_FILTERS)).toHaveLength(3);
  });

  it("busca por nome", () => {
    const r = filterProjects(projetos, metricsById, "alp", DEFAULT_PROJECT_FILTERS);
    expect(r.map((p) => p.id)).toEqual(["1"]);
  });

  it("filtro de status", () => {
    const r = filterProjects(projetos, metricsById, "", {
      ...DEFAULT_PROJECT_FILTERS,
      status: "pausado",
    });
    expect(r.map((p) => p.id)).toEqual(["2"]);
  });

  it("filtro 'em risco' usa a saúde calculada, não o status administrativo", () => {
    const r = filterProjects(projetos, metricsById, "", {
      ...DEFAULT_PROJECT_FILTERS,
      status: "em_risco",
    });
    expect(r.map((p) => p.id)).toEqual(["3"]);
  });

  it("filtro de funcionalidade", () => {
    const r = filterProjects(projetos, metricsById, "", {
      ...DEFAULT_PROJECT_FILTERS,
      feature: "roadmap",
    });
    expect(r.map((p) => p.id)).toEqual(["2"]);
  });

  it("filtros combinados (status + busca)", () => {
    const r = filterProjects(projetos, metricsById, "gama", {
      ...DEFAULT_PROJECT_FILTERS,
      status: "ativo",
    });
    expect(r.map((p) => p.id)).toEqual(["3"]);
  });

  it("countActiveProjectFilters conta só os que saíram do padrão", () => {
    expect(countActiveProjectFilters(DEFAULT_PROJECT_FILTERS)).toBe(0);
    const f: ProjectFiltersState = {
      ...DEFAULT_PROJECT_FILTERS,
      status: "ativo",
      feature: "kanban",
    };
    expect(countActiveProjectFilters(f)).toBe(2);
  });
});

describe("sortProjects", () => {
  const a = project({ id: "a", name: "Zebra", createdAt: 1000, tasks: [] });
  const b = project({ id: "b", name: "Abacate", createdAt: 2000, tasks: [] });
  const projetos = [a, b];

  it("nome (A–Z)", () => {
    const metricsById = new Map(projetos.map((p) => [p.id, computeProjectMetrics(p, [])]));
    const r = sortProjects(projetos, metricsById, "nome");
    expect(r.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("criados recentemente", () => {
    const metricsById = new Map(projetos.map((p) => [p.id, computeProjectMetrics(p, [])]));
    const r = sortProjects(projetos, metricsById, "criados");
    expect(r.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("mais tarefas atrasadas", () => {
    const withOverdue = project({
      id: "c",
      tasks: [task({ status: "Aberto", dueDate: daysFromToday(-1) })],
    });
    const list = [a, withOverdue];
    const metricsById = new Map(list.map((p) => [p.id, computeProjectMetrics(p, [])]));
    const r = sortProjects(list, metricsById, "atrasadas");
    expect(r[0].id).toBe("c");
  });

  it("prazo mais próximo (sem prazo vai por último)", () => {
    const comPrazo = project({
      id: "d",
      milestones: [{ id: "m", title: "x", date: daysFromToday(1), done: false }],
    });
    const semPrazo = project({ id: "e", milestones: [] });
    const list = [semPrazo, comPrazo];
    const metricsById = new Map(list.map((p) => [p.id, computeProjectMetrics(p, [])]));
    const r = sortProjects(list, metricsById, "prazo");
    expect(r.map((p) => p.id)).toEqual(["d", "e"]);
  });

  it("maior e menor progresso", () => {
    const alto = project({ id: "f", tasks: [task({ status: "Concluído" })] });
    const baixo = project({
      id: "g",
      tasks: [task({ status: "Aberto" }), task({ status: "Aberto" })],
    });
    const list = [baixo, alto];
    const metricsById = new Map(list.map((p) => [p.id, computeProjectMetrics(p, [])]));
    expect(sortProjects(list, metricsById, "progresso_desc").map((p) => p.id)).toEqual(["f", "g"]);
    expect(sortProjects(list, metricsById, "progresso_asc").map((p) => p.id)).toEqual(["g", "f"]);
  });

  it("atualizados recentemente (padrão) usa a última atividade calculada", () => {
    const antigo = project({ id: "h", createdAt: 1000, updatedAt: 1000 });
    const recente = project({ id: "i", createdAt: 1000, updatedAt: Date.now() });
    const list = [antigo, recente];
    const metricsById = new Map(list.map((p) => [p.id, computeProjectMetrics(p, [])]));
    const r = sortProjects(list, metricsById, "atualizados");
    expect(r.map((p) => p.id)).toEqual(["i", "h"]);
  });
});

describe("statusMenuActions", () => {
  it("ativo: pode pausar e arquivar, não 'reativar'", () => {
    expect(statusMenuActions("ativo")).toEqual({
      canPause: true,
      canReactivate: false,
      canArchive: true,
    });
  });
  it("pausado: pode reativar e arquivar, não pausar de novo", () => {
    expect(statusMenuActions("pausado")).toEqual({
      canPause: false,
      canReactivate: true,
      canArchive: true,
    });
  });
  it("arquivado: só reativar", () => {
    expect(statusMenuActions("arquivado")).toEqual({
      canPause: false,
      canReactivate: true,
      canArchive: false,
    });
  });
});
