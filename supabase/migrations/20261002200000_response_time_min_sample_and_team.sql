-- Tempo de resposta — endurecimento de privacidade/escopo + agregado do time.
--
-- 1) AMOSTRA MÍNIMA (privacidade): com 1 ou 2 demandas respondidas, a
--    "média" é praticamente o tempo de UMA conversa específica — quem
--    participou dela conseguiria isolar o comportamento do membro naquela
--    troca. A partir de agora média/mediana de cada recorte (diretas,
--    menções, todas) só saem do banco com >= 3 demandas respondidas; abaixo
--    disso voltam NULL ("Sem dados suficientes" na UI). As contagens
--    continuam (servem só pra decidir confiabilidade da amostra; a UI não
--    as exibe como número de mensagens).
-- 2) ESCOPO POR ORGANIZAÇÃO: além de "membro interno", quem consulta e o
--    membro consultado precisam compartilhar uma organização interna ativa
--    (`shares_internal_organization`) — manipular `p_user_id` nunca alcança
--    alguém de outra organização.
-- 3) `get_team_response_time`: uma chamada pra lista do Time, REUTILIZANDO
--    `get_member_response_time` por membro (mesma regra, mesmo cálculo,
--    nenhuma lógica duplicada). Sem permissão `time`, devolve só a própria
--    linha. Só agregados: membro, nº de demandas respondidas, média.
--
-- Definições do cálculo inalteradas — ver cabeçalho de
-- 20261002120000_member_response_time.sql.

create or replace function public.shares_internal_organization(_a uuid, _b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members ma
    join public.organization_members mb on mb.organization_id = ma.organization_id
    join public.organizations o on o.id = ma.organization_id
    where ma.user_id = _a
      and mb.user_id = _b
      and ma.status = 'active'
      and mb.status = 'active'
      and o.status = 'active'
      and o.type = 'internal'
  );
$$;
revoke all on function public.shares_internal_organization(uuid, uuid) from public;
revoke all on function public.shares_internal_organization(uuid, uuid) from anon;
grant execute on function public.shares_internal_organization(uuid, uuid) to authenticated;

