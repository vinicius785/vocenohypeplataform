-- Conexão Google Calendar única e compartilhada (ex.: contato@vocenohype.com.br),
-- usada como dona de TODOS os eventos de reunião, em vez de cada reunião sair
-- da conta pessoal de quem criou. Segue o padrão singleton já usado no
-- projeto (workspace_settings, vault_secret): uma linha só, `id boolean
-- primary key default true`.
create table if not exists public.shared_calendar_connection (
  id boolean primary key default true,
  google_email text,
  access_token text not null,
  refresh_token text not null,
  token_expiry timestamptz not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_calendar_connection_singleton check (id)
);
alter table public.shared_calendar_connection enable row level security;
-- Sem policies: só o service role lê/escreve, igual google_calendar_connections.

-- `google_oauth_states` precisa saber, no callback, se o fluxo era pra
-- conectar a conta PESSOAL de quem clicou (grava em google_calendar_connections)
-- ou a conta COMPARTILHADA (grava em shared_calendar_connection) — antes só
-- existia o fluxo pessoal.
alter table public.google_oauth_states
  add column if not exists purpose text not null default 'personal';
alter table public.google_oauth_states
  add constraint google_oauth_states_purpose_check
  check (purpose in ('personal', 'shared'));
