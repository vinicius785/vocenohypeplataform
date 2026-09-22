-- Upgrade dos filtros/ordenação do Pipe Comercial: hoje `leads` só tem
-- `created_at`/`updated_at` como datas reais — "tempo parado", "próxima
-- ação" e "último contato" eram todos derivados em JS a partir de
-- `extra->'history'`/`next_meeting`, o que impede ordenar/filtrar no
-- banco. Esta migration adiciona os campos como colunas reais.
--
-- `stage_entered_at`: mantido por trigger BEFORE UPDATE OF stage — só
-- muda quando a etapa realmente muda, nunca em edição de nome/valor/
-- observação (regra explícita do pedido). Backfill: para cada lead,
-- procura a entrada mais recente de `extra->'history'` com
-- type IN ('stage','created') — a mesma fonte que `daysSinceLastStageChange`
-- (`comercial-engine.ts`) já usava em JS — e usa esse timestamp; se não
-- houver nenhuma entrada de histórico (registros muito antigos, de antes
-- do histórico existir), cai em `updated_at` como aproximação documentada
-- (não finge precisão: é a melhor fonte disponível, não a real data de
-- entrada na etapa).
--
-- `last_contact_at`: sem fonte histórica confiável pra backfill (não dá
-- pra saber, olhando só pro estado atual, quando cada atividade de
-- contato foi registrada no passado sem reprocessar `activities` de cada
-- linha) — populado a partir de agora só por interações reais
-- (ligação/e-mail/reunião registrados via `upsertLead`, nunca por nota/
-- tarefa/comentário interno). Backfill parcial: quando existir ao menos
-- uma atividade do tipo ligacao/email/reuniao no array `activities`, usa
-- o `createdAt` mais recente dela como aproximação; caso contrário fica
-- NULL (nunca contatado), que é semanticamente correto mesmo sem
-- backfill.
--
-- `next_action_at`: espelha `next_meeting` (única data de ação agendada
-- que já existe hoje) — quando a próxima ação sugerida pelo motor não tem
-- data (ex. "Registrar contato"), o campo fica NULL; é uma limitação
-- documentada, não um bug (não existe hoje nenhuma fonte de data pra
-- essas ações sem prazo marcado).
--
-- `expected_close_at`/`probability`: não existe fonte alguma hoje (nunca
-- foram capturados) — adicionados como colunas reais para uso imediato
-- no formulário/filtros/ordenação, mas ficam NULL em todos os registros
-- existentes; não é inventado nenhum valor.

ALTER TABLE public.leads
  ADD COLUMN stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN last_contact_at TIMESTAMPTZ,
  ADD COLUMN next_action_at TIMESTAMPTZ,
  ADD COLUMN expected_close_at TIMESTAMPTZ,
  ADD COLUMN probability NUMERIC;

COMMENT ON COLUMN public.leads.stage_entered_at IS
  'Quando a oportunidade entrou na etapa atual (public.stage). Mantido só pelo trigger leads_set_stage_entered_at — nunca por UPDATE direto de outros campos.';
COMMENT ON COLUMN public.leads.last_contact_at IS
  'Última interação comercial real (ligação, e-mail, reunião) — nunca atualizado por nota/tarefa/comentário interno. Escrito pela aplicação (upsertLead), não por trigger, pois depende de interpretar o conteúdo de `activities` (jsonb).';
COMMENT ON COLUMN public.leads.next_action_at IS
  'Data/hora da próxima ação agendada. Hoje espelha `next_meeting` — ações sugeridas sem data marcada (ex. "Registrar contato") ficam NULL aqui, por não existir fonte de data pra elas.';
COMMENT ON COLUMN public.leads.expected_close_at IS
  'Previsão de fechamento — campo novo, sem dado histórico (NULL em registros existentes).';
COMMENT ON COLUMN public.leads.probability IS
  'Probabilidade de fechamento (0-100) — campo novo, sem dado histórico (NULL em registros existentes).';

