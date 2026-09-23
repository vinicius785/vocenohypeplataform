-- Upgrade da tela Início: (1) preferências de "Personalizar início" reais
-- por usuário (hoje só em localStorage, resetava por navegador/dispositivo);
-- (2) "Lista pessoal" -> "Lembretes" com estrutura própria (título/data/
-- hora/observação/prioridade) em vez do jsonb simples {id,text,done} de
-- `profiles.personal_list`; (3) sessões diárias dos jogos ZIP/Termo.

-- --- 1) Preferências do dashboard (por usuário, mesma RLS de `profiles`) ---
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.profiles.dashboard_prefs IS
  'Preferências de "Personalizar início" (visibilidade/ordem dos cards opcionais) — por usuário, mesma política de RLS de personal_list. Formato: {"visible": {"work": true, ...}, "order": ["work", "agenda", ...]}.';

-- --- 2) Lembretes pessoais — tabela própria, nunca compartilhada ---
CREATE TABLE public.personal_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) > 0),
  notes TEXT,
  due_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'importante')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.personal_reminders IS
  'Lembretes privados do Início ("Lembretes", antes "Lista pessoal") — nunca compartilhados entre usuários, nunca incluídos em busca global, relatórios ou score operacional. RLS restringe tudo a user_id = auth.uid().';

CREATE INDEX personal_reminders_user_id_idx ON public.personal_reminders (user_id);
CREATE INDEX personal_reminders_due_at_idx ON public.personal_reminders (due_at);

ALTER TABLE public.personal_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own reminders select" ON public.personal_reminders
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own reminders insert" ON public.personal_reminders
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own reminders update" ON public.personal_reminders
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own reminders delete" ON public.personal_reminders
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER personal_reminders_set_updated_at
BEFORE UPDATE ON public.personal_reminders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migração dos itens existentes de `profiles.personal_list` — já é 100%
-- privado por linha de `profiles` (RLS `auth.uid() = id`), então cada item
-- já tem autoria inequívoca (o dono da linha de profile onde está
-- guardado); não há registro "sem proprietário confiável" a relatar aqui.
-- `text` -> `title`, `done: true` -> `completed_at = now()` (não temos a
-- data real de conclusão, só o booleano — usar "agora" é a melhor
-- aproximação disponível, documentado, nunca inventando uma data no
-- passado). A coluna `personal_list` é preservada (não apagada) até a UI
-- nova ser validada em produção.
INSERT INTO public.personal_reminders (user_id, title, completed_at, created_at)
SELECT
  p.id,
  COALESCE(NULLIF(btrim(item->>'text'), ''), '(sem título)'),
  CASE WHEN (item->>'done')::boolean THEN now() ELSE NULL END,
  now()
FROM public.profiles p, jsonb_array_elements(COALESCE(p.personal_list, '[]'::jsonb)) AS item
WHERE jsonb_typeof(p.personal_list) = 'array' AND jsonb_array_length(p.personal_list) > 0;

-- --- 3) Sessões diárias dos jogos (ZIP e Termo) ---
CREATE TABLE public.daily_game_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL CHECK (game_type IN ('zip', 'termo')),
  challenge_date TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  elapsed_seconds INTEGER,
  hints_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_type, challenge_date)
);
COMMENT ON TABLE public.daily_game_sessions IS
  'Progresso individual dos jogos diários (ZIP/Termo) — "state" guarda só o necessário pra retomar (ex.: tentativas do Termo já avaliadas, caminho em progresso do ZIP), nunca a resposta/solução completa quando o jogo ainda não terminou (isso é responsabilidade da camada de servidor que lê/grava esta tabela, não da tabela em si). Sem ranking/leaderboard — cada linha é só do próprio usuário.';

CREATE INDEX daily_game_sessions_user_id_idx ON public.daily_game_sessions (user_id);

ALTER TABLE public.daily_game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own game sessions select" ON public.daily_game_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own game sessions insert" ON public.daily_game_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own game sessions update" ON public.daily_game_sessions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER daily_game_sessions_set_updated_at
BEFORE UPDATE ON public.daily_game_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
