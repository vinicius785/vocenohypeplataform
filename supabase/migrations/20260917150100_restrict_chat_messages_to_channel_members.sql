-- Security audit finding: the SELECT policy on chat_messages only ever
-- restricted DM conversations ("dm:%"). For any group/private channel, the
-- policy reduced to `true` regardless of chat_channels.is_private /
-- allowed_member_ids, so any authenticated user (or a direct Realtime/REST
-- call bypassing the app UI) could read every message in every private
-- channel. Channel *metadata* was already correctly scoped by
-- "authenticated read channels" — this closes the matching gap on the
-- messages themselves. convo_id for non-DM conversations equals
-- chat_channels.id (cast to text) per src/lib/chat-store.ts; convo_ids that
-- don't resolve to a real channel row (e.g. campaign/project-linked ad hoc
-- conversations) keep the previous open behavior, matching prior semantics.

DROP POLICY IF EXISTS "authenticated read messages" ON public.chat_messages;

CREATE POLICY "authenticated read messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    convo_id NOT LIKE 'dm:%'
    AND (
      NOT EXISTS (SELECT 1 FROM public.chat_channels cc WHERE cc.id::text = chat_messages.convo_id)
      OR EXISTS (
        SELECT 1 FROM public.chat_channels cc
        WHERE cc.id::text = chat_messages.convo_id
          AND (cc.is_private = false OR auth.uid() = ANY (cc.allowed_member_ids) OR is_admin(auth.uid()))
      )
    )
    OR (convo_id LIKE 'dm:%' AND position(auth.uid()::text in convo_id) > 0)
  );
