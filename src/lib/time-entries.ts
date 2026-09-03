import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMe } from "@/lib/chat-store";
import { isValidUuid, type DateRange } from "@/lib/performance-engine";

/**
 * Leitura/escrita da tabela `time_entries` — ledger real (colunas
 * tipadas, não `{id, data jsonb}`) e append-heavy (muitas linhas por
 * tarefa). Não reaproveita `createTableArrayStore`/`createScopedArrayStore`
 * pelo mesmo motivo que `performance-events-store.ts` também não
 * reaproveita: os dois foram desenhados pra "poucas linhas, uma por
 * entidade, tabela inteira cacheada em memória" — o padrão errado pra
 * uma tabela que cresce indefinidamente e precisa de filtro por
 * task_id/user_id/período no servidor.
 */

export type TaskOrigin = "projeto" | "campanha" | "marketing";
export type TimeEntrySource = "cronometro" | "manual";

export type TimeEntry = {
  id: string;
  taskId: string;
  taskOrigin: TaskOrigin;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  source: TimeEntrySource;
  note: string | null;
  createdAt: string;
  editedBy: string | null;
  editedAt: string | null;
  originalStartedAt: string | null;
  originalEndedAt: string | null;
};

type TimeEntryRow = {
  id: string;
  task_id: string;
  task_origin: TaskOrigin;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  source: TimeEntrySource;
  note: string | null;
  created_at: string;
  edited_by: string | null;
  edited_at: string | null;
  original_started_at: string | null;
  original_ended_at: string | null;
};

function fromRow(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    taskId: row.task_id,
    taskOrigin: row.task_origin,
    userId: row.user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    source: row.source,
    note: row.note,
    createdAt: row.created_at,
    editedBy: row.edited_by,
    editedAt: row.edited_at,
    originalStartedAt: row.original_started_at,
    originalEndedAt: row.original_ended_at,
  };
}

function durationBetween(startedAt: string, endedAt: string): number {
  return Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
}

const UNIQUE_VIOLATION = "23505";

/** Inicia um cronômetro para a tarefa. Se o usuário já tiver outro
 * rodando (garantido por índice único no banco, não só checagem no
 * cliente — evita corrida entre abas/dispositivos), retorna a entrada
 * conflitante em `conflict` em vez de lançar erro, pro chamador exibir
 * o diálogo de conflito. */
export async function startTimer(
  taskId: string,
  taskOrigin: TaskOrigin,
): Promise<{ entry: TimeEntry | null; conflict: TimeEntry | null; error: string | null }> {
  const me = getMe();
  if (!isValidUuid(me.id))
    return { entry: null, conflict: null, error: "Usuário não identificado." };
  const { data, error } = await supabase
    .from("time_entries")
    .insert({
      task_id: taskId,
      task_origin: taskOrigin,
      user_id: me.id,
      started_at: new Date().toISOString(),
      source: "cronometro",
    } as never)
    .select("*")
    .single();
  if (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      const conflict = await getRunningEntryForUser(me.id);
      return { entry: null, conflict, error: null };
    }
    return { entry: null, conflict: null, error: error.message };
  }
  return { entry: fromRow(data as unknown as TimeEntryRow), conflict: null, error: null };
}

/** Para um cronômetro em andamento, calculando a duração pelo relógio
 * do cliente (mesma abordagem que `stopTaskTimer` já usa hoje em
 * TaskBoard.tsx — não introduz um novo comportamento de clock-skew). */
export async function stopTimer(
  entryId: string,
  startedAt: string,
): Promise<{ entry: TimeEntry | null; error: string | null }> {
  const endedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("time_entries")
    .update({ ended_at: endedAt, duration_seconds: durationBetween(startedAt, endedAt) } as never)
    .eq("id", entryId)
    .select("*")
    .single();
  if (error) return { entry: null, error: error.message };
  return { entry: fromRow(data as unknown as TimeEntryRow), error: null };
}

export async function createManualEntry(input: {
  taskId: string;
  taskOrigin: TaskOrigin;
  startedAt: string;
  endedAt: string;
  note?: string;
}): Promise<{ entry: TimeEntry | null; error: string | null }> {
  const me = getMe();
  if (!isValidUuid(me.id)) return { entry: null, error: "Usuário não identificado." };
  const { data, error } = await supabase
    .from("time_entries")
    .insert({
      task_id: input.taskId,
      task_origin: input.taskOrigin,
      user_id: me.id,
      started_at: input.startedAt,
      ended_at: input.endedAt,
      duration_seconds: durationBetween(input.startedAt, input.endedAt),
      source: "manual",
      note: input.note ?? null,
    } as never)
    .select("*")
    .single();
  if (error) return { entry: null, error: error.message };
  return { entry: fromRow(data as unknown as TimeEntryRow), error: null };
}

/** Edição da própria entrada — não grava `edited_by`/`edited_at`: esses
 * campos são reservados pra correção de entrada de OUTRA pessoa (ver
 * `correctTimeEntry` em `time-entries.functions.ts`), pra um ajuste
 * rotineiro na própria entrada não virar um selo permanente de
 * "corrigido por". */
