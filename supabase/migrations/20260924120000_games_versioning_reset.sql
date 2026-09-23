-- Reconstrução do motor lógico do ZIP/Termo: a rodada anterior guardava
-- sessões sem nenhuma versão de desafio/motor. Quando a mecânica do ZIP
-- mudou (paredes adicionadas, células passaram de {r,c} pra {row,column}),
-- sessões salvas sob a regra antiga ficaram geometricamente incompatíveis
-- com o motor atual sem que nada detectasse isso — o cronômetro também
-- calculava o tempo decorrido como `now - started_at` corrido, sem pausar
-- ao fechar o modal (por isso o "21:47": ~22 minutos de relógio corrido
-- entre abrir e a última jogada, não tempo de fato jogado).
--
-- Esta migration:
-- 1. adiciona `challenge_version`/`engine_version` (comparados a cada
--    carregamento de sessão — `checkSessionCompatibility` em
--    `src/lib/games/shared/session.ts` — antes de tentar restaurar
--    qualquer estado);
-- 2. adiciona `resumed_at`, pra separar "tempo acumulado" (pausado) de
--    "início do trecho corrente em andamento" — `elapsed_seconds` passa a
--    ser sempre o acumulado, nunca uma diferença contra "agora" sozinha;
-- 3. arquiva (nunca apaga silenciosamente) todas as sessões existentes —
--    nenhuma tinha versão marcada, então são todas, por definição,
--    anteriores a este versionamento — numa tabela de auditoria, e as
--    reseta pra permitir recomeçar. Não toca em `personal_reminders`,
--    `profiles.dashboard_prefs` nem qualquer outra tabela do usuário.

ALTER TABLE public.daily_game_sessions
  ADD COLUMN challenge_version integer,
  ADD COLUMN engine_version integer,
  ADD COLUMN resumed_at timestamptz;

COMMENT ON COLUMN public.daily_game_sessions.challenge_version IS
  'Versão do formato do desafio (ex.: ZIP_CHALLENGE_VERSION) no momento em que a sessão foi criada/atualizada — comparada a cada leitura contra a versão atual antes de restaurar o estado.';
COMMENT ON COLUMN public.daily_game_sessions.engine_version IS
  'Versão das regras de validação de jogada (ex.: ZIP_ENGINE_VERSION/TERMO_ENGINE_VERSION) — idem challenge_version.';
COMMENT ON COLUMN public.daily_game_sessions.resumed_at IS
  'Início do trecho de jogo EM ANDAMENTO agora (null quando pausado/concluído/não iniciado). elapsed_seconds é sempre o total já ACUMULADO até a última pausa — o tempo decorrido real é elapsed_seconds + (now - resumed_at) só enquanto resumed_at não é null.';

-- Tabela de auditoria — nunca um DELETE silencioso. Mesma forma da
-- tabela original + motivo e data do arquivamento.
CREATE TABLE public.daily_game_sessions_archive (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  game_type text NOT NULL,
  challenge_date text NOT NULL,
  challenge_id text NOT NULL,
  state jsonb NOT NULL,
  attempts integer NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  elapsed_seconds integer,
  hints_used integer NOT NULL,
  original_created_at timestamptz NOT NULL,
  original_updated_at timestamptz NOT NULL,
  archive_reason text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.daily_game_sessions_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own archived sessions select" ON public.daily_game_sessions_archive
  FOR SELECT TO authenticated USING (user_id = auth.uid());
COMMENT ON TABLE public.daily_game_sessions_archive IS
  'Auditoria de sessões de jogo invalidadas por incompatibilidade de versão (desafio/motor) — nunca apaga dado do usuário sem preservar uma cópia consultável.';

-- Arquiva TODAS as sessões existentes (nenhuma tinha versão marcada —
-- são todas, por definição, de antes deste versionamento) antes de
-- resetá-las. Relatório de quantas linhas foram afetadas fica no
-- resultado desta migration (contagem via RETURNING).
WITH archived AS (
  INSERT INTO public.daily_game_sessions_archive (
    id, user_id, game_type, challenge_date, challenge_id, state, attempts,
    started_at, completed_at, elapsed_seconds, hints_used,
    original_created_at, original_updated_at, archive_reason
  )
  SELECT
    id, user_id, game_type, challenge_date, challenge_id, state, attempts,
    started_at, completed_at, elapsed_seconds, hints_used,
    created_at, updated_at, 'pre_versioning_reset'
  FROM public.daily_game_sessions
  WHERE challenge_version IS NULL OR engine_version IS NULL
  RETURNING id
)
DELETE FROM public.daily_game_sessions
WHERE id IN (SELECT id FROM archived);
