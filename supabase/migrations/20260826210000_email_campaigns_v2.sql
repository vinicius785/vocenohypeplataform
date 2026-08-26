-- Redesenho do sistema de e-mail: de "motor de automação reagindo a
-- eventos de CRM" (v1, nunca usado em produção — zero linhas reais em
-- qualquer tabela abaixo) para um modelo centrado em CAMPANHA, com
-- público explícito e sequência visual (ver plano "redesenho centrado
-- em campanha (v2)"). Substituição completa do schema anterior — sem
-- dado real a preservar, só a config/infra que já funciona
-- (email_provider_settings, email_unsubscribes, que NÃO mudam de nome).

-- ============================================================
-- Remove o motor v1 (gatilhos de evento + varredura agendada + tabelas
-- de fluxo/matrícula). email_provider_settings e email_unsubscribes
-- ficam — são reaproveitados como estão (a primeira só ganha uma
-- coluna nova, webhook_secret).
-- ============================================================
DROP TRIGGER IF EXISTS email_flows_leads_insert ON public.leads;
DROP TRIGGER IF EXISTS email_flows_leads_update ON public.leads;
DROP TRIGGER IF EXISTS email_flows_clientes_insert ON public.clientes;
DROP TRIGGER IF EXISTS email_flows_influenciadores_insert_update ON public.campanha_influenciadores;

DROP FUNCTION IF EXISTS public.email_flows_leads_trigger();
DROP FUNCTION IF EXISTS public.email_flows_clientes_trigger();
DROP FUNCTION IF EXISTS public.email_flows_influenciadores_trigger();
DROP FUNCTION IF EXISTS public.run_scheduled_email_triggers();
DROP FUNCTION IF EXISTS public.enroll_email_flow(uuid, text, uuid, text, text);

DROP TABLE IF EXISTS public.email_sends;
DROP TABLE IF EXISTS public.email_flow_enrollments;
DROP TABLE IF EXISTS public.email_flows;
DROP TABLE IF EXISTS public.email_templates;

ALTER TABLE public.email_provider_settings ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

-- ============================================================
-- Campanhas — unidade central. Nasce vazia (sem público/etapa/
-- agendamento obrigatório); "pronta pra ativar" é um estado calculado
-- pela UI (nome + ≥1 destinatário + ≥1 etapa de e-mail configurada),
-- não uma trava de banco.
-- ============================================================
CREATE TABLE public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  objetivo TEXT NOT NULL DEFAULT 'outro'
    CHECK (objetivo IN ('prospeccao', 'convite', 'followup', 'comunicacao', 'relacionamento', 'outro')),
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'pronta', 'agendada', 'ativa', 'pausada', 'concluida', 'erro')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.email_campaigns TO authenticated;
GRANT ALL ON public.email_campaigns TO service_role;
CREATE POLICY "admin manage email_campaigns" ON public.email_campaigns
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER email_campaigns_set_updated_at
BEFORE UPDATE ON public.email_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Templates — reutilizáveis, sem trava de audiência (público agora é
-- lista de contato livre, não tipo de entidade de CRM). Tokens
-- genéricos {{nome}}/{{email}}.
-- ============================================================
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
CREATE POLICY "admin manage email_templates" ON public.email_templates
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER email_templates_set_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Etapas da campanha — a sequência visual (Início → [etapa] → ... →
-- Fim), ordenada por `position`. kind='email': mensagem de verdade
-- (com regra de destinatário em linguagem simples e "quando" mandar).
-- kind='wait': só um intervalo antes da próxima etapa.
-- ============================================================
CREATE TABLE public.email_campaign_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'wait')),
  -- kind = 'email'
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  internal_name TEXT,
  subject TEXT,
  body_html TEXT,
  recipient_rule TEXT NOT NULL DEFAULT 'todos'
    CHECK (recipient_rule IN ('todos', 'nao_abriu', 'nao_respondeu')),
  send_mode TEXT NOT NULL DEFAULT 'apos_anterior'
    CHECK (send_mode IN ('imediato', 'agendado', 'apos_anterior')),
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'pronta', 'agendada', 'enviando', 'enviado', 'erro')),
  -- kind = 'wait'
  wait_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_campaign_steps ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.email_campaign_steps TO authenticated;
GRANT ALL ON public.email_campaign_steps TO service_role;
CREATE POLICY "admin manage email_campaign_steps" ON public.email_campaign_steps
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER email_campaign_steps_set_updated_at
BEFORE UPDATE ON public.email_campaign_steps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX email_campaign_steps_campaign_idx ON public.email_campaign_steps (campaign_id, position);

-- ============================================================
-- Público — contato explícito por campanha, snapshot no momento de
-- adicionar (a partir daqui o motor de envio nunca precisa saber de
-- onde veio: Banco de Influenciadores, lead, cliente ou manual).
-- ============================================================
CREATE TABLE public.email_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('banco_influenciador', 'lead', 'cliente', 'manual')),
  source_id UUID,
  email TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled', 'responded', 'unsubscribed')),
  current_step_id UUID REFERENCES public.email_campaign_steps(id) ON DELETE SET NULL,
  next_run_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.email_campaign_recipients TO authenticated;
GRANT ALL ON public.email_campaign_recipients TO service_role;
CREATE POLICY "admin manage email_campaign_recipients" ON public.email_campaign_recipients
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
-- Sem duplicar destinatário na mesma campanha.
CREATE UNIQUE INDEX email_campaign_recipients_unique_email ON public.email_campaign_recipients (campaign_id, email);
CREATE INDEX email_campaign_recipients_due_idx ON public.email_campaign_recipients (next_run_at) WHERE status = 'active';

-- ============================================================
-- Histórico/feed de atividade da campanha.
-- ============================================================
CREATE TABLE public.email_campaign_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_campaign_activity ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.email_campaign_activity TO authenticated;
GRANT ALL ON public.email_campaign_activity TO service_role;
CREATE POLICY "admin manage email_campaign_activity" ON public.email_campaign_activity
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX email_campaign_activity_campaign_idx ON public.email_campaign_activity (campaign_id, created_at DESC);

-- ============================================================
-- Log de envios — o que alimenta Resultados. Escrita só service_role
-- (cron manda; webhook da Resend atualiza status/opened_at/clicked_at).
-- ============================================================
CREATE TABLE public.email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  step_id UUID REFERENCES public.email_campaign_steps(id) ON DELETE SET NULL,
  recipient_id UUID REFERENCES public.email_campaign_recipients(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  provider_message_id TEXT,
  error TEXT,
  unsubscribe_token TEXT NOT NULL DEFAULT (gen_random_uuid()::text || gen_random_uuid()::text),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.email_sends TO authenticated;
GRANT ALL ON public.email_sends TO service_role;
CREATE POLICY "admin read email_sends" ON public.email_sends
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX email_sends_campaign_idx ON public.email_sends (campaign_id);
CREATE INDEX email_sends_step_idx ON public.email_sends (step_id);
CREATE INDEX email_sends_recipient_idx ON public.email_sends (recipient_id);
CREATE UNIQUE INDEX email_sends_unsubscribe_token_idx ON public.email_sends (unsubscribe_token);
CREATE UNIQUE INDEX email_sends_provider_message_id_idx ON public.email_sends (provider_message_id) WHERE provider_message_id IS NOT NULL;
