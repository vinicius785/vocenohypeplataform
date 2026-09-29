-- Fase 1 do Chat V2 (fundação): modelo relacional de conversa pra DM/grupo
-- (hoje só existe convo_id textual sem tabela própria — canais e canais
-- sintéticos de campanha/projeto continuam como estão, já têm dono:
-- chat_channels e a relação real de campanha/projeto), reações e anexos
-- como tabelas próprias (permite unique constraint de 1 reação por
-- usuário+emoji, "quem reagiu", e é o que habilita notificação real por
-- reação/anexo nas próximas fases), e correção da policy de Storage do
-- bucket chat-attachments (hoje `authenticated` genérico, sem exigir
-- is_internal_team_member — mesmo gap fechado nas tabelas pela migration
-- 20260928120000, só que ali o Storage ficou de fora).
--
-- Compatibilidade: os campos jsonb `chat_messages.reactions`/`attachments`
-- NÃO são removidos nem deixam de ser escritos pelas rotas atuais
-- (uploadChatAttachment/toggle_message_reaction) — um trigger espelha toda
-- escrita nas tabelas novas, então o dado antigo (V1 em produção) migra
-- sozinho e nada quebra enquanto o código-fonte ainda não foi migrado pra
-- ler das tabelas novas (isso é trabalho de app, fora desta migration).

-- ============================================================
-- chat_conversations / chat_conversation_members — só pra direct/group.
-- Canal usa chat_channels; campanha/projeto usam a relação já existente
-- (campanha_influenciadores/projetos) — não duplicar aqui.
-- ============================================================
create table if not exists public.chat_conversations (
  id text primary key,
  type text not null check (type in ('direct', 'group')),
  name text,
  photo text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_conversation_members (
  conversation_id text not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists chat_conversation_members_user_idx
  on public.chat_conversation_members (user_id);

grant select, insert, update, delete on public.chat_conversations to authenticated;
grant select, insert, delete on public.chat_conversation_members to authenticated;
grant all on public.chat_conversations to service_role;
grant all on public.chat_conversation_members to service_role;

alter table public.chat_conversations enable row level security;
alter table public.chat_conversation_members enable row level security;

create policy "members read own conversations" on public.chat_conversations
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_conversation_members m
      where m.conversation_id = chat_conversations.id and m.user_id = auth.uid()
    )
  );

create policy "internal members create conversations" on public.chat_conversations
  for insert to authenticated
  with check (public.is_internal_team_member(auth.uid()));

create policy "members update own group conversations" on public.chat_conversations
  for update to authenticated
  using (
    type = 'group'
    and exists (
      select 1 from public.chat_conversation_members m
      where m.conversation_id = chat_conversations.id and m.user_id = auth.uid()
    )
  );

create policy "members read own membership rows" on public.chat_conversation_members
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_conversation_members m2
      where m2.conversation_id = chat_conversation_members.conversation_id
        and m2.user_id = auth.uid()
    )
  );

create policy "internal members manage own conversation membership" on public.chat_conversation_members
  for insert to authenticated
  with check (
    public.is_internal_team_member(auth.uid())
    and public.is_internal_team_member(user_id)
    and exists (
      select 1 from public.chat_conversations c where c.id = conversation_id
    )
    and (
      -- criador da conversa pode inserir os membros iniciais (incluindo a
      -- si mesmo); depois disso, só quem já é membro adiciona alguém novo.
      exists (
        select 1 from public.chat_conversations c
        where c.id = conversation_id and c.created_by = auth.uid()
      )
      or exists (
        select 1 from public.chat_conversation_members m
        where m.conversation_id = chat_conversation_members.conversation_id
          and m.user_id = auth.uid()
      )
    )
  );

create policy "members remove own membership" on public.chat_conversation_members
  for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- Reações e anexos como tabelas próprias
-- ============================================================
create table if not exists public.chat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists chat_message_reactions_message_idx
  on public.chat_message_reactions (message_id);

create table if not exists public.chat_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  name text not null,
  mime_type text not null,
  size_bytes bigint,
  storage_path text not null,
  kind text not null default 'other' check (kind in ('image', 'video', 'audio', 'pdf', 'document', 'other')),
  duration_seconds numeric,
  created_at timestamptz not null default now()
);
create index if not exists chat_message_attachments_message_idx
  on public.chat_message_attachments (message_id);

grant select, insert, delete on public.chat_message_reactions to authenticated;
grant select, insert, update, delete on public.chat_message_attachments to authenticated;
grant all on public.chat_message_reactions to service_role;
grant all on public.chat_message_attachments to service_role;

alter table public.chat_message_reactions enable row level security;
alter table public.chat_message_attachments enable row level security;

