import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TASK_STATUSES, groupForStatus } from "@/lib/task-status";
import type { TaskBlockedState } from "@/lib/projetos";
import {
  TaskBlockIndicator,
  TaskDeadlineBadge,
  TaskPriorityFlag,
  TaskStatusBadge,
  blockHeadline,
  blockKindOf,
  deadlineViewFromDashTask,
  deadlineViewFromTask,
  overdueLabel,
} from "./task-ui";

const block = (over: Partial<TaskBlockedState>): TaskBlockedState => ({
  blockId: "b",
  category: "aguardando_cliente",
  reason: "Aguardando aprovação do roteiro",
  blockedAt: "2026-09-28T12:00:00Z",
  blockedByUserId: "u",
  blockedByName: "Ana",
  pausesDeadline: true,
  ...over,
});

describe("status", () => {
  it("4 grupos: não iniciado, ativo (com Bloqueada), finalizado, arquivado", () => {
    const by = (g: string) => TASK_STATUSES.filter((s) => groupForStatus(s) === g);
    expect(by("not_started")).toEqual(["Aberto"]);
    expect(by("active_group")).toEqual(["Em andamento", "Em aprovação", "Em ajustes", "Bloqueada"]);
    expect(by("done_group")).toEqual(["Aprovado", "Concluído"]);
    expect(by("archived_group")).toEqual(["Arquivado"]);
  });
  it("selo sempre tem ícone + texto", () => {
    for (const s of TASK_STATUSES) {
      const html = renderToStaticMarkup(<TaskStatusBadge status={s} />);
      expect(html).toContain("<svg");
      expect(html).toContain(s);
    }
  });
  it("prioridade é bandeira + texto, sem fundo (não compete com status)", () => {
    const html = renderToStaticMarkup(<TaskPriorityFlag priority="Alta" />);
    expect(html).toContain("Alta");
    expect(html).not.toMatch(/bg-/);
  });
});

describe("prazo", () => {
  const now = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const past = new Date(now.getTime() - 3 * 86400000);

  it("rótulo único de atraso", () => {
    expect(overdueLabel(1)).toBe("Atrasada · 1d");
    expect(overdueLabel(0)).toBe("Atrasada · 1d");
  });
  it("tarefa vencida aparece como atrasada", () => {
    const v = deadlineViewFromTask({ status: "Aberto", dueDate: iso(past) }, 19);
    expect(v.state).toBe("atrasada");
    expect(v.label).toMatch(/^Atrasada · \d+d$/);
  });
  it("bloqueada com prazo pausado nunca aparece como atrasada", () => {
    const v = deadlineViewFromTask(
      { status: "Bloqueada", dueDate: iso(past), blockedState: block({ pausesDeadline: true }) },
      19,
    );
    expect(v).toMatchObject({ state: "pausado", label: "Prazo pausado" });
    expect(renderToStaticMarkup(<TaskDeadlineBadge view={v} />)).toContain("Prazo pausado");
  });
  it("bloqueada SEM pausa continua mostrando a saúde real do prazo", () => {
    const v = deadlineViewFromTask(
      { status: "Bloqueada", dueDate: iso(past), blockedState: block({ pausesDeadline: false }) },
      19,
    );
    expect(v.state).toBe("atrasada");
  });
  it("sem prazo / no prazo com data", () => {
    expect(deadlineViewFromTask({ status: "Aberto" }, 19).label).toBe("Sem prazo");
    const future = iso(new Date(now.getTime() + 5 * 86400000));
    expect(
      deadlineViewFromTask({ status: "Aberto", dueDate: future }, 19, { dateLabel: "Seg 5/10" }),
    ).toMatchObject({ state: "no_prazo", label: "Seg 5/10" });
  });
  it("DashTask reaproveita o bucket já calculado", () => {
    expect(
      deadlineViewFromDashTask({
        status: "Aberto",
        bucket: "atrasada",
        due: "Atrasada · 4d",
        dueISO: "2026-09-01",
        overdueDays: 4,
      }),
    ).toMatchObject({ state: "atrasada", label: "Atrasada · 4d" });
    expect(
      deadlineViewFromDashTask({ status: "Aberto", bucket: "hoje", due: "Hoje", dueISO: "x" })
        .label,
    ).toBe("Vence hoje");
    expect(
      deadlineViewFromDashTask({
        status: "Bloqueada",
        bucket: "atrasada",
        due: "",
        deadlinePaused: true,
      }).state,
    ).toBe("pausado");
    expect(deadlineViewFromDashTask({ status: "Aberto", bucket: "outro", due: "" }).label).toBe(
      "Sem prazo",
    );
  });
});

describe("bloqueio", () => {
  it("dependência de tarefa × bloqueio operacional", () => {
    const dep = block({ category: "dependencia_tarefa", relatedTaskTitle: "Atualizar Metas" });
    expect(blockKindOf(dep)).toBe("dependencia");
    expect(blockHeadline(dep)).toBe("Depende de: Atualizar Metas");
    const op = block({ category: "aguardando_time", responsibleForUnblockingName: "Lucas" });
    expect(blockKindOf(op)).toBe("operacional");
    expect(blockHeadline(op)).toBe("Aguardando alguém do time · Lucas");
  });
  it("indicador compacto mostra o porquê", () => {
    const html = renderToStaticMarkup(<TaskBlockIndicator blocked={block({})} />);
    expect(html).toContain("Aguardando cliente");
  });
});
