-- Tempo compartilhado: várias pessoas na MESMA sessão de trabalho de uma tarefa.
-- Modelo: uma linha de `time_entries` continua sendo UMA pessoa em UM intervalo (horas-pessoa).
-- `session_id` agrupa as linhas de uma mesma sessão (NULL = sessão de uma pessoa só: todo o
-- histórico atual). Sem tabela nova; nenhum dado existente muda; solo continua igual.

ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS session_id UUID;

CREATE INDEX IF NOT EXISTS time_entries_session_idx
  ON public.time_entries (session_id) WHERE session_id IS NOT NULL;
-- Participante duplicado na mesma sessão: impossível.
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_session_user_uniq
  ON public.time_entries (session_id, user_id) WHERE session_id IS NOT NULL;

-- Participa desta sessão? SECURITY DEFINER para o RLS não recursar na própria tabela.
CREATE OR REPLACE FUNCTION public.is_time_session_member(_session uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _session IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.time_entries WHERE session_id = _session AND user_id = _user
  );
$$;
REVOKE ALL ON FUNCTION public.is_time_session_member(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.is_time_session_member(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_time_session_member(uuid, uuid) TO authenticated;

-- Quem participa da sessão enxerga, edita e remove as linhas dela (além da própria linha e de quem
-- tem a permissão `time`). INSERT continua só em nome próprio: adicionar outra pessoa é pela RPC.
DROP POLICY IF EXISTS "own or time-permission read time_entries" ON public.time_entries;
DROP POLICY IF EXISTS "own or time-permission update time_entries" ON public.time_entries;
DROP POLICY IF EXISTS "own or time-permission delete time_entries" ON public.time_entries;

CREATE POLICY "own, session or time-permission read time_entries" ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_permission(auth.uid(), 'time')
    OR public.is_time_session_member(session_id, auth.uid())
  );
CREATE POLICY "own, session or time-permission update time_entries" ON public.time_entries
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_permission(auth.uid(), 'time')
    OR public.is_time_session_member(session_id, auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_permission(auth.uid(), 'time')
    OR public.is_time_session_member(session_id, auth.uid())
  );
CREATE POLICY "own, session or time-permission delete time_entries" ON public.time_entries
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_permission(auth.uid(), 'time')
    OR public.is_time_session_member(session_id, auth.uid())
  );

-- Ninguém reatribui a linha a outra pessoa/tarefa editando (só horários, nota, sessão).
CREATE OR REPLACE FUNCTION public.time_entries_keep_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- user_id → NULL é a ação do FK (ON DELETE SET NULL) quando um membro é removido: permitido.
  IF (NEW.user_id IS DISTINCT FROM OLD.user_id AND NEW.user_id IS NOT NULL)
     OR NEW.task_id IS DISTINCT FROM OLD.task_id
     OR NEW.task_origin IS DISTINCT FROM OLD.task_origin THEN
    RAISE EXCEPTION 'time_entries: pessoa e tarefa de um registro não podem ser alteradas';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS time_entries_keep_identity ON public.time_entries;
CREATE TRIGGER time_entries_keep_identity
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_keep_identity();

-- Garante a sessão da linha do próprio usuário (cria o id na primeira vez que alguém é adicionado).
CREATE OR REPLACE FUNCTION public.ensure_time_session(p_entry uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_session uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.time_entries
     SET session_id = COALESCE(session_id, gen_random_uuid())
   WHERE id = p_entry AND user_id = auth.uid()
  RETURNING session_id INTO v_session;
  IF v_session IS NULL THEN RAISE EXCEPTION 'registro não encontrado'; END IF;
  RETURN v_session;
END;
$$;

-- Adiciona uma pessoa (interna) a uma sessão da qual o chamador participa. Sem `p_ended` entra com o
-- cronômetro ligado (respeita o índice de um timer por pessoa).
CREATE OR REPLACE FUNCTION public.add_time_participant(
  p_session uuid, p_user uuid, p_started timestamptz, p_ended timestamptz DEFAULT NULL
)
RETURNS public.time_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE base public.time_entries; created public.time_entries;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_time_session_member(p_session, auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.is_internal_team_member(p_user) THEN
    RAISE EXCEPTION 'participante fora do time';
  END IF;
  IF p_ended IS NOT NULL AND p_ended < p_started THEN
    RAISE EXCEPTION 'intervalo inválido';
  END IF;
  SELECT * INTO base FROM public.time_entries WHERE session_id = p_session ORDER BY started_at LIMIT 1;
  INSERT INTO public.time_entries
    (task_id, task_origin, user_id, started_at, ended_at, duration_seconds, source, note, session_id)
  VALUES
    (base.task_id, base.task_origin, p_user, p_started, p_ended,
     CASE WHEN p_ended IS NULL THEN NULL ELSE GREATEST(0, round(extract(epoch FROM p_ended - p_started))::int) END,
     CASE WHEN p_ended IS NULL THEN 'cronometro' ELSE 'manual' END,
     base.note, p_session)
  RETURNING * INTO created;
  RETURN created;
END;
$$;

-- Registro manual compartilhado, tudo ou nada: `p_participants` = [{user_id, started_at, ended_at}].
-- O chamador precisa estar entre os participantes; todos precisam ser do time.
CREATE OR REPLACE FUNCTION public.create_manual_time_session(
  p_task uuid, p_origin text, p_note text, p_participants jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_session uuid := gen_random_uuid(); p jsonb; v_start timestamptz; v_end timestamptz; v_user uuid; v_has_me boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_origin NOT IN ('projeto','campanha','marketing','comercial') THEN RAISE EXCEPTION 'origem inválida'; END IF;
  IF jsonb_typeof(p_participants) <> 'array' OR jsonb_array_length(p_participants) = 0 THEN
    RAISE EXCEPTION 'sem participantes';
  END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(p_participants) LOOP
    v_user := (p->>'user_id')::uuid;
    v_start := (p->>'started_at')::timestamptz;
    v_end := (p->>'ended_at')::timestamptz;
    IF v_end IS NULL OR v_end < v_start THEN RAISE EXCEPTION 'intervalo inválido'; END IF;
    IF NOT public.is_internal_team_member(v_user) THEN RAISE EXCEPTION 'participante fora do time'; END IF;
    IF v_user = auth.uid() THEN v_has_me := true; END IF;
    INSERT INTO public.time_entries
      (task_id, task_origin, user_id, started_at, ended_at, duration_seconds, source, note, session_id)
    VALUES
      (p_task, p_origin, v_user, v_start, v_end,
       GREATEST(0, round(extract(epoch FROM v_end - v_start))::int), 'manual',
       NULLIF(btrim(p_note), ''), v_session);
  END LOOP;
  IF NOT v_has_me THEN RAISE EXCEPTION 'o autor precisa participar'; END IF;
  RETURN v_session;
END;
$$;

-- Para a sessão inteira de uma vez (relógio do servidor). Idempotente: só linhas ainda abertas.
CREATE OR REPLACE FUNCTION public.stop_time_session(p_session uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_time_session_member(p_session, auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.time_entries
     SET ended_at = GREATEST(now(), started_at),
         duration_seconds = GREATEST(0, round(extract(epoch FROM GREATEST(now(), started_at) - started_at))::int)
   WHERE session_id = p_session AND ended_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'ensure_time_session(uuid)',
    'add_time_participant(uuid, uuid, timestamptz, timestamptz)',
    'create_manual_time_session(uuid, text, text, jsonb)',
    'stop_time_session(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public', f);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
