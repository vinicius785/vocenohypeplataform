-- Demo operacional — correção de `demo_apply_scenario` (achada ao testar contra o banco real).
--
-- ERRO: "operator does not exist: uuid = text". `campanha_nps.campanha_id` está como `uuid` no
-- banco vivo (a migration 20260930205328 o declarava `text`). A limpeza do reinício comparava
-- `uuid = text`. Agora compara por texto — vale para os dois tipos.
--
-- Só redefine a função (CREATE OR REPLACE); nada mais muda. Os GRANT/REVOKE permanecem, mas são
-- repetidos abaixo por segurança.
-- ORDEM: depois de 20261005000000.

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
  -- Comparação por texto: no banco vivo a coluna é uuid, na migration original era text.
  delete from public.campanha_nps where campanha_id::text = s.campanha_id::text;
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