export async function editOwnEntry(
  id: string,
  patch: { startedAt?: string; endedAt?: string; note?: string },
): Promise<{ entry: TimeEntry | null; error: string | null }> {
  const { data: current, error: readError } = await supabase
    .from("time_entries")
    .select("*")
    .eq("id", id)
    .single();
  if (readError || !current)
    return { entry: null, error: readError?.message ?? "Entrada não encontrada." };
  const row = current as unknown as TimeEntryRow;
  const startedAt = patch.startedAt ?? row.started_at;
  const endedAt = patch.endedAt ?? row.ended_at;
  const update: Partial<TimeEntryRow> = {
    started_at: startedAt,
    note: patch.note ?? row.note,
  };
  if (endedAt) {
    update.ended_at = endedAt;
    update.duration_seconds = durationBetween(startedAt, endedAt);
  }
  const { data, error } = await supabase
    .from("time_entries")
    .update(update as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return { entry: null, error: error.message };
  return { entry: fromRow(data as unknown as TimeEntryRow), error: null };
}

export async function deleteEntry(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("time_entries").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function listEntriesByTask(
  taskId: string,
  taskOrigin: TaskOrigin,
): Promise<TimeEntry[]> {
  const { data, error } = await supabase
    .from("time_entries")
    .select("*")
    .eq("task_id", taskId)
    .eq("task_origin", taskOrigin)
    .order("started_at", { ascending: false });
  if (error) {
    console.warn("[time_entries] listEntriesByTask failed", error);
    return [];
  }
  return ((data as TimeEntryRow[] | null) ?? []).map(fromRow);
}

/** Para (silenciosamente) o cronômetro do usuário atual SE ele estiver
 * rodando nesta tarefa específica — chamado quando uma tarefa entra em
 * "Concluído", nunca em outra mudança de status (regra: cronômetro
 * sobrevive a qualquer outra troca de status, só "Concluído" para
 * sozinho). Fire-and-forget: nunca bloqueia a mudança de status
 * principal por causa disso. */
export async function stopIfRunningOnTask(taskId: string, taskOrigin: TaskOrigin): Promise<void> {
  const me = getMe();
  if (!isValidUuid(me.id)) return;
  const running = await getRunningEntryForUser(me.id);
  if (running && running.taskId === taskId && running.taskOrigin === taskOrigin) {
    await stopTimer(running.id, running.startedAt);
  }
}

export async function getRunningEntryForUser(userId: string): Promise<TimeEntry | null> {
  const { data, error } = await supabase
    .from("time_entries")
    .select("*")
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return fromRow(data as unknown as TimeEntryRow);
}

/** Cronômetro rodando do usuário atual, pro indicador global. Busca ao
 * montar + repolling a cada 20s como rede de segurança entre
 * abas/dispositivos — quem inicia/para na mesma aba deve também
 * atualizar seu próprio estado local otimisticamente, sem esperar o
 * próximo poll (ver AppShell.tsx). */
const RUNNING_TIMER_POLL_MS = 20_000;

export function useRunningTimer(): {
  entry: TimeEntry | null;
  loading: boolean;
  refetch: () => void;
} {
  const [entry, setEntry] = useState<TimeEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const me = getMe();
    if (!isValidUuid(me.id)) {
      setLoading(false);
      return;
    }
    void getRunningEntryForUser(me.id).then((result) => {
      if (!cancelled) {
        setEntry(result);
        setLoading(false);
      }
    });
    const interval = window.setInterval(() => {
      void getRunningEntryForUser(me.id).then((result) => {
        if (!cancelled) setEntry(result);
      });
    }, RUNNING_TIMER_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [tick]);

  return { entry, loading, refetch: () => setTick((t) => t + 1) };
}

export function useTaskTimeEntries(
  taskId: string | undefined,
  taskOrigin: TaskOrigin | undefined,
): { entries: TimeEntry[]; loading: boolean; refetch: () => void } {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!taskId || !taskOrigin) {
      setEntries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listEntriesByTask(taskId, taskOrigin).then((result) => {
      if (!cancelled) {
        setEntries(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, taskOrigin, tick]);

  return { entries, loading, refetch: () => setTick((t) => t + 1) };
}

/** Entradas do time num período, opcionalmente filtradas por pessoa —
 * pra relatório da aba Time. Sem polling/realtime (mesma justificativa
 * de `usePerformanceEvents`: essa tela não precisa de push evento-a-
 * evento), só refetch quando o período/pessoa mudam. */
export function useTeamTimeEntries(
  range: DateRange,
  userId?: string,
): { entries: TimeEntry[]; loading: boolean } {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    let query = supabase.from("time_entries").select("*").order("started_at", { ascending: true });
    if (range.from) query = query.gte("started_at", `${range.from}T00:00:00`);
    if (range.to) query = query.lte("started_at", `${range.to}T23:59:59`);
    if (userId) query = query.eq("user_id", userId);
    void query.then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn("[time_entries] useTeamTimeEntries failed", error);
        setEntries([]);
      } else {
        setEntries(((data as TimeEntryRow[] | null) ?? []).map(fromRow));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, userId]);

  return { entries, loading };
}
