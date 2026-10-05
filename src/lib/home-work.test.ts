import { describe, expect, it } from "vitest";
import {
  formatClock,
  pendingDependencyCount,
  statusGate,
  timerMatchesTask,
  workContextLabel,
} from "./home-work";
import { statusTargetOrigin, updateTaskNode } from "./task-status-change";
import type { Task } from "@/components/tasks/TaskBoard";

describe("contexto da tarefa", () => {
  const clientes = new Map([["c1", "Governo RJ"]]);
  it("campanha: cliente · campanha", () => {
    expect(workContextLabel({ campanhaId: "c1", projectName: "PoupaTempo" }, clientes)).toBe(
      "Governo RJ · PoupaTempo",
    );
  });
  it("projeto / marketing / sem cliente", () => {
    expect(workContextLabel({ projectName: "Marketing" }, clientes)).toBe("Marketing");
    expect(workContextLabel({ campanhaId: "x", projectName: "Campanha X" }, clientes)).toBe(
      "Campanha X",
    );
    expect(workContextLabel({ campanhaId: "c1", projectName: "" }, clientes)).toBe("Governo RJ");
  });
});

describe("origem e cronômetro", () => {
  it("origem pela tarefa (subtarefa do Marketing herda do pai)", () => {
    expect(statusTargetOrigin({ id: "a", projectId: "p" })).toBe("projeto");
    expect(statusTargetOrigin({ id: "a", projectId: "p", campanhaId: "c" })).toBe("campanha");
    expect(statusTargetOrigin({ id: "mkt:a", projectId: "p" })).toBe("marketing");
    expect(statusTargetOrigin({ id: "sub", projectId: "p", parentId: "mkt:a" })).toBe("marketing");
  });
  it("casa o cronômetro por id cru + origem", () => {
    const entry = { taskId: "a", taskOrigin: "marketing" as const };
    expect(timerMatchesTask({ id: "mkt:a", projectId: "p" }, entry)).toBe(true);
    expect(timerMatchesTask({ id: "a", projectId: "p" }, entry)).toBe(false);
    expect(timerMatchesTask({ id: "mkt:a", projectId: "p" }, null)).toBe(false);
  });
  it("relógio", () => {
    expect(formatClock(0)).toBe("00:00:00");
    expect(formatClock(27 * 60 + 14)).toBe("00:27:14");
    expect(formatClock(3661)).toBe("01:01:01");
  });
});

describe("regras de troca de status na Home", () => {
  it("mesmo status → nada", () => expect(statusGate("Aberto", "Aberto", 0)).toBe("noop"));
  it("bloquear/desbloquear abre a tarefa", () => {
    expect(statusGate("Aberto", "Bloqueada", 0)).toBe("open-task");
    expect(statusGate("Bloqueada", "Aberto", 0)).toBe("open-task");
  });
  it("dependência pendente barra Em andamento e pede confirmação ao concluir", () => {
    expect(statusGate("Aberto", "Em andamento", 1)).toBe("blocked-by-dependency");
    expect(statusGate("Em andamento", "Concluído", 2)).toBe("confirm-complete");
    expect(statusGate("Aberto", "Em aprovação", 2)).toBe("apply");
    expect(statusGate("Aberto", "Em andamento", 0)).toBe("apply");
  });
  it("conta dependências não concluídas", () => {
    const deps = [
      { blockedTaskId: "t", blockingTaskId: "a" },
      { blockedTaskId: "t", blockingTaskId: "b" },
      { blockedTaskId: "x", blockingTaskId: "c" },
    ];
    const status = (id: string) => (id === "a" ? "Concluído" : "Aberto");
    expect(pendingDependencyCount("t", deps, status)).toBe(1);
  });
});

describe("updateTaskNode (subtarefas)", () => {
  const sub = { id: "s", title: "S", status: "Aberto" } as unknown as Task;
  const root = { id: "r", title: "R", status: "Aberto", subtasks: [sub] } as unknown as Task;
  it("atualiza subtarefa dentro da tarefa-mãe sem tocar no resto", () => {
    const r = updateTaskNode([root], "s", (t) => ({ ...t, status: "Concluído" }));
    expect(r?.prev.status).toBe("Aberto");
    expect(r?.next.status).toBe("Concluído");
    expect(r?.list[0].status).toBe("Aberto");
    expect(r?.list[0].subtasks?.[0].status).toBe("Concluído");
  });
  it("id inexistente → null", () => {
    expect(updateTaskNode([root], "nada", (t) => t)).toBeNull();
  });
});
