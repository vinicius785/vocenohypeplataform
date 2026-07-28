
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  contact TEXT,
  email TEXT,
  phone TEXT,
  value NUMERIC NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'lead',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT,
  responsible TEXT,
  notes TEXT,
  activities JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_meeting TIMESTAMPTZ,
  source_form TEXT,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read leads" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert leads" ON public.leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update leads" ON public.leads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete leads" ON public.leads FOR DELETE TO authenticated USING (true);

CREATE TRIGGER leads_set_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX leads_created_at_idx ON public.leads (created_at DESC);
CREATE INDEX leads_stage_idx ON public.leads (stage);