-- Acesso segue exatamente a mesma regra de leitura já aplicada a
-- chat_messages (20260928120000): DM só pro par, canal/campanha/projeto só
-- pra quem é do time e tem acesso ao canal.
create policy "read reactions of visible messages" on public.chat_message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_messages msg
      where msg.id = chat_message_reactions.message_id
        and (
          (msg.convo_id like 'dm:%' and position(auth.uid()::text in msg.convo_id) > 0)
          or (
            msg.convo_id not like 'dm:%'
            and public.is_internal_team_member(auth.uid())
            and (
              not exists (select 1 from public.chat_channels cc where cc.id::text = msg.convo_id)
              or exists (
                select 1 from public.chat_channels cc
                where cc.id::text = msg.convo_id
                  and (cc.is_private = false or auth.uid() = any (cc.allowed_member_ids) or public.is_admin(auth.uid()))
              )
            )
          )
        )
    )
  );

create policy "react to visible messages" on public.chat_message_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.chat_messages msg where msg.id = message_id)
  );

create policy "remove own reaction" on public.chat_message_reactions
  for delete to authenticated
  using (user_id = auth.uid());

create policy "read attachments of visible messages" on public.chat_message_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_messages msg
      where msg.id = chat_message_attachments.message_id
        and (
          (msg.convo_id like 'dm:%' and position(auth.uid()::text in msg.convo_id) > 0)
          or (
            msg.convo_id not like 'dm:%'
            and public.is_internal_team_member(auth.uid())
            and (
              not exists (select 1 from public.chat_channels cc where cc.id::text = msg.convo_id)
              or exists (
                select 1 from public.chat_channels cc
                where cc.id::text = msg.convo_id
                  and (cc.is_private = false or auth.uid() = any (cc.allowed_member_ids) or public.is_admin(auth.uid()))
              )
            )
          )
        )
    )
  );

create policy "attach to own messages" on public.chat_message_attachments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.chat_messages msg
      where msg.id = message_id and (msg.author_id = auth.uid() or msg.author_id is null)
    )
  );

create policy "remove attachment of own message" on public.chat_message_attachments
  for delete to authenticated
  using (
    exists (
      select 1 from public.chat_messages msg
      where msg.id = chat_message_attachments.message_id and msg.author_id = auth.uid()
    )
  );

-- ============================================================
-- Backfill — dados existentes migram sozinhos, nada é apagado.
-- ============================================================

-- Conversas diretas: toda mensagem com convo_id 'dm:<a>|<b>' vira uma
-- linha em chat_conversations + 2 em chat_conversation_members.
insert into public.chat_conversations (id, type, created_at)
select distinct m.convo_id, 'direct', now()
from public.chat_messages m
where m.convo_id like 'dm:%'
on conflict (id) do nothing;

insert into public.chat_conversation_members (conversation_id, user_id)
select c.id, u.user_id
from public.chat_conversations c
cross join lateral (
  select unnest(string_to_array(split_part(c.id, ':', 2), '|'))::uuid as user_id
) u
where c.type = 'direct'
on conflict do nothing;

-- Reações: chat_messages.reactions é { "emoji": ["user-id", ...] }.
insert into public.chat_message_reactions (message_id, user_id, emoji, created_at)
select m.id, (uid_text)::uuid, r.key, m.created_at
from public.chat_messages m
cross join lateral jsonb_each(m.reactions) as r(key, value)
cross join lateral jsonb_array_elements_text(r.value) as uid_text
where m.reactions is not null and m.reactions <> '{}'::jsonb
on conflict do nothing;

-- Anexos: chat_messages.attachments é um array de objetos já usado hoje
-- por uploadChatAttachment (path/name/mimeType/sizeBytes/...).
insert into public.chat_message_attachments
  (message_id, name, mime_type, size_bytes, storage_path, kind, duration_seconds, created_at)
select
  m.id,
  coalesce(a->>'name', 'arquivo'),
  coalesce(a->>'mimeType', a->>'mime_type', 'application/octet-stream'),
  nullif(coalesce(a->>'sizeBytes', a->>'size_bytes'), '')::bigint,
  coalesce(a->>'path', a->>'storagePath', a->>'storage_path'),
  case
    when coalesce(a->>'mimeType', a->>'mime_type', '') like 'image/%' then 'image'
    when coalesce(a->>'mimeType', a->>'mime_type', '') like 'video/%' then 'video'
    when coalesce(a->>'mimeType', a->>'mime_type', '') like 'audio/%' then 'audio'
    when coalesce(a->>'mimeType', a->>'mime_type', '') = 'application/pdf' then 'pdf'
    else 'document'
  end,
  nullif(coalesce(a->>'durationSeconds', a->>'duration_seconds'), '')::numeric,
  m.created_at
from public.chat_messages m
cross join lateral jsonb_array_elements(m.attachments) as a
where m.attachments is not null
  and jsonb_typeof(m.attachments) = 'array'
  and coalesce(a->>'path', a->>'storagePath', a->>'storage_path') is not null
on conflict do nothing;

