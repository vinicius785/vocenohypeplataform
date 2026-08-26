-- Automação de e-mail (fluxos tipo Sellflux): motor genérico por
-- audiência (lead/cliente/influenciador) — matrícula, passos com
-- espera, envio via Resend (config em email_provider_settings),
-- agendamento via Vercel Cron (src/routes/api/cron/email-flows.ts).
--
-- Dois tipos de gatilho:
--   - EVENTO: os triggers abaixo, reagem na hora a um INSERT/UPDATE
--     (ex: lead mudou de etapa). Implementados como trigger de banco
--     (não como hook de app) porque leads.stage tem DOIS caminhos de
--     escrita (runOpportunityAction/updateLeadStage E o formulário
--     manual em upsertLead) — só um trigger de linha garante captura
--     dos dois sem depender de disciplina de código em vários lugares.
--   - AGENDADO: sem evento de escrita pra ancorar (ex: "3 dias antes do
--     prazo de uma entrega", que é uma data dentro de um array aninhado
--     no JSONB de campanha_influenciadores) — o próprio cron varre por
--     condição de tempo a cada execução (ver rota da API, não faz parte
--     desta migração).

-- ============================================================
-- Configuração do provedor de e-mail — singleton (mesmo padrão de
-- shared_calendar_connection): uma linha só, sem NENHUMA policy de RLS
-- pra authenticated/anon, só service_role. Editável só pela UI admin
-- (src/lib/email-flows.functions.ts), nunca em env var, pra dar pra
-- trocar sem redeploy.
-- ============================================================
CREATE TABLE public.email_provider_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  provider TEXT NOT NULL DEFAULT 'resend',
  api_key TEXT,
  from_email TEXT,
  from_name TEXT,
  reply_to TEXT,
  sending_domain TEXT,
  domain_verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_provider_settings_singleton CHECK (id)
);
ALTER TABLE public.email_provider_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.email_provider_settings TO service_role;

-- ============================================================
-- Templates de e-mail — corpo em HTML, variáveis tipo {{nome}}
-- resolvidas no envio a partir da entidade (lead/cliente/influenciador).
-- Gestão só por admin (mesmo espírito de outgoing_webhooks).
-- ============================================================
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience TEXT NOT NULL CHECK (audience IN ('lead', 'cliente', 'influenciador')),
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
-- Fluxos — gatilho + lista ordenada de passos (esperar N dias, mandar
-- Template X). steps = [{ "templateId": uuid, "waitDays": number }, ...],
-- ordem = ordem do array. Gestão só por admin.
-- ============================================================
CREATE TABLE public.email_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('lead', 'cliente', 'influenciador')),
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_flows ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.email_flows TO authenticated;
GRANT ALL ON public.email_flows TO service_role;
CREATE POLICY "admin manage email_flows" ON public.email_flows
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER email_flows_set_updated_at
BEFORE UPDATE ON public.email_flows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX email_flows_audience_trigger_idx ON public.email_flows (audience, trigger_type) WHERE active;

-- ============================================================
-- Matrículas — uma linha por (fluxo, entidade). to_email/to_name são um
-- SNAPSHOT do momento da matrícula (lead/cliente/influenciador têm
-- schemas diferentes; a partir daqui o motor de envio nunca precisa
-- saber de onde veio). next_run_at é o que o cron varre. Leitura
-- franqueada (o painel do lead/cliente/influ precisa mostrar "está
-- nesses fluxos" sem exigir admin) — ESCRITA só service_role: quem
-- cria/cancela matrícula é sempre um trigger de banco ou o job do cron,
-- nunca o cliente direto.
-- ============================================================
CREATE TABLE public.email_flow_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.email_flows(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('lead', 'cliente', 'influenciador')),
  entity_id UUID NOT NULL,
  to_email TEXT NOT NULL,
  to_name TEXT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_step_index INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  cancelled_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_flow_enrollments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.email_flow_enrollments TO authenticated;
GRANT ALL ON public.email_flow_enrollments TO service_role;
CREATE POLICY "authenticated read email_flow_enrollments" ON public.email_flow_enrollments
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER email_flow_enrollments_set_updated_at
BEFORE UPDATE ON public.email_flow_enrollments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX email_flow_enrollments_due_idx ON public.email_flow_enrollments (next_run_at) WHERE status = 'active';
CREATE INDEX email_flow_enrollments_entity_idx ON public.email_flow_enrollments (entity_type, entity_id);
-- Uma entidade só pode ter UMA matrícula ativa por fluxo por vez —
-- reentrada (ex: lead volta pra mesma etapa depois) cria uma matrícula
-- nova só depois que a anterior conclui/cancela.
CREATE UNIQUE INDEX email_flow_enrollments_unique_active ON public.email_flow_enrollments (flow_id, entity_id) WHERE status = 'active';

-- ============================================================
-- Log de envios — auditoria + onde o webhook da Resend escreve
-- open/click depois. unsubscribe_token é único por ENVIO (link de
-- descadastro assinado por e-mail enviado, não um parâmetro de endereço
-- adivinhável).
-- ============================================================
CREATE TABLE public.email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES public.email_flow_enrollments(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'bounced')),
  provider_message_id TEXT,
  error TEXT,
  unsubscribe_token TEXT NOT NULL DEFAULT (gen_random_uuid()::text || gen_random_uuid()::text),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.email_sends TO authenticated;
