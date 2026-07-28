-- Same rationale as the previous two migrations: moves the remaining
-- per-parent shared_state keys (campanha:tasks:*, campanha:influs:*,
-- campanha:docs:*, projeto:influs:*) plus the flat marketing:tasks key off
-- the whole-array-overwrite mechanism and onto real per-row tables scoped by
-- their parent campanha/projeto id.
CREATE TABLE public.campanha_influenciadores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanha_influenciadores TO authenticated;
GRANT ALL ON public.campanha_influenciadores TO service_role;
ALTER TABLE public.campanha_influenciadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read campanha_influenciadores" ON public.campanha_influenciadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert campanha_influenciadores" ON public.campanha_influenciadores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update campanha_influenciadores" ON public.campanha_influenciadores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete campanha_influenciadores" ON public.campanha_influenciadores FOR DELETE TO authenticated USING (true);
CREATE TRIGGER campanha_influenciadores_set_updated_at
BEFORE UPDATE ON public.campanha_influenciadores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX campanha_influenciadores_campanha_id_idx ON public.campanha_influenciadores (campanha_id);

CREATE TABLE public.campanha_tarefas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanha_tarefas TO authenticated;
GRANT ALL ON public.campanha_tarefas TO service_role;
ALTER TABLE public.campanha_tarefas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read campanha_tarefas" ON public.campanha_tarefas FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert campanha_tarefas" ON public.campanha_tarefas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update campanha_tarefas" ON public.campanha_tarefas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete campanha_tarefas" ON public.campanha_tarefas FOR DELETE TO authenticated USING (true);
CREATE TRIGGER campanha_tarefas_set_updated_at
BEFORE UPDATE ON public.campanha_tarefas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX campanha_tarefas_campanha_id_idx ON public.campanha_tarefas (campanha_id);

CREATE TABLE public.campanha_documentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanha_documentos TO authenticated;
GRANT ALL ON public.campanha_documentos TO service_role;
ALTER TABLE public.campanha_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read campanha_documentos" ON public.campanha_documentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert campanha_documentos" ON public.campanha_documentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update campanha_documentos" ON public.campanha_documentos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete campanha_documentos" ON public.campanha_documentos FOR DELETE TO authenticated USING (true);
CREATE TRIGGER campanha_documentos_set_updated_at
BEFORE UPDATE ON public.campanha_documentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX campanha_documentos_campanha_id_idx ON public.campanha_documentos (campanha_id);

CREATE TABLE public.projeto_influenciadores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  projeto_id UUID NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projeto_influenciadores TO authenticated;
GRANT ALL ON public.projeto_influenciadores TO service_role;
ALTER TABLE public.projeto_influenciadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read projeto_influenciadores" ON public.projeto_influenciadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert projeto_influenciadores" ON public.projeto_influenciadores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update projeto_influenciadores" ON public.projeto_influenciadores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete projeto_influenciadores" ON public.projeto_influenciadores FOR DELETE TO authenticated USING (true);
CREATE TRIGGER projeto_influenciadores_set_updated_at
BEFORE UPDATE ON public.projeto_influenciadores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX projeto_influenciadores_projeto_id_idx ON public.projeto_influenciadores (projeto_id);

CREATE TABLE public.marketing_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_tasks TO authenticated;
GRANT ALL ON public.marketing_tasks TO service_role;
ALTER TABLE public.marketing_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read marketing_tasks" ON public.marketing_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert marketing_tasks" ON public.marketing_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update marketing_tasks" ON public.marketing_tasks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete marketing_tasks" ON public.marketing_tasks FOR DELETE TO authenticated USING (true);
CREATE TRIGGER marketing_tasks_set_updated_at
BEFORE UPDATE ON public.marketing_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX marketing_tasks_created_at_idx ON public.marketing_tasks (created_at DESC);

-- Backfill from the old shared_state blobs so existing data isn't lost.
INSERT INTO public.campanha_influenciadores (id, campanha_id, data)
SELECT (item->>'id')::uuid, (regexp_replace(key, '^campanha:influs:', ''))::uuid, item
FROM public.shared_state, jsonb_array_elements(data) AS item
WHERE key LIKE 'campanha:influs:%'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.campanha_tarefas (id, campanha_id, data)
SELECT (item->>'id')::uuid, (regexp_replace(key, '^campanha:tasks:', ''))::uuid, item
FROM public.shared_state, jsonb_array_elements(data) AS item
WHERE key LIKE 'campanha:tasks:%'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.campanha_documentos (id, campanha_id, data)
SELECT (item->>'id')::uuid, (regexp_replace(key, '^campanha:docs:', ''))::uuid, item
FROM public.shared_state, jsonb_array_elements(data) AS item
WHERE key LIKE 'campanha:docs:%'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.projeto_influenciadores (id, projeto_id, data)
SELECT (item->>'id')::uuid, (regexp_replace(key, '^projeto:influs:', ''))::uuid, item
FROM public.shared_state, jsonb_array_elements(data) AS item
WHERE key LIKE 'projeto:influs:%'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.marketing_tasks (id, data)
SELECT (item->>'id')::uuid, item
FROM public.shared_state, jsonb_array_elements(data) AS item
WHERE key = 'marketing:tasks'
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.shared_state
WHERE key LIKE 'campanha:influs:%'
   OR key LIKE 'campanha:tasks:%'
   OR key LIKE 'campanha:docs:%'
   OR key LIKE 'projeto:influs:%'
   OR key = 'marketing:tasks';
