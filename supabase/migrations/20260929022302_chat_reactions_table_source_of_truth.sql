-- Chat V2 fase 2: reações passam a ter a tabela chat_message_reactions
-- como fonte de verdade. toggle_message_reaction agora faz insert/delete
-- direto na tabela (respeitando o unique(message_id,user_id,emoji)) e, na
-- mesma transação, resincroniza o jsonb chat_messages.reactions a partir
-- dela — assim V1 (que ainda lê o jsonb) e V2 (que passa a ler a tabela)
-- continuam consistentes entre si, sem depender da ordem dos triggers de
-- espelhamento já existentes (20260929015524_chat_v2_foundation.sql).
--
-- A checagem de autorização é a mesma já usada pela policy de leitura de
-- chat_message_reactions/chat_messages: DM só pro par, canal/campanha/
-- projeto só pra quem é do time (is_internal_team_member) e tem acesso ao
-- canal (público, ou allowed_member_ids, ou admin).

CREATE OR REPLACE FUNCTION public.toggle_message_reaction(p_message_id uuid, p_emoji text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_convo_id text;
  v_reactions jsonb;
  v_deleted int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT convo_id INTO v_convo_id FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message not found';
  END IF;

  IF v_convo_id LIKE 'dm:%' THEN
    IF position(v_uid::text in v_convo_id) <= 0 THEN
      RAISE EXCEPTION 'not authorized for this conversation';
    END IF;
  ELSE
    IF NOT public.is_internal_team_member(v_uid) THEN
      RAISE EXCEPTION 'not authorized for this conversation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.chat_channels cc WHERE cc.id::text = v_convo_id) THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.chat_channels cc
        WHERE cc.id::text = v_convo_id
          AND (cc.is_private = false OR v_uid = ANY (cc.allowed_member_ids) OR public.is_admin(v_uid))
      ) THEN
        RAISE EXCEPTION 'not authorized for this conversation';
      END IF;
    END IF;
  END IF;

  -- Toggle direto na tabela relacional (fonte de verdade).
  DELETE FROM public.chat_message_reactions
  WHERE message_id = p_message_id AND user_id = v_uid AND emoji = p_emoji;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    INSERT INTO public.chat_message_reactions (message_id, user_id, emoji)
    VALUES (p_message_id, v_uid, p_emoji)
    ON CONFLICT (message_id, user_id, emoji) DO NOTHING;
  END IF;

  -- Resincroniza o jsonb (compat V1) a partir da tabela.
  SELECT COALESCE(
    jsonb_object_agg(emoji, users) FILTER (WHERE emoji IS NOT NULL),
    '{}'::jsonb
  )
  INTO v_reactions
  FROM (
    SELECT r.emoji, jsonb_agg(r.user_id::text ORDER BY r.created_at) AS users
    FROM public.chat_message_reactions r
    WHERE r.message_id = p_message_id
    GROUP BY r.emoji
  ) grouped(emoji, users);

  UPDATE public.chat_messages SET reactions = v_reactions WHERE id = p_message_id;

  RETURN v_reactions;
END;
$$;
