-- Torna o horário-limite do expediente (deadline efetivo) configurável
-- por Admin, em vez de fixo em 19h no código.
ALTER TABLE public.performance_settings
  ADD COLUMN deadline_cutoff_hour integer NOT NULL DEFAULT 19
  CHECK (deadline_cutoff_hour BETWEEN 0 AND 23);
