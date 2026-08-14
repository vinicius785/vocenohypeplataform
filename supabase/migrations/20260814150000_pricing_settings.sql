-- Precificação de pacotes de influenciadores (simulador de proposta, Comercial):
-- percentuais fixos da agência + matriz de custo médio por Tier×Formato.
-- Singleton, mesmo padrão de workspace_settings (20260722162137).
CREATE TABLE public.pricing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  imposto_pct numeric NOT NULL DEFAULT 0.085,
  comissao_pct numeric NOT NULL DEFAULT 0.05,
  bonificacao_pct numeric NOT NULL DEFAULT 0.03,
  margem_pct numeric NOT NULL DEFAULT 0.30,
  custos_tier jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.pricing_settings TO authenticated;
GRANT ALL ON public.pricing_settings TO service_role;
ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read pricing" ON public.pricing_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins or configuracoes update pricing" ON public.pricing_settings
  FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.permissions ? 'configuracoes'
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.permissions ? 'configuracoes'
    )
  );

CREATE TRIGGER pricing_settings_updated_at
  BEFORE UPDATE ON public.pricing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Valores-padrão a partir da planilha "Calculadora custos op" (Custos por
-- Tier), pra já nascer utilizável sem precisar preencher tudo do zero.
INSERT INTO public.pricing_settings (id, custos_tier) VALUES (true, '{
  "ugc": {"pacote_basico": 1000},
  "nano": {"feed_post": 200, "stories_3x": 90, "reels_video": 300, "pacote_basico": 350},
  "nano_plus": {"feed_post": 300, "stories_3x": 120, "reels_video": 450, "pacote_basico": 500},
  "micro": {"feed_post": 450, "stories_3x": 180, "reels_video": 650, "pacote_basico": 750},
  "micro_plus": {"feed_post": 700, "stories_3x": 250, "reels_video": 1000, "pacote_basico": 1200},
  "mid_tier": {"feed_post": 1200, "stories_3x": 400, "reels_video": 1800, "pacote_basico": 2000},
  "mid_tier_plus": {"feed_post": 1800, "stories_3x": 550, "reels_video": 2500, "pacote_basico": 2800},
  "macro": {"feed_post": 2800, "stories_3x": 800, "reels_video": 3000, "pacote_basico": 3500},
  "macro_plus": {"feed_post": 2800, "stories_3x": 800, "reels_video": 3000, "pacote_basico": 3500},
  "mega": {"feed_post": 3000, "stories_3x": 1500, "reels_video": 3500, "pacote_basico": 4000},
  "top": {"feed_post": 6000, "stories_3x": 4000, "reels_video": 8000, "pacote_basico": 10000},
  "platinum": {"feed_post": 15000, "stories_3x": 3500, "reels_video": 20000, "pacote_basico": 24000}
}'::jsonb) ON CONFLICT (id) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.pricing_settings;
