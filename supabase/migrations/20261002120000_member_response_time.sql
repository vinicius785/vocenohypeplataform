-- Tempo de resposta do membro (Time V2 → perfil central → Comunicação).
--
-- PRIVACIDADE (regra obrigatória do pedido): esta função lê `chat_messages`
-- como SECURITY DEFINER (RLS não deixa nem admin ler DM alheia) e devolve
-- SOMENTE agregados — nunca texto, remetente, destinatário, convo_id, id de
-- mensagem ou qualquer lista. A UI nunca recebe linhas de mensagem.
--
-- DEFINIÇÕES (documentadas porque o pedido proíbe regra silenciosa):
--  * Demanda DIRETA: em `dm:<uidA>|<uidB>`, um bloco de mensagens
--    consecutivas da outra pessoa (sem mensagem do membro no meio) é UMA
--    demanda. Começa na PRIMEIRA mensagem do bloco; é respondida pela
--    primeira mensagem do membro depois do bloco.
--  * Demanda por MENÇÃO: mensagem em canal/campanha/projeto (nunca DM — DM
--    já é coberta acima, evita contagem dupla) cujo `mentions` contém
--    {"kind":"user","id":<membro>}. Respondida pela primeira mensagem do
--    membro no MESMO convo_id depois da menção. Menções consecutivas que
--    compartilham a mesma resposta (ou todas sem resposta no convo) viram
--    UMA demanda. Cada pessoa mencionada tem a sua própria demanda (a
--    função é chamada por membro).
--  * Mensagens do sistema (author_id nulo) e cards do bot Hypito
--    (hypito_payload) nunca iniciam demanda. Mensagem editada usa
--    created_at (edited_at ignorado); apagada some (hard delete) e não conta.
--  * Demanda ainda aberta NÃO entra na média/mediana; só em "sem resposta".
--  * Menção em canal privado do qual o membro não participa é ignorada
--    (ele não teria como responder).
--  * TEMPO CORRIDO: a plataforma não tem horário de trabalho configurado
--    (nenhuma coluna/tabela de expediente), então não se descontam
--    noites/fins de semana. Limitação conhecida e exibida na UI.
--  * Demandas que COMEÇAM em [p_from, p_to). A resposta pode cair depois de
--    p_to. Olha 14 dias antes de p_from só para reconstruir o início de
--    blocos que atravessam a borda da janela.
--
-- AUTORIZAÇÃO: membro interno ativo E (o próprio membro OU permissão 'time'
-- — has_permission já inclui admin). Cliente do portal nunca passa.

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at);
create index if not exists chat_messages_mentions_gin_idx
  on public.chat_messages using gin (mentions jsonb_path_ops);

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
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not (
    public.is_internal_team_member(auth.uid())
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
  )
  select
    (count(*) filter (where kind = 'direct' and responded_at is not null))::integer,
    (count(*) filter (where kind = 'direct' and responded_at is null))::integer,
    avg(secs) filter (where kind = 'direct' and responded_at is not null),
    percentile_cont(0.5) within group (order by secs)
      filter (where kind = 'direct' and responded_at is not null),
    (count(*) filter (where kind = 'mention' and responded_at is not null))::integer,
    (count(*) filter (where kind = 'mention' and responded_at is null))::integer,
    avg(secs) filter (where kind = 'mention' and responded_at is not null),
    percentile_cont(0.5) within group (order by secs)
      filter (where kind = 'mention' and responded_at is not null),
    avg(secs) filter (where responded_at is not null),
    percentile_cont(0.5) within group (order by secs)
      filter (where responded_at is not null)
  from timed;
end;
$$;

revoke all on function public.get_member_response_time(uuid, timestamptz, timestamptz) from public;
revoke all on function public.get_member_response_time(uuid, timestamptz, timestamptz) from anon;
grant execute on function public.get_member_response_time(uuid, timestamptz, timestamptz) to authenticated;
