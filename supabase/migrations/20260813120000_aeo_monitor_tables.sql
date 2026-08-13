-- Biblioteca de Prompts / AEO Monitor (aba nova no projeto Marketing) —
-- mesmo padrão de tabela por-linha já usado em metas/reunioes/etc: uma
-- linha por prompt e uma linha por resposta (prompt × IA × rodada), sem
-- overwrite de array inteiro.
CREATE TABLE public.aeo_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aeo_prompts TO authenticated;
GRANT ALL ON public.aeo_prompts TO service_role;
ALTER TABLE public.aeo_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read aeo_prompts" ON public.aeo_prompts FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert aeo_prompts" ON public.aeo_prompts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update aeo_prompts" ON public.aeo_prompts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete aeo_prompts" ON public.aeo_prompts FOR DELETE TO authenticated USING (true);
CREATE TRIGGER aeo_prompts_set_updated_at
BEFORE UPDATE ON public.aeo_prompts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX aeo_prompts_created_at_idx ON public.aeo_prompts (created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.aeo_prompts;

CREATE TABLE public.aeo_respostas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aeo_respostas TO authenticated;
GRANT ALL ON public.aeo_respostas TO service_role;
ALTER TABLE public.aeo_respostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read aeo_respostas" ON public.aeo_respostas FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert aeo_respostas" ON public.aeo_respostas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update aeo_respostas" ON public.aeo_respostas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete aeo_respostas" ON public.aeo_respostas FOR DELETE TO authenticated USING (true);
CREATE TRIGGER aeo_respostas_set_updated_at
BEFORE UPDATE ON public.aeo_respostas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX aeo_respostas_created_at_idx ON public.aeo_respostas (created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.aeo_respostas;
