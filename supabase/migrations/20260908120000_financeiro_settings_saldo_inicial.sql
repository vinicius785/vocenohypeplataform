-- Saldo inicial do caixa (Financeiro) — singleton, mesmo padrão de
-- workspace_settings/pricing_settings. Sem isso configurado, "Saldo atual"
-- nunca deve ser calculado/exibido pela UI (mostrar "Saldo não configurado").
CREATE TABLE public.financeiro_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  saldo_inicial numeric,
  saldo_inicial_data date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.financeiro_settings TO authenticated;
GRANT ALL ON public.financeiro_settings TO service_role;
ALTER TABLE public.financeiro_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financeiro read financeiro_settings" ON public.financeiro_settings
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'financeiro'));

CREATE POLICY "financeiro update financeiro_settings" ON public.financeiro_settings
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_permission(auth.uid(), 'financeiro'));

CREATE TRIGGER financeiro_settings_updated_at
  BEFORE UPDATE ON public.financeiro_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Nasce sem saldo definido (nunca inventa um valor) — só a linha
-- singleton pra existir um alvo de UPDATE.
INSERT INTO public.financeiro_settings (id, saldo_inicial, saldo_inicial_data)
VALUES (true, NULL, NULL) ON CONFLICT (id) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.financeiro_settings;
