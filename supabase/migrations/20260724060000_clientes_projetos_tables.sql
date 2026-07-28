-- Moves `clientes:lista` and `projetos:lista` off the shared_state
-- whole-array-overwrite mechanism (see src/lib/shared-sync.ts) and onto real
-- per-row tables, so a stale read by one client can no longer silently wipe
-- out changes made by everyone else in the same overwrite.
CREATE TABLE public.clientes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read clientes" ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert clientes" ON public.clientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update clientes" ON public.clientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete clientes" ON public.clientes FOR DELETE TO authenticated USING (true);

CREATE TRIGGER clientes_set_updated_at
BEFORE UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX clientes_created_at_idx ON public.clientes (created_at DESC);

CREATE TABLE public.projetos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projetos TO authenticated;
GRANT ALL ON public.projetos TO service_role;

ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read projetos" ON public.projetos FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert projetos" ON public.projetos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update projetos" ON public.projetos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete projetos" ON public.projetos FOR DELETE TO authenticated USING (true);

CREATE TRIGGER projetos_set_updated_at
BEFORE UPDATE ON public.projetos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX projetos_created_at_idx ON public.projetos (created_at DESC);

-- Backfill from the old shared_state blobs so existing data isn't lost.
INSERT INTO public.clientes (id, data)
SELECT (item->>'id')::uuid, item
FROM public.shared_state, jsonb_array_elements(data) AS item
WHERE key = 'clientes:lista'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.projetos (id, data)
SELECT (item->>'id')::uuid, item
FROM public.shared_state, jsonb_array_elements(data) AS item
WHERE key = 'projetos:lista'
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.shared_state WHERE key IN ('clientes:lista', 'projetos:lista');
