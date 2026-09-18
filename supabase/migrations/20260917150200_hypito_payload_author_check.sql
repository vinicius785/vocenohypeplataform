-- Security audit finding: chat_messages.hypito_payload had no constraint
-- tying it to author_id. The INSERT policy only checks
-- `author_id = auth.uid() OR author_id IS NULL` and never inspects
-- hypito_payload, so any authenticated user could insert their own message
-- with a forged hypito_payload (mimicking a Hypito confirmation card with
-- fake data/action buttons). This enforces at the DB level that
-- hypito_payload can only be set on messages authored by Hypito itself.
--
-- Note: author_id IS NULL is intentionally still allowed on INSERT (used by
-- legitimate client-side "system" messages in src/lib/chat-store.ts) and is
-- out of scope for this fix — documented as a separate, low-severity,
-- accepted residual risk in the audit report.

ALTER TABLE public.chat_messages
  ADD CONSTRAINT hypito_payload_requires_hypito_author
  CHECK (hypito_payload IS NULL OR author_id = '00000000-0000-4000-a000-48797069746f'::uuid);
