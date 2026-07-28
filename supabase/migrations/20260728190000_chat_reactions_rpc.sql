-- A UPDATE em chat_messages é restrita ao próprio autor (author_id = auth.uid()),
-- pensada para proteger a edição de texto/anexos de terceiros. Isso também
-- bloqueava silenciosamente (RLS não gera erro, só zero linhas afetadas) a
-- reação a mensagens de outras pessoas, já que o toggle de reação usa a
-- mesma tabela/coluna. Esta função SECURITY DEFINER mexe só na coluna
-- `reactions`, contornando essa restrição de forma segura e específica,
-- sem abrir edição geral de mensagens de terceiros.
CREATE OR REPLACE FUNCTION public.toggle_message_reaction(p_message_id uuid, p_emoji text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_reactions jsonb;
  v_users jsonb;
  v_has boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT reactions INTO v_reactions FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message not found';
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

GRANT EXECUTE ON FUNCTION public.toggle_message_reaction(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_message_reaction(uuid, text) FROM anon, public;
