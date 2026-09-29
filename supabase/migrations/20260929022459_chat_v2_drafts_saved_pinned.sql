-- Chat V2: rascunhos, mensagens salvas e mensagens fixadas.

create table if not exists public.chat_drafts (
  user_id uuid not null,
  convo_id text not null,
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, convo_id)
);

grant select, insert, update, delete on public.chat_drafts to authenticated;
grant all on public.chat_drafts to service_role;

alter table public.chat_drafts enable row level security;

create policy "owner reads own drafts" on public.chat_drafts
  for select to authenticated
  using (user_id = auth.uid());

create policy "owner writes own drafts" on public.chat_drafts
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "owner updates own drafts" on public.chat_drafts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "owner deletes own drafts" on public.chat_drafts
  for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
create table if not exists public.chat_saved_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);
create index if not exists chat_saved_messages_user_idx on public.chat_saved_messages (user_id);

grant select, insert, delete on public.chat_saved_messages to authenticated;
grant all on public.chat_saved_messages to service_role;

alter table public.chat_saved_messages enable row level security;

create policy "owner reads own saved messages" on public.chat_saved_messages
  for select to authenticated
  using (user_id = auth.uid());

create policy "owner saves own messages" on public.chat_saved_messages
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "owner deletes own saved messages" on public.chat_saved_messages
  for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- Fixados: leitura segue a MESMA regra de chat_message_reactions (DM só
-- pro par, canal/campanha/projeto só pra quem é do time e tem acesso ao
-- canal). Insert/delete exige a mesma condição de acesso à conversa.
create table if not exists public.chat_pinned_messages (
  id uuid primary key default gen_random_uuid(),
  convo_id text not null,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  pinned_by uuid not null,
  pinned_at timestamptz not null default now()
);
create index if not exists chat_pinned_messages_convo_idx on public.chat_pinned_messages (convo_id);

grant select, insert, delete on public.chat_pinned_messages to authenticated;
grant all on public.chat_pinned_messages to service_role;

alter table public.chat_pinned_messages enable row level security;

create policy "read pins of accessible conversations" on public.chat_pinned_messages
  for select to authenticated
  using (
    (chat_pinned_messages.convo_id like 'dm:%' and position(auth.uid()::text in chat_pinned_messages.convo_id) > 0)
    or (
      chat_pinned_messages.convo_id not like 'dm:%'
      and public.is_internal_team_member(auth.uid())
      and (
        not exists (select 1 from public.chat_channels cc where cc.id::text = chat_pinned_messages.convo_id)
        or exists (
          select 1 from public.chat_channels cc
          where cc.id::text = chat_pinned_messages.convo_id
            and (cc.is_private = false or auth.uid() = any (cc.allowed_member_ids) or public.is_admin(auth.uid()))
        )
      )
    )
  );

create policy "pin message in accessible conversation" on public.chat_pinned_messages
  for insert to authenticated
  with check (
    pinned_by = auth.uid()
    and (
      (chat_pinned_messages.convo_id like 'dm:%' and position(auth.uid()::text in chat_pinned_messages.convo_id) > 0)
      or (
        chat_pinned_messages.convo_id not like 'dm:%'
        and public.is_internal_team_member(auth.uid())
        and (
          not exists (select 1 from public.chat_channels cc where cc.id::text = chat_pinned_messages.convo_id)
          or exists (
            select 1 from public.chat_channels cc
            where cc.id::text = chat_pinned_messages.convo_id
              and (cc.is_private = false or auth.uid() = any (cc.allowed_member_ids) or public.is_admin(auth.uid()))
          )
        )
      )
    )
  );

create policy "unpin in accessible conversation" on public.chat_pinned_messages
  for delete to authenticated
  using (
    (chat_pinned_messages.convo_id like 'dm:%' and position(auth.uid()::text in chat_pinned_messages.convo_id) > 0)
    or (
      chat_pinned_messages.convo_id not like 'dm:%'
      and public.is_internal_team_member(auth.uid())
      and (
        not exists (select 1 from public.chat_channels cc where cc.id::text = chat_pinned_messages.convo_id)
        or exists (
          select 1 from public.chat_channels cc
          where cc.id::text = chat_pinned_messages.convo_id
            and (cc.is_private = false or auth.uid() = any (cc.allowed_member_ids) or public.is_admin(auth.uid()))
        )
      )
    )
  );

alter publication supabase_realtime add table public.chat_drafts;
alter publication supabase_realtime add table public.chat_saved_messages;
alter publication supabase_realtime add table public.chat_pinned_messages;
