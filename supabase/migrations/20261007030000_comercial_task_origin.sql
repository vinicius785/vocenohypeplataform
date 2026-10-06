-- Tarefas do Comercial passam a ter origem própria ('comercial') no registro de tempo (cronômetro)
-- e nos eventos de performance (Score), como as de projeto, campanha e marketing.
-- Só amplia o conjunto de valores aceitos; nenhum dado existente muda.

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('public.performance_events'::regclass, 'public.time_entries'::regclass)
      AND pg_get_constraintdef(oid) ILIKE '%task_origin%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

ALTER TABLE public.performance_events
  ADD CONSTRAINT performance_events_task_origin_check
  CHECK (task_origin IS NULL OR task_origin IN ('projeto', 'campanha', 'marketing', 'comercial'));

ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_task_origin_check
  CHECK (task_origin IN ('projeto', 'campanha', 'marketing', 'comercial'));
