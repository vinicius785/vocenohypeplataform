import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PERFORMANCE_SETTINGS,
  type DateRange,
  type PerformanceSettings,
} from "@/lib/performance-engine";

/**
 * Leitura/escrita do ledger `performance_events` — append-only e
 * imutável (só existem policies de RLS de SELECT/INSERT na tabela; sem
 * NENHUMA policy de UPDATE/DELETE, o Postgres nega essas operações por
 * padrão pra `authenticated`). Não reaproveita `createTableArrayStore`/
 * `createScopedArrayStore`: os dois foram desenhados pra
 * upsert-por-valor-completo + delete-quando-sai-do-array, o padrão
 * errado pra um ledger insert-only com colunas reais (não `{id, data
 * jsonb}`). Cresce indefinidamente e nenhuma tela precisa de push
 * evento-a-evento — não há realtime aqui, só refetch.
 */

export type PerformanceEventType =
  | "task_completed"
  | "task_reopened"
  | "task_deadline_changed"
  | "task_assignee_changed"
  | "meeting_attendance_recorded";

export type PerformanceEvent = {
  id: string;
  eventType: PerformanceEventType;
  personId: string | null;
  personName: string;
  actorId: string;
  actorName: string;
  occurredAt: string;
  taskId: string | null;
  taskOrigin: "projeto" | "campanha" | "marketing" | null;
  taskTitle: string | null;
  meetingId: string | null;
  data: Record<string, unknown>;
};

export type NewPerformanceEvent = Omit<PerformanceEvent, "id" | "occurredAt">;

type PerformanceEventRow = {
  id: string;
  event_type: PerformanceEventType;
  person_id: string | null;
  person_name: string;
  actor_id: string;
  actor_name: string;
  occurred_at: string;
  task_id: string | null;
  task_origin: "projeto" | "campanha" | "marketing" | null;
  task_title: string | null;
  meeting_id: string | null;
  data: Record<string, unknown>;
};

function fromRow(row: PerformanceEventRow): PerformanceEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    personId: row.person_id,
    personName: row.person_name,
    actorId: row.actor_id,
    actorName: row.actor_name,
    occurredAt: row.occurred_at,
    taskId: row.task_id,
    taskOrigin: row.task_origin,
    taskTitle: row.task_title,
    meetingId: row.meeting_id,
    data: row.data ?? {},
  };
}

/** Fire-and-forget: grava um evento no ledger. Nunca bloqueia o
 * salvamento da tarefa/reunião que o disparou — falha aqui não pode
 * impedir a ação principal do usuário, só fica registrada no console. */
export function recordPerformanceEvent(input: NewPerformanceEvent): void {
  void supabase.auth.getSession().then(() =>
    supabase
      .from("performance_events")
      .insert({
        event_type: input.eventType,
        person_id: input.personId,
        person_name: input.personName,
        actor_id: input.actorId,
        actor_name: input.actorName,
        task_id: input.taskId,
        task_origin: input.taskOrigin,
        task_title: input.taskTitle,
        meeting_id: input.meetingId,
        data: input.data,
      } as never)
      .then(({ error }) => {
        if (error) console.warn("[performance_events] insert failed", error);
      }),
  );
}

/** Busca eventos do ledger num range (`occurred_at`), opcionalmente
 * filtrado por pessoa. `range` omitido = sem filtro de data. Sem
 * realtime aqui de propósito (o ledger cresce indefinidamente e nenhuma
 * tela precisa de push evento-a-evento) — mas um refetch só-no-mount
 * deixava a página Time e a ficha do membro travadas em snapshots
 * diferentes sempre que alguém completava uma tarefa/registrava presença
 * enquanto as duas telas já estavam abertas (ex.: um backfill rodando
 * enquanto a página já tinha buscado antes). Repolling a cada 30s (mesmo
 * intervalo já usado pro diretório do time em `_authenticated/route.tsx`)
 * garante que as duas convirjam pro mesmo estado em pouco tempo, sem
 * precisar de infraestrutura de realtime nova. */
const REFETCH_INTERVAL_MS = 30_000;

