-- Persistent time-tracking ledger for tasks. Replaces the opaque
-- Task.timerRunning/timerStartedAt/timeEntries JSONB fields (spread across
-- projeto_tarefas/campanha_tarefas/marketing_standalone_tasks) with a real
-- relational table so time can be queried/aggregated per user/task/period.

CREATE TABLE public.time_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL,
  -- No SQL FK: a task lives in one of 3 different tables depending on
  -- scope (projeto_tarefas / campanha_tarefas / marketing_standalone_tasks).
  -- Mirrors TaskBoard.tsx's existing taskOrigin discriminator convention.
  task_origin TEXT NOT NULL CHECK (task_origin IN ('projeto', 'campanha', 'marketing')),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMPTZ NOT NULL,
  -- NULL ended_at IS the running-timer state — no separate boolean flag
  -- to drift out of sync with it.
  ended_at TIMESTAMPTZ,
  -- Persisted explicitly (not GENERATED) so a manual entry's duration is
  -- exactly what was typed even if started_at/ended_at are corrected later
  -- independently; NULL while running (computed client-side for display).
  duration_seconds INTEGER,
  source TEXT NOT NULL CHECK (source IN ('cronometro', 'manual')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Audit trail for admin corrections of someone else's entry.
  -- original_* snapshot only the FIRST edit's pre-edit values (never
  -- overwritten by subsequent edits).
  edited_by UUID REFERENCES auth.users(id),
  edited_at TIMESTAMPTZ,
  original_started_at TIMESTAMPTZ,
  original_ended_at TIMESTAMPTZ,
  CONSTRAINT time_entries_ended_after_started CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- Query patterns: in-task history (task_id+task_origin), per-user period
-- aggregation (user_id+date range).
CREATE INDEX time_entries_task_idx ON public.time_entries (task_id, task_origin);
CREATE INDEX time_entries_user_started_idx ON public.time_entries (user_id, started_at);

-- DB-level guarantee of "strict single-active-timer-per-user" — a partial
-- unique index, not just an app-level check-then-insert (which races
-- across tabs/devices). startTimer() catches the resulting unique_violation
-- (Postgres code 23505) and surfaces it as a conflict-resolution dialog.
CREATE UNIQUE INDEX time_entries_one_running_per_user
  ON public.time_entries (user_id) WHERE ended_at IS NULL;

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;

-- INSERT: always self — an admin correcting someone else's entry only
-- ever UPDATEs an existing row, never authors a new one on their behalf.
CREATE POLICY "users insert own time_entries" ON public.time_entries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- SELECT/UPDATE/DELETE: own rows OR has_permission(auth.uid(),'time').
-- has_permission() already ORs in is_admin() internally, so this covers
-- real admins and any member granted the "time" permission (the same
-- permission that already gates the whole Time section client-side).
CREATE POLICY "own or time-permission read time_entries" ON public.time_entries
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_permission(auth.uid(), 'time'));
CREATE POLICY "own or time-permission update time_entries" ON public.time_entries
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_permission(auth.uid(), 'time'))
  WITH CHECK (auth.uid() = user_id OR public.has_permission(auth.uid(), 'time'));
CREATE POLICY "own or time-permission delete time_entries" ON public.time_entries
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_permission(auth.uid(), 'time'));
