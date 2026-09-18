-- Security audit finding (via Supabase's own security advisor): both
-- toggle_message_reaction and heal_voice_attachment_duration are
-- SECURITY DEFINER functions (bypass RLS entirely) that only checked
-- `auth.uid() IS NOT NULL` — i.e. "is authenticated" — before reading/
-- writing an arbitrary chat_messages row by id, with no check that the
-- caller actually belongs to that message's conversation. Combined with
-- direct-RPC access (bypasses the app UI and the just-fixed chat_messages
-- SELECT policy, since SECURITY DEFINER runs with elevated privilege
-- regardless of RLS), any authenticated user could toggle a reaction on,
-- or tamper with the voice-message metadata of, any message in any
-- private channel by guessing/knowing its id. This adds the same
-- membership check already used by the chat_messages SELECT policy
-- (20260917150100_restrict_chat_messages_to_channel_members.sql).

CREATE OR REPLACE FUNCTION public.toggle_message_reaction(p_message_id uuid, p_emoji text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_convo_id text;
  v_reactions jsonb;
  v_users jsonb;
  v_has boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT convo_id, reactions INTO v_convo_id, v_reactions FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message not found';
  END IF;

  IF v_convo_id LIKE 'dm:%' THEN
    IF position(v_uid in v_convo_id) <= 0 THEN
      RAISE EXCEPTION 'not authorized for this conversation';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.chat_channels cc WHERE cc.id::text = v_convo_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.chat_channels cc
      WHERE cc.id::text = v_convo_id
        AND (cc.is_private = false OR auth.uid() = ANY (cc.allowed_member_ids) OR public.is_admin(auth.uid()))
    ) THEN
      RAISE EXCEPTION 'not authorized for this conversation';
    END IF;
  END IF;

  IF v_reactions IS NULL THEN
    v_reactions := '{}'::jsonb;
  END IF;

  v_users := COALESCE(v_reactions -> p_emoji, '[]'::jsonb);
  v_has := v_users @> to_jsonb(v_uid);

  IF v_has THEN
    SELECT COALESCE(jsonb_agg(u), '[]'::jsonb) INTO v_users
    FROM jsonb_array_elements_text(v_users) u
    WHERE u <> v_uid;
  ELSE
    v_users := v_users || jsonb_build_array(v_uid);
  END IF;

  IF jsonb_array_length(v_users) = 0 THEN
    v_reactions := v_reactions - p_emoji;
  ELSE
    v_reactions := jsonb_set(v_reactions, ARRAY[p_emoji], v_users, true);
  END IF;

  UPDATE public.chat_messages SET reactions = v_reactions WHERE id = p_message_id;
  RETURN v_reactions;
END;
$$;

CREATE OR REPLACE FUNCTION public.heal_voice_attachment_duration(p_message_id uuid, p_attachment_path text, p_duration_ms integer, p_peaks jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_convo_id text;
  v_attachments jsonb;
  v_idx int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT convo_id, attachments INTO v_convo_id, v_attachments FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message not found';
  END IF;

  IF v_convo_id LIKE 'dm:%' THEN
    IF position(v_uid in v_convo_id) <= 0 THEN
      RAISE EXCEPTION 'not authorized for this conversation';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.chat_channels cc WHERE cc.id::text = v_convo_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.chat_channels cc
      WHERE cc.id::text = v_convo_id
        AND (cc.is_private = false OR auth.uid() = ANY (cc.allowed_member_ids) OR public.is_admin(auth.uid()))
    ) THEN
      RAISE EXCEPTION 'not authorized for this conversation';
    END IF;
  END IF;

  IF v_attachments IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ord - 1 INTO v_idx
  FROM jsonb_array_elements(v_attachments) WITH ORDINALITY AS t(elem, ord)
  WHERE elem ->> 'path' = p_attachment_path;

  IF v_idx IS NULL THEN
    RETURN v_attachments;
  END IF;

  v_attachments := jsonb_set(v_attachments, ARRAY[v_idx::text, 'durationMs'], to_jsonb(p_duration_ms), true);
  v_attachments := jsonb_set(v_attachments, ARRAY[v_idx::text, 'peaks'], p_peaks, true);

  UPDATE public.chat_messages SET attachments = v_attachments WHERE id = p_message_id;
  RETURN v_attachments;
END;
$$;