export function usePerformanceEvents(
  range?: DateRange,
  personId?: string,
): { events: PerformanceEvent[]; loading: boolean } {
  const [events, setEvents] = useState<PerformanceEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchEvents = (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      let query = supabase.from("performance_events").select("*").order("occurred_at", {
        ascending: true,
      });
      if (range?.from) query = query.gte("occurred_at", `${range.from}T00:00:00`);
      if (range?.to) query = query.lte("occurred_at", `${range.to}T23:59:59`);
      if (personId) query = query.eq("person_id", personId);
      void query.then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("[performance_events] fetch failed", error);
          setEvents([]);
        } else {
          setEvents(((data as PerformanceEventRow[] | null) ?? []).map(fromRow));
        }
        setLoading(false);
      });
    };
    fetchEvents(true);
    const interval = window.setInterval(() => fetchEvents(false), REFETCH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [range?.from, range?.to, personId]);

  return { events, loading };
}

type PerformanceSettingsRow = {
  weight_execucao: number;
  weight_pendencias: number;
  weight_compromissos: number;
  pendencias_dias_teto: number;
  xp_task_on_time: number;
  xp_task_early_bonus: number;
  xp_meeting_attended: number;
  xp_meeting_missed: number;
  xp_overdue_dias_teto: number;
  motivo_isencao_default: Record<string, boolean>;
};

function fromSettingsRow(row: PerformanceSettingsRow): PerformanceSettings {
  return {
    weightExecucao: row.weight_execucao,
    weightPendencias: row.weight_pendencias,
    weightCompromissos: row.weight_compromissos,
    pendenciasDiasTeto: row.pendencias_dias_teto,
    xpTaskOnTime: row.xp_task_on_time,
    xpTaskEarlyBonus: row.xp_task_early_bonus,
    xpMeetingAttended: row.xp_meeting_attended,
    xpMeetingMissed: row.xp_meeting_missed,
    xpOverdueDiasTeto: row.xp_overdue_dias_teto,
    motivoIsencaoDefault: row.motivo_isencao_default ?? {},
  };
}

/** Pesos/regras configuráveis do Score/XP (singleton `performance_settings`,
 * só admin edita). Cai pros defaults locais se a leitura falhar — nunca
 * trava a tela de Time por causa de configuração. */
export function usePerformanceSettings(): { settings: PerformanceSettings; loading: boolean } {
  const [settings, setSettings] = useState<PerformanceSettings>(DEFAULT_PERFORMANCE_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("performance_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) setSettings(fromSettingsRow(data as unknown as PerformanceSettingsRow));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, loading };
}

/** Atualiza o singleton `performance_settings` — só admin (RLS). */
export async function savePerformanceSettings(
  patch: Partial<PerformanceSettings>,
): Promise<{ error: string | null }> {
  const row: Partial<PerformanceSettingsRow> = {};
  if (patch.weightExecucao != null) row.weight_execucao = patch.weightExecucao;
  if (patch.weightPendencias != null) row.weight_pendencias = patch.weightPendencias;
  if (patch.weightCompromissos != null) row.weight_compromissos = patch.weightCompromissos;
  if (patch.pendenciasDiasTeto != null) row.pendencias_dias_teto = patch.pendenciasDiasTeto;
  if (patch.xpTaskOnTime != null) row.xp_task_on_time = patch.xpTaskOnTime;
  if (patch.xpTaskEarlyBonus != null) row.xp_task_early_bonus = patch.xpTaskEarlyBonus;
  if (patch.xpMeetingAttended != null) row.xp_meeting_attended = patch.xpMeetingAttended;
  if (patch.xpMeetingMissed != null) row.xp_meeting_missed = patch.xpMeetingMissed;
  if (patch.xpOverdueDiasTeto != null) row.xp_overdue_dias_teto = patch.xpOverdueDiasTeto;
  if (patch.motivoIsencaoDefault != null) row.motivo_isencao_default = patch.motivoIsencaoDefault;
  const { error } = await supabase
    .from("performance_settings")
    .update(row as never)
    .eq("id", true);
  return { error: error?.message ?? null };
}
