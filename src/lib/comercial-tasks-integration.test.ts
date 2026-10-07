import { beforeEach, describe, expect, it, vi } from "vitest";

/** Tarefas do Comercial são tarefas como as demais: entram em "Meu trabalho" (Início), na lista e
 * na carga do Time, no Score (abertas/atrasadas), no diretório (@menção/dependências) e mudam de
 * status pelo mesmo pipeline. */

const state = vi.hoisted(() => ({
  comercial: [] as unknown[],
  saved: [] as unknown[][],
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/projetos", async (orig) => ({
  ...(await orig<typeof import("@/lib/projetos")>()),
  loadProjetos: () => [],
}));
vi.mock("@/lib/campanha-scoped-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/campanha-scoped-store")>()),
  getAllCampanhaTarefas: () => new Map(),
}));
const mkt = vi.hoisted(() => ({ inserted: [] as unknown[], removed: [] as string[] }));
vi.mock("@/lib/marketing-tasks", async (orig) => ({
  ...(await orig<typeof import("@/lib/marketing-tasks")>()),
  loadStandalone: () => [],
  insertStandaloneWithId: (t: unknown) => mkt.inserted.push(t),
  removeStandalone: (id: string) => mkt.removed.push(id),
}));
const proj = vi.hoisted(() => ({ saved: [] as { id: string; list: unknown[] }[] }));
vi.mock("@/lib/projeto-scoped-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/projeto-scoped-store")>()),
  loadProjetoTarefas: () => [],
  saveProjetoTarefas: (id: string, list: unknown[]) => proj.saved.push({ id, list }),
}));
vi.mock("@/lib/comercial-tasks", () => ({
  loadComercialTasks: () => state.comercial,
  saveComercialTasks: (next: unknown[]) => {
    state.saved.push(next);
    state.comercial = next;
  },
  onComercialTasksChange: () => () => {},
  comercialAsTaskGroup: () => ({ id: "comercial", name: "Comercial", tasks: state.comercial }),
}));
vi.mock("@/lib/task-dependencies-store", () => ({
  cleanupDependenciesForTask: vi.fn(),
}));
vi.mock("@/lib/chat-store", () => ({
  getMe: () => ({ id: "not-a-uuid", name: "Vini" }),
  getCurrentAuthor: () => ({ name: "Vini" }),
}));
vi.mock("@/lib/performance-events-store", () => ({ recordPerformanceEvent: vi.fn() }));
vi.mock("@/lib/time-entries", () => ({
  startTimerOnInProgress: vi.fn(),
  stopIfRunningOnTask: vi.fn(),
}));

const task = (o: Record<string, unknown> = {}) => ({
  id: "t1",
  title: "Ligar para a Rodonaves",
  status: "Aberto",
  priority: "Normal",
  assignees: ["Vinícius Garcia"],
  createdAt: "2026-10-01T10:00:00Z",
  subtasks: [],
  ...o,
});

beforeEach(() => {
  state.comercial = [];
  state.saved = [];
  mkt.inserted = [];
  mkt.removed = [];
  proj.saved = [];
});

