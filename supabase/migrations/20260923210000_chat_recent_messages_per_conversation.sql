-- Chat Fase 2: corrige a causa raiz do "mensagens somem" documentada em
-- `chat-store.ts` (`reloadMessages`). O carregamento inicial buscava as
-- 5000 mensagens mais recentes de TODO o workspace, sem filtrar por
-- conversa — numa equipe ativa, algumas conversas muito movimentadas
-- (ex: um canal geral cheio) consomem esse limite inteiro, e o histórico
-- recente de conversas mais tranquilas nunca chega a ser buscado, mesmo
-- tendo poucas mensagens.
--
-- Esta função devolve as N mensagens mais recentes de CADA conversa (não
-- uma janela global), usando `row_number() over (partition by convo_id)`
-- — o mesmo índice `chat_messages_convo_created_idx (convo_id, created_at)`
-- já existente cobre isso. `security invoker` (padrão): RLS de
-- `chat_messages` continua se aplicando normalmente, então cada usuário
-- só vê as mensagens que já podia ver antes.
create or replace function public.get_recent_chat_messages(p_per_conversation integer default 50)
returns table (
  id uuid,
  convo_id text,
  author_id uuid,
  author_name text,
  author_photo text,
  text text,
  mentions jsonb,
  attachments jsonb,
  reactions jsonb,
  reply_to_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  hypito_payload jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.id, t.convo_id, t.author_id, t.author_name, t.author_photo, t.text, t.mentions,
    t.attachments, t.reactions, t.reply_to_id, t.created_at, t.edited_at, t.hypito_payload
  from (
    select
      cm.*,
      row_number() over (partition by cm.convo_id order by cm.created_at desc) as rn
    from public.chat_messages cm
  ) t
  where t.rn <= greatest(1, p_per_conversation)
$$;

revoke all on function public.get_recent_chat_messages(integer) from public;
revoke all on function public.get_recent_chat_messages(integer) from anon;
grant execute on function public.get_recent_chat_messages(integer) to authenticated;
