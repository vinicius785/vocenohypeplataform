-- Hypito — assistente/bot oficial da plataforma. Primeira função: publicar
-- um relatório semanal automático no canal "Geral" do Chat.
--
-- Decisão de identidade (ver `src/lib/hypito.ts`): o Hypito NÃO ganha uma
-- linha em `profiles`/`auth.users`. `chat_messages.author_id` é `uuid` SEM
-- foreign key (ver `20260722161512_...sql`), então uma mensagem pode usar
-- um UUID fixo e conhecido só pra essa identidade, com `author_name`/
-- `author_photo` preenchidos diretamente na própria linha (o Chat já
-- denormaliza esses campos na mensagem, nunca faz join em `profiles` pra
-- renderizar autor — ver `mapMessage` em `chat-store.ts`). Isso, sozinho,
-- já garante todas as restrições do pedido: sem login, sem senha, não
-- aparece em nenhum seletor de responsável/colaborador (esses seletores
-- listam `profiles`), não conta em métricas de membros ativos, não pode
-- ser "excluído" por ninguém (não existe linha de usuário pra excluir).

-- 1) Canal "Geral" precisa de um identificador ESTÁVEL, não dependente do
-- nome visível (que pode ser renomeado). `chat_channels` hoje só tem
-- `name` (livre) — adiciona `slug` (imutável, só a automação usa) e marca
-- o canal seed "geral" (`20260722161512_...sql`, linha ~106) com ele.
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS chat_channels_slug_key
  ON public.chat_channels (slug) WHERE slug IS NOT NULL;

UPDATE public.chat_channels
SET slug = 'geral'
WHERE slug IS NULL
  AND lower(name) = 'geral'
  AND id = (SELECT id FROM public.chat_channels WHERE lower(name) = 'geral' ORDER BY sort_order, created_at LIMIT 1);

-- 2) Configuração administrativa do relatório semanal — uma linha por
-- workspace (hoje só existe "default", mas a chave já é preparada pra
-- múltiplos: nada no código assume que só existe uma linha).
CREATE TABLE IF NOT EXISTS public.hypito_report_settings (
  workspace_id text PRIMARY KEY DEFAULT 'default',
  enabled boolean NOT NULL DEFAULT true,
  channel_slug text NOT NULL DEFAULT 'geral',
  weekday smallint NOT NULL DEFAULT 5, -- 0=domingo..6=sábado (sexta=5)
  hour smallint NOT NULL DEFAULT 17,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  mention_users boolean NOT NULL DEFAULT true,
  -- NULL = todo mundo elegível (padrão); lista explícita restringe a só
  -- esses ids. Nunca fixamos nomes no código — só ids reais de `profiles`.
  included_user_ids uuid[],
  excluded_user_ids uuid[] NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hypito_report_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.hypito_report_settings TO authenticated;
GRANT ALL ON public.hypito_report_settings TO service_role;
CREATE POLICY "admin manage hypito_report_settings" ON public.hypito_report_settings
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.hypito_report_settings (workspace_id)
VALUES ('default')
ON CONFLICT (workspace_id) DO NOTHING;

-- 3) Registro de execução — fonte de verdade pra idempotência
-- (`weekly-report:{workspaceId}:{weekStart}`), auditoria e retry seguro.
-- Escrita só via service-role (o cron e as server functions admin usam
-- `supabaseAdmin`); admins só LEEM pela UI de administração.
CREATE TABLE IF NOT EXISTS public.hypito_report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  idempotency_key text NOT NULL,
  week_start date NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  trigger text NOT NULL CHECK (trigger IN ('schedule', 'manual')),
  triggered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  preview boolean NOT NULL DEFAULT false,
  message_id uuid,
  channel_id uuid,
  mentioned_user_ids uuid[] NOT NULL DEFAULT '{}',
  unavailable_sources text[] NOT NULL DEFAULT '{}',
  error text,
  report jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Só execuções REAIS (preview=false) entram na trava de idempotência —
-- uma prévia nunca conta como "o relatório da semana já foi publicado".
CREATE UNIQUE INDEX IF NOT EXISTS hypito_report_runs_idempotency_key_real
  ON public.hypito_report_runs (idempotency_key) WHERE preview = false;
CREATE INDEX IF NOT EXISTS hypito_report_runs_workspace_week_idx
  ON public.hypito_report_runs (workspace_id, week_start DESC);

ALTER TABLE public.hypito_report_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.hypito_report_runs TO authenticated;
GRANT ALL ON public.hypito_report_runs TO service_role;
CREATE POLICY "admin read hypito_report_runs" ON public.hypito_report_runs
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