-- ============================================================
-- Triggers de espelhamento — enquanto o app ainda escreve nos jsonb
-- (RPC toggle_message_reaction, uploadChatAttachment), replica pras
-- tabelas novas automaticamente. Fase 2 troca o app pra ler/escrever
-- direto nas tabelas e este trigger pode ser removido então.
-- ============================================================
create or replace function public.sync_chat_message_jsonb_to_tables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reactions is distinct from old.reactions then
    delete from public.chat_message_reactions where message_id = new.id;
    insert into public.chat_message_reactions (message_id, user_id, emoji, created_at)
    select new.id, (uid_text)::uuid, r.key, now()
    from jsonb_each(coalesce(new.reactions, '{}'::jsonb)) as r(key, value)
    cross join lateral jsonb_array_elements_text(r.value) as uid_text
    on conflict do nothing;
  end if;

  if new.attachments is distinct from old.attachments then
    delete from public.chat_message_attachments where message_id = new.id;
    insert into public.chat_message_attachments
      (message_id, name, mime_type, size_bytes, storage_path, kind, duration_seconds, created_at)
    select
      new.id,
      coalesce(a->>'name', 'arquivo'),
      coalesce(a->>'mimeType', a->>'mime_type', 'application/octet-stream'),
      nullif(coalesce(a->>'sizeBytes', a->>'size_bytes'), '')::bigint,
      coalesce(a->>'path', a->>'storagePath', a->>'storage_path'),
      case
        when coalesce(a->>'mimeType', a->>'mime_type', '') like 'image/%' then 'image'
        when coalesce(a->>'mimeType', a->>'mime_type', '') like 'video/%' then 'video'
        when coalesce(a->>'mimeType', a->>'mime_type', '') like 'audio/%' then 'audio'
        when coalesce(a->>'mimeType', a->>'mime_type', '') = 'application/pdf' then 'pdf'
        else 'document'
      end,
      nullif(coalesce(a->>'durationSeconds', a->>'duration_seconds'), '')::numeric,
      now()
    from jsonb_array_elements(coalesce(new.attachments, '[]'::jsonb)) as a
    where coalesce(a->>'path', a->>'storagePath', a->>'storage_path') is not null
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- (insert usa NEW.* sem comparação com OLD, que não existe em INSERT —
-- trigger de insert próprio, mais simples)
create or replace function public.sync_chat_message_jsonb_to_tables_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_message_reactions (message_id, user_id, emoji, created_at)
  select new.id, (uid_text)::uuid, r.key, now()
  from jsonb_each(coalesce(new.reactions, '{}'::jsonb)) as r(key, value)
  cross join lateral jsonb_array_elements_text(r.value) as uid_text
  on conflict do nothing;

  insert into public.chat_message_attachments
    (message_id, name, mime_type, size_bytes, storage_path, kind, duration_seconds, created_at)
  select
    new.id,
    coalesce(a->>'name', 'arquivo'),
    coalesce(a->>'mimeType', a->>'mime_type', 'application/octet-stream'),
    nullif(coalesce(a->>'sizeBytes', a->>'size_bytes'), '')::bigint,
    coalesce(a->>'path', a->>'storagePath', a->>'storage_path'),
    case
      when coalesce(a->>'mimeType', a->>'mime_type', '') like 'image/%' then 'image'
      when coalesce(a->>'mimeType', a->>'mime_type', '') like 'video/%' then 'video'
      when coalesce(a->>'mimeType', a->>'mime_type', '') like 'audio/%' then 'audio'
      when coalesce(a->>'mimeType', a->>'mime_type', '') = 'application/pdf' then 'pdf'
      else 'document'
    end,
    nullif(coalesce(a->>'durationSeconds', a->>'duration_seconds'), '')::numeric,
    now()
  from jsonb_array_elements(coalesce(new.attachments, '[]'::jsonb)) as a
  where coalesce(a->>'path', a->>'storagePath', a->>'storage_path') is not null
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists chat_messages_sync_jsonb on public.chat_messages;
create trigger chat_messages_sync_jsonb
  after update on public.chat_messages
  for each row execute function public.sync_chat_message_jsonb_to_tables();

drop trigger if exists chat_messages_sync_jsonb_insert on public.chat_messages;
create trigger chat_messages_sync_jsonb_insert
  after insert on public.chat_messages
  for each row execute function public.sync_chat_message_jsonb_to_tables_insert();

-- ============================================================
-- Realtime pras tabelas novas
-- ============================================================
alter publication supabase_realtime add table public.chat_conversations;
alter publication supabase_realtime add table public.chat_conversation_members;
alter publication supabase_realtime add table public.chat_message_reactions;
alter publication supabase_realtime add table public.chat_message_attachments;

-- ============================================================
-- Storage: bucket chat-attachments tinha policy `authenticated` genérica
-- (sem exigir is_internal_team_member) — mesmo gap fechado nas tabelas
-- pela migration 20260928120000, aqui fica corrigido no Storage também.
-- ============================================================
drop policy if exists "chat_attachments_read_authenticated" on storage.objects;
create policy "chat_attachments_read_authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-attachments' and public.is_internal_team_member(auth.uid()));

drop policy if exists "chat_attachments_insert_authenticated" on storage.objects;
create policy "chat_attachments_insert_authenticated" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and public.is_internal_team_member(auth.uid())
    and owner = auth.uid()
  );

drop policy if exists "chat_attachments_delete_own" on storage.objects;
create policy "chat_attachments_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-attachments' and owner = auth.uid());
