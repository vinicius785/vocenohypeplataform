-- Integração Instagram (API com Instagram Login): o influenciador conecta a própria conta
-- profissional por um link único e a plataforma lê perfil e insights (somente leitura).
-- Tudo aqui é acessível SÓ pelo servidor (service_role); nenhuma policy para anon/authenticated:
-- o navegador vê apenas o que as server functions devolvem (nunca o token).

-- Link de conexão enviado ao influenciador. Guarda só o HASH do token do link e do `state` do OAuth.
create table if not exists public.instagram_connect_links (
  id uuid primary key default gen_random_uuid(),
  influenciador_id uuid not null references public.banco_influenciadores(id) on delete cascade,
  token_hash text not null unique,
  oauth_state_hash text unique,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists instagram_connect_links_influ_idx
  on public.instagram_connect_links (influenciador_id);

-- Uma conexão por influenciador. O token de acesso fica CRIPTOGRAFADO (AES-256-GCM, chave derivada
-- do App Secret): nunca em claro no banco. Os hashes dos IDs do Instagram (HMAC) permitem achar e
-- apagar a conexão quando a Meta envia um pedido de exclusão de dados.
create table if not exists public.instagram_connections (
  id uuid primary key default gen_random_uuid(),
  influenciador_id uuid not null unique references public.banco_influenciadores(id) on delete cascade,
  ig_user_id text not null,
  ig_user_hash text not null,
  ig_app_user_hash text not null,
  username text,
  account_type text,
  access_token_enc text not null,
  token_expires_at timestamptz not null,
  permissions text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'expired')),
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_error text,
  snapshot jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists instagram_connections_user_hash_idx on public.instagram_connections (ig_user_hash);
create index if not exists instagram_connections_app_hash_idx on public.instagram_connections (ig_app_user_hash);
create index if not exists instagram_connections_expiry_idx on public.instagram_connections (token_expires_at);

create or replace function public.instagram_connections_set_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;
drop trigger if exists instagram_connections_updated_at on public.instagram_connections;
create trigger instagram_connections_updated_at
  before update on public.instagram_connections
  for each row execute function public.instagram_connections_set_updated_at();

alter table public.instagram_connect_links enable row level security;
alter table public.instagram_connections enable row level security;
revoke all on public.instagram_connect_links, public.instagram_connections from anon, authenticated;
grant all on public.instagram_connect_links, public.instagram_connections to service_role;
