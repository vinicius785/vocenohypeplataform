-- Cronograma manual da campanha (data + título + descrição), editável pelo
-- time e mostrado tanto internamente quanto no portal do cliente — mesmo
-- padrão de campanha_documentos/campanha_tarefas (20260724080000).
CREATE TABLE public.campanha_cronograma (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanha_cronograma TO authenticated;
GRANT ALL ON public.campanha_cronograma TO service_role;
ALTER TABLE public.campanha_cronograma ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read campanha_cronograma" ON public.campanha_cronograma FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert campanha_cronograma" ON public.campanha_cronograma FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update campanha_cronograma" ON public.campanha_cronograma FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete campanha_cronograma" ON public.campanha_cronograma FOR DELETE TO authenticated USING (true);
CREATE TRIGGER campanha_cronograma_set_updated_at
BEFORE UPDATE ON public.campanha_cronograma
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX campanha_cronograma_campanha_id_idx ON public.campanha_cronograma (campanha_id);
