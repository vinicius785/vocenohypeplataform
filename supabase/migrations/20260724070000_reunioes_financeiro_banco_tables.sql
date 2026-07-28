-- Same rationale as clientes/projetos (see 20260724060000): moves
-- `reunioes:list`, `financeiro:lancamentos` and `banco:influs` off the
-- shared_state whole-array-overwrite mechanism and onto real per-row
-- tables, so a stale read by one client can no longer silently wipe out
-- everyone else's changes on overwrite.
CREATE TABLE public.reunioes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reunioes TO authenticated;
GRANT ALL ON public.reunioes TO service_role;
ALTER TABLE public.reunioes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read reunioes" ON public.reunioes FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert reunioes" ON public.reunioes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update reunioes" ON public.reunioes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete reunioes" ON public.reunioes FOR DELETE TO authenticated USING (true);
CREATE TRIGGER reunioes_set_updated_at
BEFORE UPDATE ON public.reunioes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX reunioes_created_at_idx ON public.reunioes (created_at DESC);

CREATE TABLE public.financeiro_lancamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_lancamentos TO authenticated;
GRANT ALL ON public.financeiro_lancamentos TO service_role;
ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read financeiro_lancamentos" ON public.financeiro_lancamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert financeiro_lancamentos" ON public.financeiro_lancamentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update financeiro_lancamentos" ON public.financeiro_lancamentos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete financeiro_lancamentos" ON public.financeiro_lancamentos FOR DELETE TO authenticated USING (true);
CREATE TRIGGER financeiro_lancamentos_set_updated_at
BEFORE UPDATE ON public.financeiro_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX financeiro_lancamentos_created_at_idx ON public.financeiro_lancamentos (created_at DESC);

CREATE TABLE public.banco_influenciadores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banco_influenciadores TO authenticated;
GRANT ALL ON public.banco_influenciadores TO service_role;
ALTER TABLE public.banco_influenciadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read banco_influenciadores" ON public.banco_influenciadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert banco_influenciadores" ON public.banco_influenciadores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update banco_influenciadores" ON public.banco_influenciadores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete banco_influenciadores" ON public.banco_influenciadores FOR DELETE TO authenticated USING (true);
CREATE TRIGGER banco_influenciadores_set_updated_at
BEFORE UPDATE ON public.banco_influenciadores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX banco_influenciadores_created_at_idx ON public.banco_influenciadores (created_at DESC);

-- Backfill from the old shared_state blobs so existing data isn't lost.
INSERT INTO public.reunioes (id, data)
SELECT (item->>'id')::uuid, item
FROM public.shared_state, jsonb_array_elements(data) AS item
WHERE key = 'reunioes:list'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.financeiro_lancamentos (id, data)
SELECT (item->>'id')::uuid, item
FROM public.shared_state, jsonb_array_elements(data) AS item
WHERE key = 'financeiro:lancamentos'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.banco_influenciadores (id, data)
SELECT (item->>'id')::uuid, item
FROM public.shared_state, jsonb_array_elements(data) AS item
WHERE key = 'banco:influs'
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.shared_state WHERE key IN ('reunioes:list', 'financeiro:lancamentos', 'banco:influs');
