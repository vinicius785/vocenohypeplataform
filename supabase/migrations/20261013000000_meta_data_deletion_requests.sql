-- Callback de exclusão de dados da Meta (Data Deletion Request Callback).
-- Cada pedido recebido (signed_request válido) vira uma linha com um código de confirmação
-- imprevisível (128 bits) que a Meta devolve ao usuário e que a página pública de consulta usa.
-- Não guardamos o ID da Meta em claro: só um HMAC dele (não reversível sem o App Secret) +
-- `issued_at` do pedido, que torna reentregas do MESMO pedido idempotentes.
-- Acesso só pelo servidor (service_role); nenhuma policy para anon/authenticated.

create table if not exists public.meta_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  confirmation_code text not null unique,
  meta_user_hash text not null,
  issued_at bigint not null,
  status text not null default 'received'
    check (status in ('received', 'processing', 'completed', 'failed')),
  -- contagens por armazenamento afetado (sem dados pessoais), preenchidas ao concluir
  summary jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (meta_user_hash, issued_at)
);

create index if not exists meta_deletion_requests_status_idx
  on public.meta_deletion_requests (status)
  where status in ('received', 'processing', 'failed');

create or replace function public.meta_deletion_requests_set_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists meta_deletion_requests_updated_at on public.meta_deletion_requests;
create trigger meta_deletion_requests_updated_at
  before update on public.meta_deletion_requests
  for each row execute function public.meta_deletion_requests_set_updated_at();

alter table public.meta_deletion_requests enable row level security;

revoke all on public.meta_deletion_requests from anon, authenticated;
grant all on public.meta_deletion_requests to service_role;
