import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ inserts: [] as unknown[], demoTaskIds: new Set<string>() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({}) },
    from: () => ({
      insert: (row: unknown) => {
        h.inserts.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  },
}));
vi.mock("@/lib/campanha-scoped-store", () => ({
  isDemoTaskId: (id: string) => h.demoTaskIds.has(id),
}));

import { recordPerformanceEvent, type NewPerformanceEvent } from "./performance-events-store";

const flush = () => new Promise((r) => setTimeout(r, 0));

const base: NewPerformanceEvent = {
  eventType: "task_completed",
  personId: "p1",
  personName: "Pessoa",
  actorId: "a1",
  actorName: "Ator",
  taskId: "t1",
  taskOrigin: "campanha",
  taskTitle: "Tarefa",
  meetingId: null,
  data: {},
};

beforeEach(() => {
  h.inserts.length = 0;
  h.demoTaskIds.clear();
});

describe("recordPerformanceEvent × Demo", () => {
  it("tarefa de campanha comum continua gravando no ledger", async () => {
    recordPerformanceEvent(base);
    await flush();
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0]).toMatchObject({ task_id: "t1", task_origin: "campanha" });
  });

  it("tarefa de campanha de DEMONSTRAÇÃO não grava nada", async () => {
    h.demoTaskIds.add("t-demo");
    recordPerformanceEvent({ ...base, taskId: "t-demo" });
    await flush();
    expect(h.inserts).toHaveLength(0);
  });

  it("só a origem `campanha` é afetada: mesmo id em projeto/marketing/reunião continua gravando", async () => {
    h.demoTaskIds.add("t-demo");
    recordPerformanceEvent({ ...base, taskId: "t-demo", taskOrigin: "projeto" });
    recordPerformanceEvent({ ...base, taskId: "t-demo", taskOrigin: "marketing" });
    recordPerformanceEvent({
      ...base,
      eventType: "meeting_attendance_recorded",
      taskId: null,
      taskOrigin: null,
      meetingId: "m1",
    });
    await flush();
    expect(h.inserts).toHaveLength(3);
  });
});

describe("recordPerformanceEvent × id de tarefa avulsa do Marketing", () => {
  it("grava o uuid sem o prefixo 'mkt:' (task_id é UUID no banco)", async () => {
    recordPerformanceEvent({
      ...base,
      taskId: "mkt:0b6f5a52-1111-4222-8333-444455556666",
      taskOrigin: "marketing",
    });
    await flush();
    expect((h.inserts[0] as { task_id: string }).task_id).toBe(
      "0b6f5a52-1111-4222-8333-444455556666",
    );
  });

  it("id sem prefixo passa intacto; sem id continua sem id", async () => {
    recordPerformanceEvent({ ...base, taskId: "0b6f5a52-1111-4222-8333-444455556666" });
    recordPerformanceEvent({ ...base, taskId: null });
    await flush();
    expect((h.inserts[0] as { task_id: string }).task_id).toBe(
      "0b6f5a52-1111-4222-8333-444455556666",
    );
    expect((h.inserts[1] as { task_id: unknown }).task_id).toBeNull();
  });
});
