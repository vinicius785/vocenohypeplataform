import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TASK_STATUSES, groupForStatus } from "@/lib/task-status";
import type { TaskBlockedState } from "@/lib/projetos";
import {
  TaskBlockIndicator,
  TaskDeadlineBadge,
  TaskDeadlineDate,
  TaskPriorityFlag,
  TaskStatusBadge,
  blockHeadline,
  blockKindOf,
  deadlineDateViewFromTask,
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

describe("prazo como data + cor (tabela de subtarefas)", () => {
  // 07/10/2026, 10h (local) — antes do corte das 19h.
  const now = new Date(2026, 9, 7, 10, 0, 0);
  const CUTOFF = 19;
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
  const view = (task: Parameters<typeof deadlineDateViewFromTask>[0], when = now) =>
    deadlineDateViewFromTask(task, CUTOFF, when);

  it("concluída no prazo = verde, com a data (nunca o texto do estado)", () => {
    const v = view({ status: "Concluído", dueDate: "2026-10-09", completedAt: at(2026, 10, 8) });
    expect(v).toEqual({
      text: "09/10/2026",
      tone: "success",
      title: "09/10/2026 · concluída no prazo",
    });
  });

  it("concluída atrasada = vermelho", () => {
    const v = view({
      status: "Concluído",
      dueDate: "2026-10-05",
      completedAt: at(2026, 10, 6, 10),
    });
    expect(v.text).toBe("05/10/2026");
    expect(v.tone).toBe("danger");
    expect(v.title).toBe("05/10/2026 · concluída com atraso · +1d");
  });

  it("data passada concluída NO prazo continua verde (não fica vermelha por já ter passado)", () => {
    const v = view({
      status: "Concluído",
      dueDate: "2026-10-05",
      completedAt: at(2026, 10, 5, 15),
    });
    expect(v.tone).toBe("success");
    expect(v.text).toBe("05/10/2026");
  });

  it("data passada concluída DEPOIS do prazo é vermelha", () => {
    const v = view({ status: "Concluído", dueDate: "2026-10-05", completedAt: at(2026, 10, 6, 9) });
    expect(v.tone).toBe("danger");
  });

  it("concluída sem `completedAt` (legado): verde e sem afirmar 'no prazo'", () => {
    const v = view({ status: "Concluído", dueDate: "2026-10-01" });
    expect(v.tone).toBe("success");
    expect(v.title).toBe("01/10/2026 · concluída");
  });

  it("vence hoje = amarelo", () => {
    const v = view({ status: "Aberto", dueDate: "2026-10-07" });
    expect(v).toEqual({ text: "07/10/2026", tone: "warning", title: "07/10/2026 · vence hoje" });
  });

  it("vence hoje, mas depois do corte das 19h, já é atrasada (regra da engine)", () => {
    const v = view({ status: "Aberto", dueDate: "2026-10-07" }, new Date(2026, 9, 7, 20, 0, 0));
    expect(v.tone).toBe("danger");
  });

  it("vence amanhã = amarelo suave", () => {
    const v = view({ status: "Aberto", dueDate: "2026-10-08" });
    expect(v).toEqual({
      text: "08/10/2026",
      tone: "warning_soft",
      title: "08/10/2026 · vence amanhã",
    });
  });

  it("vence em vários dias = neutro", () => {
    const v = view({ status: "Aberto", dueDate: "2026-10-15" });
    expect(v).toEqual({ text: "15/10/2026", tone: "neutral", title: "15/10/2026 · no prazo" });
  });

  it("atrasada = vermelho", () => {
    const v = view({ status: "Aberto", dueDate: "2026-10-06" });
    expect(v).toEqual({
      text: "06/10/2026",
      tone: "danger",
      title: "06/10/2026 · atrasada · 1d",
    });
  });

  it("aberta replanejada DEPOIS de vencer: vale o último prazo, não fica atrasada", () => {
    const v = view({
      status: "Em andamento",
      dueDate: "2026-10-12",
      performanceDueDate: "2026-10-12",
      originalDueDate: "2026-10-05",
      deadlineHistory: [
        {
          from: "2026-10-05",
          to: "2026-10-12",
          changedAt: at(2026, 10, 6, 21),
          isCritical: true,
          exemptFromResponsibility: false,
        },
      ],
    });
    expect(v.text).toBe("12/10/2026");
    expect(v.tone).toBe("neutral");
  });

  it("sem prazo = traço neutro", () => {
    expect(view({ status: "Aberto" })).toEqual({ text: "—", tone: "muted", title: "Sem prazo" });
  });

  it("meses diferentes: mostra a data completa; a virada de mês conta como 'amanhã'", () => {
    expect(view({ status: "Aberto", dueDate: "2026-11-03" }).text).toBe("03/11/2026");
    const v = view({ status: "Aberto", dueDate: "2026-11-01" }, new Date(2026, 9, 31, 10, 0, 0));
    expect(v.tone).toBe("warning_soft");
  });

  it("prazo pausado por bloqueio não vira verde/vermelho", () => {
    const v = view({
      status: "Bloqueada",
      dueDate: "2026-10-06",
      blockedState: block({ pausesDeadline: true }),
    });
    expect(v.tone).toBe("neutral");
    expect(v.title).toBe("06/10/2026 · prazo pausado");
  });

  it("a célula renderiza só a data, sem selo, ponto nem texto de estado", () => {
    const html = renderToStaticMarkup(
      <TaskDeadlineDate view={view({ status: "Aberto", dueDate: "2026-10-06" })} />,
    );
    expect(html).toContain("06/10/2026");
    expect(html).toContain("text-danger-soft-foreground");
    expect(html).not.toMatch(/Atrasada|Vence|Hoje|Amanhã|Concluíd|<svg/);
    expect(html).not.toContain("rounded-full");
  });
});
