-- Removido: modelo de conta Google compartilhada. Cada reunião agora
-- sincroniza pela conta pessoal de quem a criou (google_calendar_connections).
drop table if exists public.shared_calendar_connection;

alter table public.google_oauth_states
  drop constraint if exists google_oauth_states_purpose_check;
alter table public.google_oauth_states
  drop column if exists purpose;
