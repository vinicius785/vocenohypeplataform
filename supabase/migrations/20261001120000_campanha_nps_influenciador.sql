-- NPS por INFLUENCIADOR aprovado numa campanha — expande o NPS existente
-- (até aqui só do cliente, `campanha_nps`) para um segundo público, sem
-- alterar `campanha_nps` em nada.
--
-- Diferente do NPS do cliente (gate mensal, chave `(campanha_id,
-- reference_month)`, respondido dentro do Portal autenticado): aqui a
-- chave é `(campanha_id, influenciador_id)` — UMA resposta por
-- influenciador por campanha, para sempre, respondida por um link público
-- individual (token), sem login e sem gate de navegação nenhum. Por isso é
-- uma tabela IRMÃ nova, não uma extensão de `campanha_nps` (reaproveitar
-- aquela tabela quebraria a premissa "1 resposta = 1 mês inteiro da
-- campanha").
--
-- A linha é criada pela trigger abaixo no momento em que o influenciador
-- fica `APROVADO` — nunca por ação manual (pedido explícito) — com
-- `score`/`answered_at` nulos até a resposta chegar; é isso que torna
-- "ainda não respondeu" um estado consultável sem precisar de uma tabela
-- de "convites" separada. `ON CONFLICT DO NOTHING` garante que uma
-- mudança de status posterior nunca recria/reresetar um token já emitido
-- nem apaga uma resposta já dada (exigência do pedido).

create table public.campanha_nps_influenciador (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null,
  influenciador_id uuid not null references public.campanha_influenciadores(id) on delete cascade,
  token text not null unique,
  score smallint check (score >= 0 and score <= 10),
  comment text,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campanha_id, influenciador_id)
);

create index campanha_nps_influenciador_campanha_id_idx
  on public.campanha_nps_influenciador (campanha_id);
create index campanha_nps_influenciador_token_idx
  on public.campanha_nps_influenciador (token);

create or replace function public.campanha_nps_influenciador_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

create trigger campanha_nps_influenciador_updated_at
  before update on public.campanha_nps_influenciador
  for each row execute function public.campanha_nps_influenciador_set_updated_at();

alter table public.campanha_nps_influenciador enable row level security;

-- Mesma regra de leitura interna de `campanha_nps`: time interno com
-- permissão campanhas/clientes, ou admin. Toda escrita (criação do token
-- na aprovação, resposta pública) passa por `supabaseAdmin` a partir de
-- server functions com suas próprias checagens — nenhuma policy de
-- escrita pra `authenticated` além de admin, por segurança (mesmo padrão
-- de `campanha_nps`).
create policy "clientes/campanhas read campanha_nps_influenciador"
  on public.campanha_nps_influenciador for select
  to authenticated
  using (
    public.has_permission(auth.uid(), 'clientes')
    or public.has_permission(auth.uid(), 'campanhas')
    or public.is_admin(auth.uid())
  );

create policy "admin write campanha_nps_influenciador"
  on public.campanha_nps_influenciador for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

create policy "admin update campanha_nps_influenciador"
  on public.campanha_nps_influenciador for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "admin delete campanha_nps_influenciador"
  on public.campanha_nps_influenciador for delete
  to authenticated
  using (public.is_admin(auth.uid()));

-- Geração automática do token: dispara em qualquer INSERT/UPDATE de
-- `campanha_influenciadores` cujo `data->>'status'` seja 'APROVADO'. Cobre
-- tanto a aprovação feita pelo cliente via link público
-- (`respondCampanhaInflu`, `cliente-link.functions.ts`) quanto qualquer
-- outro caminho interno que grave esse status, sem duplicar a decisão em
-- código de aplicação.
create or replace function public.ensure_campanha_nps_influenciador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.data->>'status' = 'APROVADO' then
    insert into public.campanha_nps_influenciador (campanha_id, influenciador_id, token)
    values (NEW.campanha_id, NEW.id, encode(gen_random_bytes(16), 'hex'))
    on conflict (campanha_id, influenciador_id) do nothing;
  end if;
  return NEW;
end;
$$;

create trigger campanha_influenciadores_ensure_nps
  after insert or update on public.campanha_influenciadores
  for each row execute function public.ensure_campanha_nps_influenciador();