describe("Início / Time: agregação", () => {
  it("'Meu trabalho': tarefa do Comercial aparece para o responsável, com a marca `comercial`", async () => {
    const { loadTasksByAssignee, loadAllTasks } = await import("./task-aggregation");
    state.comercial = [task()];
    const mine = loadAllTasks(new Map(), "Vinícius Garcia");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: "t1", projectName: "Comercial", comercial: true });
    expect(loadTasksByAssignee(new Map()).get("Outra Pessoa")).toBeUndefined();
  });
  it("subtarefa entra pelo responsável dela e aponta para a tarefa-mãe", async () => {
    const { loadAllTasks } = await import("./task-aggregation");
    state.comercial = [
      task({
        assignees: ["Ana"],
        subtasks: [
          {
            id: "s1",
            title: "Preparar proposta",
            status: "Aberto",
            priority: "Normal",
            assignees: ["Vinícius Garcia"],
          },
        ],
      }),
    ];
    const sub = loadAllTasks(new Map(), "Vinícius Garcia");
    expect(sub).toHaveLength(1);
    expect(sub[0]).toMatchObject({
      id: "s1",
      parentId: "t1",
      parentTitle: "Ligar para a Rodonaves",
      comercial: true,
    });
  });
  it("Time: lista achatada tem uma linha por tarefa com todos os responsáveis", async () => {
    const { loadAllTasksFlat } = await import("./task-aggregation");
    state.comercial = [task({ assignees: ["Ana", "Vinícius Garcia"] })];
    const flat = loadAllTasksFlat(new Map());
    expect(flat).toHaveLength(1);
    expect(flat[0].assignees).toEqual(["Ana", "Vinícius Garcia"]);
    expect(flat[0].comercial).toBe(true);
  });
  it("tarefa concluída entra com data de conclusão e atrasada aparece como atrasada", async () => {
    const { loadAllTasksFlat } = await import("./task-aggregation");
    state.comercial = [
      task({ id: "a", dueDate: "2020-01-01" }),
      task({ id: "b", status: "Concluído", completedAt: "2026-10-02T12:00:00Z" }),
    ];
    const flat = loadAllTasksFlat(new Map());
    expect(flat.find((t) => t.id === "a")?.bucket).toBe("atrasada");
    expect(flat.find((t) => t.id === "b")?.completedAt).toBeTruthy();
  });
  it("comentário com @menção em tarefa do Comercial notifica", async () => {
    const { collectTaskCommentMentions } = await import("./task-aggregation");
    state.comercial = [
      task({
        comments: [
          {
            id: "c1",
            author: "Ana",
            text: "@Vinícius Garcia pode revisar?",
            createdAt: "2026-10-05T10:00:00Z",
          },
        ],
      }),
    ];
    const m = collectTaskCommentMentions("Vinícius Garcia");
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ comercial: true, taskTitle: "Ligar para a Rodonaves" });
  });
});

describe("Score: tarefas abertas do Comercial contam", () => {
  it("aparecem nas pendências do responsável (grupo do Comercial)", async () => {
    const { loadOpenTasksByMemberId } = await import("./score");
    const { comercialAsTaskGroup } = await import("./comercial-tasks");
    state.comercial = [task({ dueDate: "2020-01-01" }), task({ id: "done", status: "Concluído" })];
    const open = loadOpenTasksByMemberId(
      [],
      [{ id: "m1", name: "Vinícius Garcia" }] as never,
      [comercialAsTaskGroup()] as never,
    );
    expect(open.get("m1")?.map((t) => t.id)).toEqual(["t1"]);
    expect(open.get("m1")?.[0].dueDate).toBe("2020-01-01");
  });
});

describe("mudança de status pelo Início/Time", () => {
  it("grava na tabela do Comercial e liga o cronômetro com origem 'comercial'", async () => {
    const { changeTaskStatus } = await import("./task-status-change");
    const { startTimerOnInProgress } = await import("./time-entries");
    state.comercial = [task()];
    const res = changeTaskStatus({ id: "t1", projectId: "", comercial: true }, "Em andamento", {
      members: [],
      performanceSettings: {} as never,
    });
    expect(res.ok).toBe(true);
    expect(state.saved).toHaveLength(1);
    expect((state.saved[0][0] as { status: string }).status).toBe("Em andamento");
    expect(startTimerOnInProgress).toHaveBeenCalledWith(
      "t1",
      "comercial",
      "Ligar para a Rodonaves",
    );
  });
  it("concluir devolve completed e tarefa inexistente falha sem gravar", async () => {
    const { changeTaskStatus } = await import("./task-status-change");
    state.comercial = [task()];
    expect(
      changeTaskStatus({ id: "t1", projectId: "", comercial: true }, "Concluído", {
        members: [],
        performanceSettings: {} as never,
      }),
    ).toEqual({ ok: true, completed: true });
    expect(
      changeTaskStatus({ id: "nope", projectId: "", comercial: true }, "Concluído", {
        members: [],
        performanceSettings: {} as never,
      }).ok,
    ).toBe(false);
  });
});

