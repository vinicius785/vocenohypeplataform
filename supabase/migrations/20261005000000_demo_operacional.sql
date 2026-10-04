-- Demo operacional (docs/decisions/0004-demo-operacional.md) — ETAPA 1: fundação.
--
-- ADITIVA: nada existente é removido nem renomeado. Cria as tabelas da sessão de demo,
-- as guardas de banco e a função atômica que cria/reinicia o cenário. Só a função
-- `ensure_campanha_nps_influenciador` é REDEFINIDA (mesmo comportamento + uma saída
-- antecipada para campanhas de demo).
--
-- PRÉ-REQUISITO DE SEGURANÇA: a migration 20261004000000 (RLS de dados internos) precisa
-- estar aplicada e verificada ANTES do primeiro uso real da Demo. Esta migration NÃO a
-- contorna: `demo_prerequisites()` (abaixo) reporta se ela está aplicada e o servidor
-- RECUSA criar uma demo enquanto qualquer pré-requisito estiver ausente.
--
-- ORDEM: aplicar depois de 20261004000000.
-- ROLLBACK: docs/decisions/0004-demo-operacional.md (§ Rollback da migration).

-- ============================================================
-- 1. Sessão de demo (raiz do agregado)
-- ============================================================
create table public.demo_sessions (
  id uuid primary key default gen_random_uuid(),
  -- O lead NÃO é alterado pela demo; se o lead for apagado, a demo continua (set null).
  lead_id uuid references public.leads(id) on delete set null,
  -- Sem FK para clientes: a linha é criada por `demo_apply_scenario` depois da sessão, e a
  -- campanha vive dentro de `clientes.data.campanhas[]` (mesmo padrão das tabelas campanha_*).
  cliente_id uuid not null unique,
  campanha_id uuid not null unique,
  organization_id uuid not null references public.organizations(id),
  scenario text not null default 'campanha-completa',
  seed_version integer not null default 1,
  status text not null default 'active' check (status in ('active', 'closed')),
  -- Segredo do link público. Coluna SEM privilégio de SELECT para `authenticated`
  -- (ver GRANT por coluna abaixo): o time recebe o link por função de servidor.
  token text not null unique,
  token_expires_at timestamptz not null,
  access_revoked_at timestamptz,
  closed_at timestamptz,
  last_client_access_at timestamptz,
  -- Tópico do sinal em tempo real (Etapa 5). Distinto do token: o sinal é forjável com a
  -- chave pública, então nunca expõe nem deriva do segredo do link.
  realtime_key text not null default encode(gen_random_bytes(16), 'hex'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma demo ATIVA por lead.
create unique index demo_sessions_one_active_per_lead
  on public.demo_sessions (lead_id)
  where status = 'active' and lead_id is not null;

create index demo_sessions_status_idx on public.demo_sessions (status);

-- Só o ciclo de vida. Eventos de domínio (aprovações, comentários...) continuam em
-- `Influ.activityEvents`/`Influ.activity` — nada é duplicado aqui.
create table public.demo_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.demo_sessions(id) on delete cascade,
  kind text not null check (kind in (
    'criada', 'reiniciada', 'encerrada',
    'acesso_revogado', 'acesso_renovado', 'link_gerado', 'cliente_abriu_link'
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index demo_events_session_idx on public.demo_events (session_id, created_at desc);

-- Identidade imutável + `updated_at`. Uma demo encerrada não reabre.
create or replace function public.demo_sessions_guard()
returns trigger
language plpgsql
as $$
begin
  if NEW.cliente_id is distinct from OLD.cliente_id
     or NEW.campanha_id is distinct from OLD.campanha_id
     or NEW.organization_id is distinct from OLD.organization_id
     or NEW.realtime_key is distinct from OLD.realtime_key then
    raise exception 'Os campos de identidade de uma demonstração não podem ser alterados.';
  end if;
  if OLD.status = 'closed' and NEW.status is distinct from 'closed' then
    raise exception 'Uma demonstração encerrada não pode ser reaberta.';
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;

create trigger demo_sessions_guard
  before update on public.demo_sessions
  for each row execute function public.demo_sessions_guard();

-- ============================================================
-- 2. Privilégios e RLS — escrita só pelo servidor (service_role)
-- ============================================================
alter table public.demo_sessions enable row level security;
alter table public.demo_events enable row level security;

revoke all on table public.demo_sessions from public, anon, authenticated;
revoke all on table public.demo_events from public, anon, authenticated;

-- `token` fica de fora: `select *` falha de propósito para quem não é service_role.
grant select (
  id, lead_id, cliente_id, campanha_id, organization_id, scenario, seed_version, status,
  token_expires_at, access_revoked_at, closed_at, last_client_access_at, realtime_key,
  created_by, created_at, updated_at
) on public.demo_sessions to authenticated;
grant select on public.demo_events to authenticated;
grant all on public.demo_sessions to service_role;
grant all on public.demo_events to service_role;

-- Leitura só para a equipe interna (e admins). Contas do Portal do Cliente não passam.
create policy "internal read demo_sessions" on public.demo_sessions
  for select to authenticated
  using (public.is_internal_team_member(auth.uid()) or public.is_admin(auth.uid()));

create policy "internal read demo_events" on public.demo_events
  for select to authenticated
  using (public.is_internal_team_member(auth.uid()) or public.is_admin(auth.uid()));

-- ============================================================
-- 3. Guarda do marcador de demo em `clientes.data.demoSessionId`
-- ============================================================
-- O marcador mora em `data` (o store do cliente só carrega essa coluna). Nasce junto com
-- uma sessão que aponte para este cliente e nunca muda depois — ninguém "esconde" um
-- cliente real marcando-o como demo, nem "revela" uma demo desmarcando.
create or replace function public.clientes_demo_marker_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marker text;
begin
  if TG_OP = 'UPDATE' then
    if (OLD.data->>'demoSessionId') is distinct from (NEW.data->>'demoSessionId') then
      raise exception 'O marcador de demonstração do cliente não pode ser alterado.';
    end if;
    return NEW;
  end if;

  v_marker := NEW.data->>'demoSessionId';
  if v_marker is not null then
    if not exists (
      select 1 from public.demo_sessions d
      where d.id::text = v_marker and d.cliente_id = NEW.id
    ) then
      raise exception 'Cliente de demonstração sem sessão correspondente.';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger clientes_demo_marker_guard
  before insert or update on public.clientes
  for each row execute function public.clientes_demo_marker_guard();

-- ============================================================
-- 4. NPS automático por influenciador: ignora campanhas de demo
-- ============================================================
-- Mesma função de 20261001120000, com UMA condição a mais. Sem isto, aprovar um
-- influenciador da demo criaria um token público de NPS e poluiria os indicadores.
create or replace function public.ensure_campanha_nps_influenciador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.data->>'status' = 'APROVADO'
     and not exists (select 1 from public.demo_sessions d where d.campanha_id = NEW.campanha_id) then
    insert into public.campanha_nps_influenciador (campanha_id, influenciador_id, token)
    values (NEW.campanha_id, NEW.id, encode(gen_random_bytes(16), 'hex'))
    on conflict (campanha_id, influenciador_id) do nothing;
  end if;
  return NEW;
end;
$$;

-- ============================================================
-- 5. Cria/reinicia o cenário — ATÔMICO (uma transação), só service_role
-- ============================================================
-- Isolamento por construção: toda linha escrita usa o `campanha_id`/`cliente_id`/
-- `organization_id` DA SESSÃO, nunca um valor vindo do payload. O payload só fornece ids
-- de linha e conteúdo (`data`). O mesmo `p_session_id` ⇒ mesmos ids ⇒ reiniciar =
-- apagar o que pertence à campanha da demo e recriar o cenário inicial.
create or replace function public.demo_apply_scenario(p_session_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.demo_sessions%rowtype;
  v_cliente jsonb;
  v_marker text := p_session_id::text;
  v_count integer;
begin
  select * into s from public.demo_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Sessão de demonstração não encontrada.';
  end if;
  if s.status <> 'active' then
    raise exception 'A demonstração não está ativa.';
  end if;

  v_cliente := p_payload -> 'cliente';
  if v_cliente is null or jsonb_typeof(v_cliente) <> 'object' then
    raise exception 'Cenário sem cliente.';
  end if;
  if v_cliente ->> 'id' is distinct from s.cliente_id::text
     or v_cliente ->> 'demoSessionId' is distinct from v_marker then
    raise exception 'O cliente do cenário não pertence a esta sessão.';
  end if;
  if jsonb_typeof(v_cliente -> 'campanhas') is distinct from 'array'
     or jsonb_array_length(v_cliente -> 'campanhas') <> 1
     or (v_cliente -> 'campanhas' -> 0 ->> 'id') is distinct from s.campanha_id::text then
    raise exception 'A campanha do cenário não pertence a esta sessão.';
  end if;

  -- Limpa TUDO o que pertence à campanha desta demo.
  delete from public.campanha_nps_influenciador where campanha_id = s.campanha_id;
  delete from public.campanha_influenciador_avaliacoes where campanha_id = s.campanha_id;
  delete from public.campanha_nps where campanha_id = s.campanha_id::text;
  delete from public.campaign_cycles where campanha_id = s.campanha_id;
  delete from public.campanha_influenciadores where campanha_id = s.campanha_id;
  delete from public.campanha_tarefas where campanha_id = s.campanha_id;
  delete from public.campanha_documentos where campanha_id = s.campanha_id;
  delete from public.campanha_cronograma where campanha_id = s.campanha_id;

  -- Cliente: cria, ou reescreve SOMENTE a linha que já é desta demo.
  insert into public.clientes as c (id, organization_id, data)
  values (s.cliente_id, s.organization_id, v_cliente)
  on conflict (id) do update
    set data = excluded.data
    where c.organization_id = s.organization_id and c.data ->> 'demoSessionId' = v_marker;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'Não foi possível gravar o cliente da demonstração.';
  end if;

  insert into public.campanha_influenciadores (id, campanha_id, data)
  select (e ->> 'id')::uuid, s.campanha_id, e -> 'data'
  from jsonb_array_elements(coalesce(p_payload -> 'influenciadores', '[]'::jsonb)) e;

  insert into public.campanha_tarefas (id, campanha_id, data)
  select (e ->> 'id')::uuid, s.campanha_id, e -> 'data'
  from jsonb_array_elements(coalesce(p_payload -> 'tarefas', '[]'::jsonb)) e;

  insert into public.campanha_documentos (id, campanha_id, data)
  select (e ->> 'id')::uuid, s.campanha_id, e -> 'data'
  from jsonb_array_elements(coalesce(p_payload -> 'documentos', '[]'::jsonb)) e;

  insert into public.campanha_cronograma (id, campanha_id, data)
  select (e ->> 'id')::uuid, s.campanha_id, e -> 'data'
  from jsonb_array_elements(coalesce(p_payload -> 'cronograma', '[]'::jsonb)) e;
end;
$$;

revoke all on function public.demo_apply_scenario(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.demo_apply_scenario(uuid, jsonb) to service_role;

-- ============================================================
-- 6. Pré-requisitos — o servidor RECUSA criar demo se qualquer um for falso
-- ============================================================
-- Não contorna a ausência da migration 20261004: apenas a detecta (pelo catálogo) e
-- informa. `rlsInternalOnly` exige os três sinais de que ela foi aplicada.
create or replace function public.demo_prerequisites()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'rlsInternalOnly', (
      exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'shared_state'
          and policyname = 'auth read shared' and qual ilike '%is_internal_team_member%'
      )
      and exists (
        select 1 from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'relatorios_mensais_read_authenticated'
          and qual ilike '%is_internal_team_member%'
      )
      and exists (
        select 1 from pg_indexes
        where schemaname = 'public' and indexname = 'organization_members_user_id_idx'
      )
    ),
    'npsGuard', exists (
      select 1 from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname = 'ensure_campanha_nps_influenciador'
        and pg_get_functiondef(p.oid) ilike '%demo_sessions%'
    ),
    'markerGuard', exists (
      select 1 from pg_trigger t
      where t.tgname = 'clientes_demo_marker_guard' and not t.tgisinternal
    )
  );
$$;

revoke all on function public.demo_prerequisites() from public, anon, authenticated;
grant execute on function public.demo_prerequisites() to service_role;