GRANT ALL ON public.email_sends TO service_role;
CREATE POLICY "authenticated read email_sends" ON public.email_sends
  FOR SELECT TO authenticated USING (true);
CREATE INDEX email_sends_enrollment_idx ON public.email_sends (enrollment_id);
CREATE UNIQUE INDEX email_sends_unsubscribe_token_idx ON public.email_sends (unsubscribe_token);

-- ============================================================
-- Lista de supressão global — por e-mail, não por entidade (o mesmo
-- endereço pode existir como lead e, depois, como cliente; descadastro
-- vale pra qualquer papel). Checada antes de todo envio (rota do cron)
-- e antes de toda matrícula nova (enroll_email_flow abaixo).
-- ============================================================
CREATE TABLE public.email_unsubscribes (
  email TEXT PRIMARY KEY,
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT
);
ALTER TABLE public.email_unsubscribes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.email_unsubscribes TO authenticated;
GRANT ALL ON public.email_unsubscribes TO service_role;
CREATE POLICY "authenticated read email_unsubscribes" ON public.email_unsubscribes
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- enroll_email_flow: único ponto que cria uma matrícula — chamado pelos
-- triggers de evento abaixo. SECURITY DEFINER porque authenticated não
-- tem policy de escrita em email_flow_enrollments (só service_role);
-- sem isso, o trigger de UPDATE em leads/clientes/campanha_influenciadores
-- falharia (e derrubaria a transação inteira) pra qualquer usuário
-- comum mudando a etapa de um lead. Idempotente: não duplica matrícula
-- ativa (índice único parcial) nem matricula endereço descadastrado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.enroll_email_flow(
  p_flow_id UUID, p_entity_type TEXT, p_entity_id UUID, p_email TEXT, p_name TEXT
) RETURNS void AS $$
DECLARE
  v_first_wait INTEGER;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.email_unsubscribes WHERE email = p_email) THEN RETURN; END IF;

  SELECT COALESCE((steps->0->>'waitDays')::INTEGER, 0) INTO v_first_wait
  FROM public.email_flows WHERE id = p_flow_id AND active;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.email_flow_enrollments
    (flow_id, entity_type, entity_id, to_email, to_name, next_run_at)
  VALUES
    (p_flow_id, p_entity_type, p_entity_id, p_email, p_name, now() + make_interval(days => v_first_wait))
  ON CONFLICT (flow_id, entity_id) WHERE status = 'active' DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.enroll_email_flow(UUID, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Gatilhos de EVENTO — leads
-- ============================================================
CREATE OR REPLACE FUNCTION public.email_flows_leads_trigger() RETURNS trigger AS $$
DECLARE
  v_flow RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR v_flow IN
      SELECT id FROM public.email_flows
      WHERE audience = 'lead' AND trigger_type = 'lead_created' AND active
    LOOP
      PERFORM public.enroll_email_flow(v_flow.id, 'lead', NEW.id, NEW.email, NEW.name);
    END LOOP;
    RETURN NEW;
  END IF;

  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    FOR v_flow IN
      SELECT id FROM public.email_flows
      WHERE audience = 'lead' AND trigger_type = 'stage_entered' AND active
        AND trigger_config->>'stage' = NEW.stage
    LOOP
      PERFORM public.enroll_email_flow(v_flow.id, 'lead', NEW.id, NEW.email, NEW.name);
    END LOOP;

    -- Lead saiu do estado que originou uma matrícula — cancela, evita
    -- mandar "lembrete de proposta" pra quem já foi marcado Perdido.
    UPDATE public.email_flow_enrollments e
    SET status = 'cancelled', cancelled_reason = 'lead mudou de etapa'
    FROM public.email_flows f
    WHERE e.flow_id = f.id AND e.entity_type = 'lead' AND e.entity_id = NEW.id
      AND e.status = 'active' AND f.trigger_type = 'stage_entered'
      AND f.trigger_config->>'stage' = OLD.stage;
  END IF;

  IF OLD.tags IS DISTINCT FROM NEW.tags THEN
    FOR v_flow IN
      SELECT id FROM public.email_flows
      WHERE audience = 'lead' AND trigger_type = 'tag_added' AND active
        AND NEW.tags ? (trigger_config->>'tag')
        AND NOT (OLD.tags ? (trigger_config->>'tag'))
    LOOP
      PERFORM public.enroll_email_flow(v_flow.id, 'lead', NEW.id, NEW.email, NEW.name);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.email_flows_leads_trigger() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER email_flows_leads_insert
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.email_flows_leads_trigger();

CREATE TRIGGER email_flows_leads_update
AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.email_flows_leads_trigger();

-- ============================================================
-- Gatilhos de EVENTO — clientes (data JSONB; só "cliente_created" faz
-- sentido hoje, schema não tem tag/status/data de renovação).
-- ============================================================
CREATE OR REPLACE FUNCTION public.email_flows_clientes_trigger() RETURNS trigger AS $$
DECLARE
  v_flow RECORD;
BEGIN
  FOR v_flow IN
    SELECT id FROM public.email_flows
    WHERE audience = 'cliente' AND trigger_type = 'cliente_created' AND active
  LOOP
    PERFORM public.enroll_email_flow(v_flow.id, 'cliente', NEW.id, NEW.data->>'email', NEW.data->>'empresa');
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.email_flows_clientes_trigger() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER email_flows_clientes_insert
AFTER INSERT ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.email_flows_clientes_trigger();

-- ============================================================
-- Gatilhos de EVENTO — campanha_influenciadores (data JSONB; status vive
-- só dentro do blob, sem coluna própria).
-- ============================================================
CREATE OR REPLACE FUNCTION public.email_flows_influenciadores_trigger() RETURNS trigger AS $$
DECLARE
  v_flow RECORD;
  v_status TEXT;
  v_old_status TEXT;
BEGIN
  v_status := NEW.data->>'status';
  v_old_status := CASE WHEN TG_OP = 'UPDATE' THEN OLD.data->>'status' ELSE NULL END;

  IF v_status IS DISTINCT FROM v_old_status THEN
    FOR v_flow IN
      SELECT id FROM public.email_flows
      WHERE audience = 'influenciador' AND trigger_type = 'influenciador_status' AND active
        AND trigger_config->>'status' = v_status
    LOOP
      PERFORM public.enroll_email_flow(v_flow.id, 'influenciador', NEW.id, NEW.data->>'email', NEW.data->>'nome');
    END LOOP;

    IF v_old_status IS NOT NULL THEN
      UPDATE public.email_flow_enrollments e
      SET status = 'cancelled', cancelled_reason = 'status do influenciador mudou'
      FROM public.email_flows f
      WHERE e.flow_id = f.id AND e.entity_type = 'influenciador' AND e.entity_id = NEW.id
        AND e.status = 'active' AND f.trigger_type = 'influenciador_status'
        AND f.trigger_config->>'status' = v_old_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.email_flows_influenciadores_trigger() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER email_flows_influenciadores_insert_update
AFTER INSERT OR UPDATE ON public.campanha_influenciadores
FOR EACH ROW EXECUTE FUNCTION public.email_flows_influenciadores_trigger();
