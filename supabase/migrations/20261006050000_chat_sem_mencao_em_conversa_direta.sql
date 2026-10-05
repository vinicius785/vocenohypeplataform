-- Conversa direta (convo_id 'dm:a|b') NÃO tem menção de pessoa. A interface e o envio já não geram
-- mais (src/lib/chat-mentions.ts); esta migration garante a regra também no banco, para qualquer
-- cliente/versão que grave direto em chat_messages, e limpa o que já existe.
--
-- Só remove menções do tipo 'user'. Referências a tarefa/projeto/campanha/cliente (kind task,
-- project, campaign, client) continuam: referenciar não é mencionar ninguém.

create or replace function public.chat_messages_strip_dm_user_mentions()
returns trigger
language plpgsql
as $$
begin
  if new.convo_id like 'dm:%' and jsonb_typeof(new.mentions) = 'array' then
    new.mentions := coalesce(
      (select jsonb_agg(e)
         from jsonb_array_elements(new.mentions) e
        where e->>'kind' is distinct from 'user'),
      '[]'::jsonb
    );
  end if;
  return new;
end;
$$;

drop trigger if exists chat_messages_strip_dm_user_mentions on public.chat_messages;
create trigger chat_messages_strip_dm_user_mentions
  before insert or update of mentions, convo_id on public.chat_messages
  for each row execute function public.chat_messages_strip_dm_user_mentions();

-- Limpeza do histórico: menções de pessoa já gravadas em DMs (viravam "menção" no sino).
update public.chat_messages
   set mentions = coalesce(
         (select jsonb_agg(e) from jsonb_array_elements(mentions) e
           where e->>'kind' is distinct from 'user'),
         '[]'::jsonb)
 where convo_id like 'dm:%'
   and jsonb_typeof(mentions) = 'array'
   and exists (select 1 from jsonb_array_elements(mentions) e where e->>'kind' = 'user');