-- Backfill stage_entered_at a partir do histórico existente em `extra`.
WITH last_stage_change AS (
  SELECT
    l.id,
    (
      SELECT MAX(to_timestamp((h->>'createdAt')::double precision / 1000.0))
      FROM jsonb_array_elements(COALESCE(l.extra->'history', '[]'::jsonb)) AS h
      WHERE h->>'type' IN ('stage', 'created')
    ) AS last_change_at
  FROM public.leads l
)
UPDATE public.leads l
SET stage_entered_at = COALESCE(lsc.last_change_at, l.updated_at)
FROM last_stage_change lsc
WHERE l.id = lsc.id;

-- Backfill last_contact_at a partir de atividades de contato real já registradas.
WITH last_contact AS (
  SELECT
    l.id,
    (
      SELECT MAX(to_timestamp((a->>'createdAt')::double precision / 1000.0))
      FROM jsonb_array_elements(COALESCE(l.activities, '[]'::jsonb)) AS a
      WHERE a->>'type' IN ('ligacao', 'email', 'reuniao')
    ) AS last_contact_at
  FROM public.leads l
)
UPDATE public.leads l
SET last_contact_at = lc.last_contact_at
FROM last_contact lc
WHERE l.id = lc.id AND lc.last_contact_at IS NOT NULL;

-- Backfill next_action_at a partir de next_meeting (única data de ação agendada existente).
UPDATE public.leads SET next_action_at = next_meeting WHERE next_meeting IS NOT NULL;

-- Trigger: stage_entered_at só muda quando a etapa realmente muda.
CREATE OR REPLACE FUNCTION public.leads_set_stage_entered_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_entered_at := now();
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_entered_at := now();
  ELSE
    NEW.stage_entered_at := OLD.stage_entered_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.leads_set_stage_entered_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER leads_set_stage_entered_at
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_set_stage_entered_at();

-- Índices para os campos mais consultados pelos novos filtros/ordenação.
CREATE INDEX leads_responsible_idx ON public.leads (responsible);
CREATE INDEX leads_updated_at_idx ON public.leads (updated_at DESC);
CREATE INDEX leads_stage_entered_at_idx ON public.leads (stage_entered_at);
CREATE INDEX leads_last_contact_at_idx ON public.leads (last_contact_at);
CREATE INDEX leads_next_action_at_idx ON public.leads (next_action_at);
CREATE INDEX leads_expected_close_at_idx ON public.leads (expected_close_at);
CREATE INDEX leads_value_idx ON public.leads (value);

-- Visualizações salvas de filtro/ordenação do Pipe Comercial — por
-- usuário, nunca compartilhada/alterando a configuração de outros
-- (RLS restringe tudo a `user_id = auth.uid()`). Guarda o estado como
-- jsonb (mesmo formato validado pela allowlist do backend na leitura,
-- nunca interpretado como SQL) em vez de colunas por filtro, porque o
-- conjunto de filtros já é este módulo que evolui rápido — mesmo
-- princípio de `workspace_settings`/`extra` já usados no projeto.
CREATE TABLE public.comercial_saved_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort TEXT NOT NULL DEFAULT 'next_action_at',
  direction TEXT NOT NULL DEFAULT 'asc',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comercial_saved_views_user_id_idx ON public.comercial_saved_views (user_id);
-- No máximo uma visualização padrão por usuário.
CREATE UNIQUE INDEX comercial_saved_views_one_default_per_user
  ON public.comercial_saved_views (user_id) WHERE is_default;

ALTER TABLE public.comercial_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own saved views select" ON public.comercial_saved_views
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own saved views insert" ON public.comercial_saved_views
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND public.has_permission(auth.uid(), 'comercial')
  );
CREATE POLICY "own saved views update" ON public.comercial_saved_views
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own saved views delete" ON public.comercial_saved_views
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER comercial_saved_views_set_updated_at
BEFORE UPDATE ON public.comercial_saved_views
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