create or replace function public.get_member_response_time(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  direct_answered integer,
  direct_unanswered integer,
  direct_avg_seconds double precision,
  direct_median_seconds double precision,
  mention_answered integer,
  mention_unanswered integer,
  mention_avg_seconds double precision,
  mention_median_seconds double precision,
  all_avg_seconds double precision,
  all_median_seconds double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_min constant integer := 3;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not (
    public.is_internal_team_member(auth.uid())
    and public.shares_internal_organization(auth.uid(), p_user_id)
    and (auth.uid() = p_user_id or public.has_permission(auth.uid(), 'time'))
  ) then
    raise exception 'forbidden';
  end if;
  if p_from is null or p_to is null or p_to <= p_from
     or p_to - p_from > interval '366 days' then
    raise exception 'invalid period';
  end if;

  return query
  with dm_msgs as (
    select m.id, m.convo_id, m.author_id, m.created_at
    from public.chat_messages m
    where m.convo_id like 'dm:%'
      and position(p_user_id::text in m.convo_id) > 0
      and m.author_id is not null
      and m.hypito_payload is null
      and m.created_at >= p_from - interval '14 days'
  ),
  dm_marked as (
    select d.*,
      case when d.author_id is distinct from
        lag(d.author_id) over (partition by d.convo_id order by d.created_at, d.id)
        then 1 else 0 end as new_grp
    from dm_msgs d
  ),
  dm_grp as (
    select d.*,
      sum(d.new_grp) over (partition by d.convo_id order by d.created_at, d.id) as grp
    from dm_marked d
  ),
  dm_groups as (
    select convo_id, grp, author_id, min(created_at) as started_at
    from dm_grp
    group by convo_id, grp, author_id
  ),
  dm_demands as (
    select 'direct'::text as kind, g.started_at,
      (select n.started_at from dm_groups n
        where n.convo_id = g.convo_id and n.grp = g.grp + 1
          and n.author_id = p_user_id) as responded_at
    from dm_groups g
    where g.author_id <> p_user_id
      and g.started_at >= p_from and g.started_at < p_to
  ),
  men_msgs as (
    select m.convo_id, m.created_at
    from public.chat_messages m
    where m.convo_id not like 'dm:%'
      and m.author_id is not null
      and m.author_id <> p_user_id
      and m.hypito_payload is null
      and m.created_at >= p_from and m.created_at < p_to
      and m.mentions @> jsonb_build_array(
        jsonb_build_object('kind', 'user', 'id', p_user_id::text))
      and not exists (
        select 1 from public.chat_channels cc
        where cc.id::text = m.convo_id
          and cc.is_private
          and not (p_user_id = any(cc.allowed_member_ids)))
  ),
  men_resp as (
    select mm.convo_id, mm.created_at,
      (select min(r.created_at) from public.chat_messages r
        where r.convo_id = mm.convo_id
          and r.author_id = p_user_id
          and r.created_at > mm.created_at) as responded_at
    from men_msgs mm
  ),
  men_demands as (
    select 'mention'::text as kind, min(created_at) as started_at, responded_at
    from men_resp
    group by convo_id, responded_at
  ),
  demands as (
    select kind, started_at, responded_at from dm_demands
    union all
    select kind, started_at, responded_at from men_demands
  ),
  timed as (
    select kind, responded_at,
      extract(epoch from (responded_at - started_at))::double precision as secs
    from demands
  ),
  agg as (
    select
      (count(*) filter (where t.kind = 'direct' and t.responded_at is not null))::integer as d_ans,
      (count(*) filter (where t.kind = 'direct' and t.responded_at is null))::integer as d_open,
      avg(t.secs) filter (where t.kind = 'direct' and t.responded_at is not null) as d_avg,
      percentile_cont(0.5) within group (order by t.secs)
        filter (where t.kind = 'direct' and t.responded_at is not null) as d_med,
      (count(*) filter (where t.kind = 'mention' and t.responded_at is not null))::integer as m_ans,
      (count(*) filter (where t.kind = 'mention' and t.responded_at is null))::integer as m_open,
      avg(t.secs) filter (where t.kind = 'mention' and t.responded_at is not null) as m_avg,
      percentile_cont(0.5) within group (order by t.secs)
        filter (where t.kind = 'mention' and t.responded_at is not null) as m_med,
      avg(t.secs) filter (where t.responded_at is not null) as a_avg,
      percentile_cont(0.5) within group (order by t.secs)
        filter (where t.responded_at is not null) as a_med
    from timed t
  )
  select
    a.d_ans,
    a.d_open,
    case when a.d_ans >= v_min then a.d_avg end,
    case when a.d_ans >= v_min then a.d_med end,
    a.m_ans,
    a.m_open,
    case when a.m_ans >= v_min then a.m_avg end,
    case when a.m_ans >= v_min then a.m_med end,
    case when a.d_ans + a.m_ans >= v_min then a.a_avg end,
    case when a.d_ans + a.m_ans >= v_min then a.a_med end
  from agg a;
end;
$$;

revoke all on function public.get_member_response_time(uuid, timestamptz, timestamptz) from public;
revoke all on function public.get_member_response_time(uuid, timestamptz, timestamptz) from anon;
grant execute on function public.get_member_response_time(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.get_team_response_time(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  member_id uuid,
  answered_count integer,
  average_seconds double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_internal_team_member(auth.uid()) then
    raise exception 'forbidden';
  end if;

  return query
  select
    m.uid,
    (r.direct_answered + r.mention_answered)::integer,
    r.all_avg_seconds
  from (
    select distinct mb.user_id as uid
    from public.organization_members ma
    join public.organization_members mb on mb.organization_id = ma.organization_id
    join public.organizations o on o.id = ma.organization_id
    where ma.user_id = auth.uid()
      and ma.status = 'active'
      and mb.status = 'active'
      and o.status = 'active'
      and o.type = 'internal'
      and (mb.user_id = auth.uid() or public.has_permission(auth.uid(), 'time'))
  ) m
  cross join lateral public.get_member_response_time(m.uid, p_from, p_to) r;
end;
$$;

revoke all on function public.get_team_response_time(timestamptz, timestamptz) from public;
revoke all on function public.get_team_response_time(timestamptz, timestamptz) from anon;
grant execute on function public.get_team_response_time(timestamptz, timestamptz) to authenticated;
