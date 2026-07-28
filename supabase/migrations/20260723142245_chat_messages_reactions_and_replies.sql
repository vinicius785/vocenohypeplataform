-- Slack-like reactions and reply-to-message support for chat_messages.
-- reactions: { "👍": ["user-id-1", "user-id-2"], "❤️": ["user-id-3"] }
alter table public.chat_messages
  add column if not exists reactions jsonb not null default '{}'::jsonb;

alter table public.chat_messages
  add column if not exists reply_to_id uuid references public.chat_messages(id) on delete set null;

create index if not exists chat_messages_reply_to_id_idx on public.chat_messages (reply_to_id);
