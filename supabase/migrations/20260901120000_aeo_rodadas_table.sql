-- Rodadas do AEO Monitor como entidade real (antes, a "rodada" era só uma
-- string de data solta dentro de aeo_respostas.rodadaData — sem linha
-- própria, sem histórico confiável). Mesmo padrão de tabela por-linha já
-- usado em aeo_prompts/aeo_respostas.
CREATE TABLE public.aeo_rodadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aeo_rodadas TO authenticated;
GRANT ALL ON public.aeo_rodadas TO service_role;
ALTER TABLE public.aeo_rodadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read aeo_rodadas" ON public.aeo_rodadas FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert aeo_rodadas" ON public.aeo_rodadas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update aeo_rodadas" ON public.aeo_rodadas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete aeo_rodadas" ON public.aeo_rodadas FOR DELETE TO authenticated USING (true);
CREATE TRIGGER aeo_rodadas_set_updated_at
BEFORE UPDATE ON public.aeo_rodadas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX aeo_rodadas_created_at_idx ON public.aeo_rodadas (created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.aeo_rodadas;
