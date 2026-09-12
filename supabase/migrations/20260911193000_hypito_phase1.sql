-- Hypito — Fase 1 (conversa, ferramentas de consulta, criação assistida
-- de tarefas/lembretes, resumo diário, alertas preventivos). Local, NÃO
-- aplicada remotamente nesta tarefa.

-- 1) Confirmações pendentes — mesmo padrão de `vault_access_requests`
-- (`20260723182252_vault_access_requests.sql`): linha com `status` +
-- `expires_at`, só o próprio usuário que abriu pode confirmar/cancelar.
-- Nunca é o modelo de linguagem quem executa a mutação — só uma ação
-- humana explícita SOBRE esta linha (pedido, seção 3/18).
CREATE TABLE IF NOT EXISTS public.hypito_pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('create_task', 'create_reminder')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  result jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS hypito_pending_actions_user_idx
  ON public.hypito_pending_actions (user_id, status);

ALTER TABLE public.hypito_pending_actions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.hypito_pending_actions TO authenticated;
GRANT ALL ON public.hypito_pending_actions TO service_role;
CREATE POLICY "own pending actions" ON public.hypito_pending_actions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2) Lembretes — conceito novo (a plataforma só tinha a "Lista pessoal"
-- sem data/hora, ver `InicioDashboard.tsx`). Entrega reaproveita o Chat
-- (mensagem do Hypito na DM) e o push já existentes — não é uma
-- infraestrutura de notificação paralela.
CREATE TABLE IF NOT EXISTS public.hypito_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  remind_at timestamptz NOT NULL,
  related_kind text CHECK (related_kind IN ('task', 'project', 'campaign', 'meeting', 'none')),
  related_id text,
  related_link text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS hypito_reminders_due_idx
  ON public.hypito_reminders (status, remind_at);

ALTER TABLE public.hypito_reminders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.hypito_reminders TO authenticated;
GRANT ALL ON public.hypito_reminders TO service_role;
-- Só o dono pode ler/cancelar o próprio lembrete pela UI — criação real
-- sempre passa por `confirmHypitoAction` (service-role), nunca por
-- INSERT direto do cliente (por isso não há policy de INSERT aqui).
CREATE POLICY "own reminders read/cancel" ON public.hypito_reminders
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND status = 'cancelled');

-- 3) Preferências do usuário em relação ao Hypito — resumo diário,
-- aviso de reunião, tipos de alerta silenciados. Uma linha por pessoa,
-- criada sob demanda (default = tudo ativado).
CREATE TABLE IF NOT EXISTS public.hypito_user_prefs (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  daily_briefing_enabled boolean NOT NULL DEFAULT true,
  meeting_reminder_enabled boolean NOT NULL DEFAULT true,
  muted_alert_types text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hypito_user_prefs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.hypito_user_prefs TO authenticated;
GRANT ALL ON public.hypito_user_prefs TO service_role;
CREATE POLICY "own hypito prefs" ON public.hypito_user_prefs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4) Alertas preventivos já enviados — dedupe + cooldown por
-- (usuário, tipo, item). Uma linha por risco identificado; `resolved_at`
-- fecha o alerta quando a pendência deixa de existir (não é reaberto
-- sozinho, só se o risco voltar a acontecer de verdade — outra checagem
-- da regra determinística, nunca um reenvio automático por tempo).
CREATE TABLE IF NOT EXISTS public.hypito_alerts_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  item_key text NOT NULL,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (user_id, alert_type, item_key)
);
ALTER TABLE public.hypito_alerts_sent ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.hypito_alerts_sent TO authenticated;
GRANT ALL ON public.hypito_alerts_sent TO service_role;
CREATE POLICY "admin read hypito_alerts_sent" ON public.hypito_alerts_sent
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 5) Avisos de reunião já registrados — usado pra idempotência
-- server-side do popup de 5 minutos (chave
-- `meeting-reminder:{workspaceId}:{userId}:{meetingOccurrenceId}:5m`) e
-- pro Centro de Notificações mostrar "Hypito lembrou você sobre uma
-- reunião" sem depender só do `localStorage` do navegador (que já
-- resolvia isso no cliente, mas não persistia entre dispositivos).
CREATE TABLE IF NOT EXISTS public.hypito_meeting_reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  dismissed_at timestamptz,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, meeting_id)
);
ALTER TABLE public.hypito_meeting_reminders_sent ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.hypito_meeting_reminders_sent TO authenticated;
GRANT ALL ON public.hypito_meeting_reminders_sent TO service_role;
CREATE POLICY "own meeting reminders" ON public.hypito_meeting_reminders_sent
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 6) Resumo diário — registro de execução, mesmo padrão de
-- `hypito_report_runs` (relatório semanal), chave
-- `daily-briefing:{workspaceId}:{userId}:{localDate}`.
CREATE TABLE IF NOT EXISTS public.hypito_daily_briefing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  message_id uuid,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS hypito_daily_briefing_runs_key
  ON public.hypito_daily_briefing_runs (idempotency_key);
ALTER TABLE public.hypito_daily_briefing_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.hypito_daily_briefing_runs TO authenticated;
GRANT ALL ON public.hypito_daily_briefing_runs TO service_role;
CREATE POLICY "admin read hypito_daily_briefing_runs" ON public.hypito_daily_briefing_runs
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 7) Auditoria de ações tomadas por meio do Hypito (pedido: "registrar
-- que a tarefa foi criada por meio do Hypito e quem solicitou").
CREATE TABLE IF NOT EXISTS public.hypito_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  target_kind text,
  target_id text,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hypito_action_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.hypito_action_log TO authenticated;
GRANT ALL ON public.hypito_action_log TO service_role;
CREATE POLICY "admin read hypito_action_log" ON public.hypito_action_log
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
