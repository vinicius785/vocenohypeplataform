-- Chat V2: busca real no backend (RPC `search_chat_messages`).
--
-- Reaproduz EXATAMENTE a expressão de visibilidade da policy
-- "authenticated read messages" de `chat_messages`
-- (20260928120000_separate_internal_from_client_users.sql), pra que a busca
-- nunca retorne mensagem que o usuário não poderia ler na timeline.
create or replace function public.search_chat_messages(p_query text, p_limit int default 30)
returns table (
  id uuid,
  convo_id text,
  author_name text,
  author_photo text,
  text text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cm.id,
    cm.convo_id,
    cm.author_name,
    cm.author_photo,
    cm.text,
    cm.created_at
  from public.chat_messages cm
  where
    coalesce(p_query, '') <> ''
    and cm.text ilike '%' || p_query || '%'
    and (
      (cm.convo_id like 'dm:%' and position(auth.uid()::text in cm.convo_id) > 0)
      or (
        cm.convo_id not like 'dm:%'
        and public.is_internal_team_member(auth.uid())
        and (
          not exists (select 1 from public.chat_channels cc where cc.id::text = cm.convo_id)
          or exists (
            select 1 from public.chat_channels cc
            where cc.id::text = cm.convo_id
              and (cc.is_private = false or auth.uid() = any (cc.allowed_member_ids) or is_admin(auth.uid()))
          )
        )
      )
    )
  order by cm.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

revoke all on function public.search_chat_messages(text, int) from public;
revoke all on function public.search_chat_messages(text, int) from anon;
grant execute on function public.search_chat_messages(text, int) to authenticated;
