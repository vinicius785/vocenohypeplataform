-- Integração Google Calendar (OAuth por usuário, sincronização unidirecional
-- plataforma -> Google, plataforma sempre vence em conflito).

-- Estado efêmero do fluxo OAuth: guarda qual usuário iniciou o "Conectar
-- Google Calendar" enquanto o Google redireciona pra tela de consentimento e
-- volta pro nosso callback (que não recebe o bearer token da sessão, só o
-- `state` que devolvemos). Linhas somem em minutos (limpas no callback).
create table if not exists public.google_oauth_states (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.google_oauth_states enable row level security;
-- Sem policies: só o service role (que ignora RLS) lê/escreve aqui.

-- Conexão OAuth persistida por usuário: tokens de acesso ficam só acessíveis
-- via service role (nunca lidos direto pelo client), o frontend só enxerga
-- status/e-mail através de uma server function dedicada.
create table if not exists public.google_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text,
  access_token text not null,
  refresh_token text not null,
  token_expiry timestamptz not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.google_calendar_connections enable row level security;
-- Sem policies: só o service role lê/escreve; o frontend nunca faz
-- supabase.from('google_calendar_connections') direto.

create index if not exists google_oauth_states_created_at_idx
  on public.google_oauth_states (created_at);
