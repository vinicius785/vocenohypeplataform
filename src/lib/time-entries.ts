import { useEffect, useState, useSyncExternalStore } from "react";
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

export type TaskOrigin = "projeto" | "campanha" | "marketing" | "comercial";
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
  /** Sessão compartilhada (null = sessão de uma pessoa só: histórico antigo e timer solo). */
  sessionId?: string | null;
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
  session_id?: string | null;
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
    sessionId: row.session_id ?? null,
  };
}

function durationBetween(startedAt: string, endedAt: string): number {
  return Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
}

const UNIQUE_VIOLATION = "23505";

/** Avisa todas as telas (indicador global, painel da tarefa) que o cronômetro mudou, sem esperar o
 * polling de 20 s. */
const TIMER_CHANGED_EVENT = "vnh:timer-changed";
export function emitTimerChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TIMER_CHANGED_EVENT));
}

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
  emitTimerChanged();
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
  emitTimerChanged();
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
 * "Concluído" ou quando sai de "Em andamento" (regras em `timer-status-rules.ts`); e COMEÇA
 * sozinho ao entrar em "Em andamento" (ver `startTimerOnInProgress`). Fire-and-forget: nunca bloqueia a mudança de status
 * principal por causa disso. */
/** Quando uma tarefa passa para "Em andamento", o cronômetro começa sozinho para QUEM mudou o
 * status (o usuário atual). Fire-and-forget: nunca bloqueia a mudança de status.
 *  - já rodando nesta tarefa → não faz nada;
 *  - rodando em OUTRA tarefa → não derruba o outro sem perguntar: avisa e oferece "Trocar";
 *  - falha ao iniciar → aviso discreto (o status já mudou). */
export async function startTimerOnInProgress(
  taskId: string,
  taskOrigin: TaskOrigin,
  taskTitle?: string,
): Promise<void> {
  const me = getMe();
  if (!isValidUuid(me.id) || !taskId) return;
  const { toast } = await import("sonner");
  const offerSwitch = (other: TimeEntry) =>
    toast("Você já tem um cronômetro rodando em outra tarefa.", {
      description: taskTitle
        ? `Troque para começar a contar “${taskTitle}”.`
        : "Troque para contar esta tarefa.",
      action: {
        label: "Trocar",
        onClick: () => {
          void (async () => {
            const stopped = await stopTimer(other.id, other.startedAt);
            if (stopped.error) return void toast.error(stopped.error);
            const started = await startTimer(taskId, taskOrigin);
            if (started.error) toast.error("Não foi possível iniciar o cronômetro.");
          })();
        },
      },
    });
  const running = await getRunningEntryForUser(me.id);
  if (running) {
    if (running.taskId === taskId && running.taskOrigin === taskOrigin) return;
    offerSwitch(running);
    return;
  }
  const { conflict, error } = await startTimer(taskId, taskOrigin);
  if (conflict) offerSwitch(conflict);
  else if (error) toast.error("Não foi possível iniciar o cronômetro desta tarefa.");
}

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

/** Cronômetro rodando do usuário atual — UMA fonte compartilhada (indicador global do AppShell e
 * "Meu trabalho" do Início leem o MESMO estado): uma única busca inicial e um único repolling de
 * 20 s como rede de segurança entre abas/dispositivos, não importa quantos componentes usem o
 * hook. Quem inicia/para na mesma aba avisa via `emitTimerChanged()` e o estado atualiza na hora. */
const RUNNING_TIMER_POLL_MS = 20_000;

type RunningState = { entry: TimeEntry | null; loading: boolean };
let runningState: RunningState = { entry: null, loading: true };
const runningListeners = new Set<() => void>();
let runningPoll: number | null = null;
let runningSeq = 0;

function setRunningState(next: RunningState) {
  const same =
    next.loading === runningState.loading &&
    next.entry?.id === runningState.entry?.id &&
    next.entry?.endedAt === runningState.entry?.endedAt;
  if (same) return;
  runningState = next;
  runningListeners.forEach((l) => l());
}

async function refreshRunning() {
  const me = getMe();
  if (!isValidUuid(me.id)) {
    setRunningState({ entry: null, loading: false });
    return;
  }
  const mine = ++runningSeq;
  const entry = await getRunningEntryForUser(me.id);
  if (mine === runningSeq) setRunningState({ entry, loading: false });
}

function subscribeRunning(listener: () => void): () => void {
  runningListeners.add(listener);
  // Cada novo componente confere o estado atual ao montar (como antes); o repolling é um só.
  void refreshRunning();
  if (runningListeners.size === 1) {
    runningPoll = window.setInterval(() => void refreshRunning(), RUNNING_TIMER_POLL_MS);
    window.addEventListener(TIMER_CHANGED_EVENT, onRunningChanged);
  }
  return () => {
    runningListeners.delete(listener);
    if (runningListeners.size === 0) {
      if (runningPoll !== null) window.clearInterval(runningPoll);
      runningPoll = null;
      window.removeEventListener(TIMER_CHANGED_EVENT, onRunningChanged);
    }
  };
}
function onRunningChanged() {
  void refreshRunning();
}
const SERVER_RUNNING_STATE: RunningState = { entry: null, loading: true };

