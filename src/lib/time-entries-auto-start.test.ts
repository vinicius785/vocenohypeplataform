import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  running: null as null | Record<string, unknown>,
  inserts: [] as unknown[],
  insertError: null as null | { code?: string; message: string },
  toasts: [] as { msg: string; action?: { label: string; onClick: () => void } }[],
  errors: [] as string[],
}));

const ME = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/chat-store", () => ({ getMe: () => ({ id: ME }) }));
vi.mock("@/lib/performance-engine", () => ({
  isValidUuid: (v: string) => /^[0-9a-f-]{36}$/i.test(v),
}));
vi.mock("sonner", () => {
  const toast = Object.assign(
    (msg: string, opts?: { action?: { label: string; onClick: () => void } }) =>
      h.toasts.push({ msg, action: opts?.action }),
    { error: (m: string) => h.errors.push(m) },
  );
  return { toast };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.is = () => q;
      q.update = () => q;
      q.maybeSingle = () => Promise.resolve({ data: h.running, error: null });
      q.insert = (row: unknown) => {
        h.inserts.push(row);
        const r: Record<string, unknown> = {};
        r.select = () => r;
        r.single = () =>
          Promise.resolve(
            h.insertError
              ? { data: null, error: h.insertError }
              : {
                  data: {
                    id: "e1",
                    task_id: "t1",
                    task_origin: "projeto",
                    user_id: ME,
                    started_at: new Date().toISOString(),
                    ended_at: null,
                    duration_seconds: null,
                    source: "cronometro",
                    note: null,
                    created_at: new Date().toISOString(),
                    edited_by: null,
                    edited_at: null,
                    original_started_at: null,
                    original_ended_at: null,
                  },
                  error: null,
                },
          );
        return r;
      };
      return q;
    },
  },
}));

import { startTimerOnInProgress } from "./time-entries";

const runningRow = (taskId: string, origin = "projeto") => ({
  id: "r1",
  task_id: taskId,
  task_origin: origin,
  user_id: ME,
  started_at: "2026-10-06T10:00:00Z",
  ended_at: null,
  duration_seconds: null,
  source: "cronometro",
  note: null,
  created_at: "2026-10-06T10:00:00Z",
  edited_by: null,
  edited_at: null,
  original_started_at: null,
  original_ended_at: null,
});

beforeEach(() => {
  h.running = null;
  h.inserts = [];
  h.insertError = null;
  h.toasts = [];
  h.errors = [];
});

describe("startTimerOnInProgress — cronômetro começa sozinho ao entrar em 'Em andamento'", () => {
  it("sem cronômetro rodando: inicia para o usuário atual", async () => {
    await startTimerOnInProgress("t1", "projeto", "Revisar briefing");
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0]).toMatchObject({
      task_id: "t1",
      task_origin: "projeto",
      user_id: ME,
      source: "cronometro",
    });
    expect(h.toasts).toHaveLength(0);
  });
  it("já rodando nesta mesma tarefa: não faz nada", async () => {
    h.running = runningRow("t1");
    await startTimerOnInProgress("t1", "projeto");
    expect(h.inserts).toHaveLength(0);
    expect(h.toasts).toHaveLength(0);
  });
  it("rodando em OUTRA tarefa: não derruba o outro; oferece 'Trocar'", async () => {
    h.running = runningRow("outra");
    await startTimerOnInProgress("t1", "projeto", "Revisar briefing");
    expect(h.inserts).toHaveLength(0);
    expect(h.toasts).toHaveLength(1);
    expect(h.toasts[0].action?.label).toBe("Trocar");
  });
  it("mesmo id em origem diferente conta como outra tarefa", async () => {
    h.running = runningRow("t1", "campanha");
    await startTimerOnInProgress("t1", "projeto");
    expect(h.inserts).toHaveLength(0);
    expect(h.toasts).toHaveLength(1);
  });
  it("erro ao iniciar: aviso discreto, sem lançar", async () => {
    h.insertError = { message: "boom" };
    await expect(startTimerOnInProgress("t1", "projeto")).resolves.toBeUndefined();
    expect(h.errors).toHaveLength(1);
  });
  it("sem id de tarefa: ignora", async () => {
    await startTimerOnInProgress("", "projeto");
    expect(h.inserts).toHaveLength(0);
  });
});
