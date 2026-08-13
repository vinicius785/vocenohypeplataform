-- Metas do time (seção "Metas", dentro do grupo Estrutura) — mesmo padrão
-- de tabela por-linha já usado em reunioes/financeiro_lancamentos/
-- banco_influenciadores (20260724070000): uma linha por meta, sem
-- overwrite de array inteiro.
CREATE TABLE public.metas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas TO authenticated;
GRANT ALL ON public.metas TO service_role;
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read metas" ON public.metas FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert metas" ON public.metas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update metas" ON public.metas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete metas" ON public.metas FOR DELETE TO authenticated USING (true);
CREATE TRIGGER metas_set_updated_at
BEFORE UPDATE ON public.metas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX metas_created_at_idx ON public.metas (created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.metas;