export function useRunningTimer(): {
  entry: TimeEntry | null;
  loading: boolean;
  refetch: () => void;
} {
  const state = useSyncExternalStore(
    subscribeRunning,
    () => runningState,
    () => SERVER_RUNNING_STATE,
  );
  return { entry: state.entry, loading: state.loading, refetch: () => void refreshRunning() };
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
    const onChanged = () => setTick((t) => t + 1);
    window.addEventListener(TIMER_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(TIMER_CHANGED_EVENT, onChanged);
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

/* ------------------------------------------------------------------ */
/* Sessões compartilhadas (v2). Solo continua usando as funções acima. */
/* ------------------------------------------------------------------ */

const rpc = async <T>(name: string, args: Record<string, unknown>) =>
  (await supabase.rpc(name as never, args as never)) as unknown as {
    data: T | null;
    error: { message: string; code?: string } | null;
  };

const MIGRATION_HINT = "Recurso de tempo compartilhado indisponível (migration pendente).";

function friendlyError(error: { message: string; code?: string }): string {
  const m = error.message ?? "";
  if (/time_entries_one_running_per_user/.test(m))
    return "Essa pessoa já está cronometrando outra tarefa.";
  if (/time_entries_session_user_uniq/.test(m)) return "Essa pessoa já participa desta sessão.";
  if (/participante fora do time/.test(m)) return "Essa pessoa não faz parte do time.";
  if (/forbidden/.test(m)) return "Você não participa desta sessão.";
  if (/intervalo inválido/.test(m))
    return "Intervalo inválido: o fim não pode ser antes do início.";
  if (/function .* does not exist|Could not find the function/.test(m)) return MIGRATION_HINT;
  return m;
}

/** Garante o id da sessão da linha do próprio usuário (criado na primeira vez que alguém entra). */
export async function ensureSession(
  entry: TimeEntry,
): Promise<{ sessionId: string | null; error: string | null }> {
  if (entry.sessionId) return { sessionId: entry.sessionId, error: null };
  const { data, error } = await rpc<string>("ensure_time_session", { p_entry: entry.id });
  if (error || !data)
    return { sessionId: null, error: friendlyError(error ?? { message: MIGRATION_HINT }) };
  return { sessionId: data, error: null };
}

/** Adiciona alguém à sessão. Sem `endedAt`, a pessoa entra cronometrando (respeita um timer por pessoa). */
export async function addParticipant(input: {
  sessionId: string;
  userId: string;
  startedAt: string;
  endedAt?: string | null;
}): Promise<{ entry: TimeEntry | null; error: string | null }> {
  const { data, error } = await rpc<TimeEntryRow>("add_time_participant", {
    p_session: input.sessionId,
    p_user: input.userId,
    p_started: input.startedAt,
    p_ended: input.endedAt ?? null,
  });
  if (error || !data)
    return { entry: null, error: friendlyError(error ?? { message: MIGRATION_HINT }) };
  emitTimerChanged();
  return { entry: fromRow(data), error: null };
}

/** Registro manual compartilhado (tudo ou nada). Um participante só = linha comum, sem sessão. */
export async function createManualSession(input: {
  taskId: string;
  taskOrigin: TaskOrigin;
  note?: string;
  rows: { userId: string; startedAt: string; endedAt: string }[];
}): Promise<{ error: string | null }> {
  const me = getMe();
  if (!isValidUuid(me.id)) return { error: "Usuário não identificado." };
  if (input.rows.length === 1 && input.rows[0].userId === me.id) {
    const r = input.rows[0];
    const { error } = await createManualEntry({
      taskId: input.taskId,
      taskOrigin: input.taskOrigin,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      note: input.note,
    });
    return { error };
  }
  const { error } = await rpc<string>("create_manual_time_session", {
    p_task: input.taskId,
    p_origin: input.taskOrigin,
    p_note: input.note ?? "",
    p_participants: input.rows.map((r) => ({
      user_id: r.userId,
      started_at: r.startedAt,
      ended_at: r.endedAt,
    })),
  });
  if (error) return { error: friendlyError(error) };
  emitTimerChanged();
  return { error: null };
}

/** Para a sessão inteira (relógio do servidor, idempotente). Sem sessão, para só a própria linha. */
export async function stopSession(entry: TimeEntry): Promise<{ error: string | null }> {
  if (!entry.sessionId) {
    const { error } = await stopTimer(entry.id, entry.startedAt);
    return { error };
  }
  const { error } = await rpc<number>("stop_time_session", { p_session: entry.sessionId });
  if (error) return { error: friendlyError(error) };
  emitTimerChanged();
  return { error: null };
}

/** Edita horários/observação de uma linha. Linha de OUTRA pessoa grava a auditoria de correção. */
export async function editEntryRow(
  id: string,
  patch: { startedAt: string; endedAt: string; note?: string | null },
  opts: { foreign: boolean },
): Promise<{ error: string | null }> {
  if (Date.parse(patch.endedAt) < Date.parse(patch.startedAt))
    return { error: "O fim não pode ser antes do início." };
  const { data: current, error: readError } = await supabase
    .from("time_entries")
    .select("*")
    .eq("id", id)
    .single();
  if (readError || !current) return { error: readError?.message ?? "Registro não encontrado." };
  const row = current as unknown as TimeEntryRow;
  const update: Partial<TimeEntryRow> = {
    started_at: patch.startedAt,
    ended_at: patch.endedAt,
    duration_seconds: durationBetween(patch.startedAt, patch.endedAt),
    note: patch.note === undefined ? row.note : patch.note,
  };
  if (opts.foreign) {
    const me = getMe();
    update.edited_by = me.id;
    update.edited_at = new Date().toISOString();
    if (row.original_started_at == null) {
      update.original_started_at = row.started_at;
      update.original_ended_at = row.ended_at;
    }
  }
  const { error } = await supabase
    .from("time_entries")
    .update(update as never)
    .eq("id", id);
  if (error) return { error: error.message };
  emitTimerChanged();
  return { error: null };
}
