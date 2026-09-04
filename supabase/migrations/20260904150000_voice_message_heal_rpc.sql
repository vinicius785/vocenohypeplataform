-- Mensagens de voz gravadas antes desta migração não têm `durationMs`/`peaks`
-- persistidos no attachment (jsonb, coluna `chat_messages.attachments`) — a
-- duração é descoberta ao tocar o áudio, uma vez, e precisa ser salva de
-- volta pra nunca mais recalcular. Mas UPDATE em chat_messages é restrito ao
-- próprio autor ("authenticated update own messages"), e essa correção pode
-- ser feita por QUALQUER pessoa que abrir a mensagem antiga de outra pessoa
-- primeiro. Mesmo padrão já usado em toggle_message_reaction: uma função
-- SECURITY DEFINER que mexe só num campo específico dentro do attachment
-- (nunca em `text`/`edited_at`/`reactions`), contornando essa restrição de
-- forma segura e estreita.
CREATE OR REPLACE FUNCTION public.heal_voice_attachment_duration(
  p_message_id uuid,
  p_attachment_path text,
  p_duration_ms integer,
  p_peaks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attachments jsonb;
  v_idx int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT attachments INTO v_attachments FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message not found';
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

GRANT EXECUTE ON FUNCTION public.heal_voice_attachment_duration(uuid, text, integer, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.heal_voice_attachment_duration(uuid, text, integer, jsonb) FROM anon, public;
