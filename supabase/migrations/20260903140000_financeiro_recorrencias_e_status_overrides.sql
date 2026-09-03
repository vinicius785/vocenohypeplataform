-- Overhaul do Financeiro: duas tabelas pequenas e aditivas.
-- financeiro_lancamentos (JSONB por linha) continua sendo a fonte dos
-- lançamentos manuais em si — os campos novos (status, datas, recorrência,
-- influenciadorId) entram dentro do próprio blob `data`, sem mudança de
-- schema aqui. Estas duas tabelas cobrem dois mecanismos que não cabem
-- dentro de uma única linha de lançamento.

CREATE TABLE public.financeiro_recorrencias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
CREATE INDEX financeiro_recorrencias_created_at_idx ON public.financeiro_recorrencias (created_at DESC);
CREATE TRIGGER financeiro_recorrencias_set_updated_at BEFORE UPDATE ON public.financeiro_recorrencias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.financeiro_recorrencias ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_recorrencias TO authenticated;
GRANT ALL ON public.financeiro_recorrencias TO service_role;
CREATE POLICY "financeiro read financeiro_recorrencias" ON public.financeiro_recorrencias FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro'));
CREATE POLICY "financeiro insert financeiro_recorrencias" ON public.financeiro_recorrencias FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'financeiro'));
CREATE POLICY "financeiro update financeiro_recorrencias" ON public.financeiro_recorrencias FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro')) WITH CHECK (public.has_permission(auth.uid(), 'financeiro'));
CREATE POLICY "financeiro delete financeiro_recorrencias" ON public.financeiro_recorrencias FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro'));

-- Status/pagamento de entries AUTO-GERADAS (campanha/influenciador/salário,
-- editable:false) — essas não têm linha própria em financeiro_lancamentos,
-- então precisam de um lugar equivalente ao antigo PaidMap (localStorage),
-- agora no servidor. `id` é o mesmo id sintético já usado na Entry
-- (ex. "inf:<campanhaId>:<influId>", "sal:<memberId>:<data>", "camp-rec:<campanhaId>").
CREATE TABLE public.financeiro_status_overrides (
  id TEXT NOT NULL PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
CREATE TRIGGER financeiro_status_overrides_set_updated_at BEFORE UPDATE ON public.financeiro_status_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.financeiro_status_overrides ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_status_overrides TO authenticated;
GRANT ALL ON public.financeiro_status_overrides TO service_role;
CREATE POLICY "financeiro read financeiro_status_overrides" ON public.financeiro_status_overrides FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro'));
CREATE POLICY "financeiro insert financeiro_status_overrides" ON public.financeiro_status_overrides FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'financeiro'));
CREATE POLICY "financeiro update financeiro_status_overrides" ON public.financeiro_status_overrides FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro')) WITH CHECK (public.has_permission(auth.uid(), 'financeiro'));
CREATE POLICY "financeiro delete financeiro_status_overrides" ON public.financeiro_status_overrides FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro'));