describe("diretório (@menção, dependências, modal)", () => {
  it("findTaskContext acha tarefa e subtarefa do Comercial e salva na tabela dela", async () => {
    const { findTaskContext } = await import("./task-directory");
    state.comercial = [
      task({
        subtasks: [{ id: "s1", title: "Sub", status: "Aberto", priority: "Normal" }],
      }),
    ];
    const root = findTaskContext("t1")!;
    expect(root.breadcrumb).toBe("Comercial");
    expect(root.scope).toBeUndefined();
    expect(root.parent).toBeUndefined();
    const sub = findTaskContext("s1")!;
    root.save({ ...(root.task as object), title: "Novo título" } as never);
    expect((state.saved.at(-1)![0] as { title: string }).title).toBe("Novo título");
    // A mãe sai do texto da origem e vira `parent` (item navegável no caminho do detalhe).
    expect(sub.breadcrumb).toBe("Comercial");
    expect(sub.parent).toEqual({ id: "t1", title: "Ligar para a Rodonaves" });
    sub.remove();
    expect((state.saved.at(-1)![0] as { subtasks: unknown[] }).subtasks).toEqual([]);
  });
});

describe("origem 'comercial' (cronômetro e performance)", () => {
  it("o escopo do board e o alvo de status resolvem para a origem 'comercial'", async () => {
    const { taskOriginFromScope, statusTargetOrigin } = await import("./task-status-change");
    expect(taskOriginFromScope({ kind: "comercial" })).toBe("comercial");
    expect(statusTargetOrigin({ id: "t1", projectId: "", comercial: true })).toBe("comercial");
    expect(statusTargetOrigin({ id: "t1", projectId: "p" })).toBe("projeto");
  });
  it("o evento de performance sai com task_origin 'comercial' ao concluir", async () => {
    const { changeTaskStatus } = await import("./task-status-change");
    const chat = await import("@/lib/chat-store");
    vi.spyOn(chat, "getMe").mockReturnValue({
      id: "8f14e45f-ceea-4672-9c8e-2f3f6a1b7f10",
      name: "Vini",
    } as never);
    const { recordPerformanceEvent } = await import("@/lib/performance-events-store");
    state.comercial = [task()];
    changeTaskStatus({ id: "t1", projectId: "", comercial: true }, "Concluído", {
      members: [{ id: "m1", name: "Vinícius Garcia" }] as never,
      performanceSettings: { deadlineCutoffHour: 19 } as never,
    });
    const calls = vi.mocked(recordPerformanceEvent).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(([e]) => (e as { taskOrigin: string }).taskOrigin === "comercial")).toBe(
      true,
    );
  });
});

describe("mover e duplicar", () => {
  it("mover do Comercial para projeto tira de lá e coloca lá, mantendo o id", async () => {
    const { moveTask } = await import("./move-task");
    state.comercial = [task(), task({ id: "t2" })];
    moveTask(task() as never, { kind: "comercial" }, { kind: "projeto", id: "p9", label: "Proj" });
    expect((state.saved.at(-1) as { id: string }[]).map((t) => t.id)).toEqual(["t2"]);
    expect(proj.saved.at(-1)?.id).toBe("p9");
    expect((proj.saved.at(-1)!.list as { id: string }[]).map((t) => t.id)).toEqual(["t1"]);
  });
  it("mover do Marketing para o Comercial tira o prefixo mkt:", async () => {
    const { moveTask } = await import("./move-task");
    state.comercial = [];
    moveTask(
      task({ id: "mkt:x1" }) as never,
      { kind: "marketing" },
      { kind: "comercial", label: "Comercial" },
    );
    expect(mkt.removed).toEqual(["x1"]);
    expect((state.saved.at(-1) as { id: string }[]).map((t) => t.id)).toEqual(["x1"]);
  });
  it("duplicar no Comercial cria cópia sem histórico, no próprio Comercial", async () => {
    const { duplicateTask } = await import("./move-task");
    state.comercial = [task()];
    const copy = duplicateTask(
      task({ activity: [{ id: "a" }], comments: [{ id: "c" }], completedAt: "x" }) as never,
      { kind: "comercial" },
    );
    expect(copy.id).not.toBe("t1");
    expect(copy.title).toBe("Ligar para a Rodonaves (cópia)");
    expect(copy.activity).toBeUndefined();
    const list = state.saved.at(-1) as { id: string }[];
    expect(list).toHaveLength(2);
    expect(list.map((t) => t.id)).toContain(copy.id);
  });
});
