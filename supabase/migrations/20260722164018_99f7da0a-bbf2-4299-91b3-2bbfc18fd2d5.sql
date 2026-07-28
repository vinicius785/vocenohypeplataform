CREATE TABLE public.shared_state (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_state TO authenticated;
GRANT ALL ON public.shared_state TO service_role;
ALTER TABLE public.shared_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read shared" ON public.shared_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert shared" ON public.shared_state FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update shared" ON public.shared_state FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete shared" ON public.shared_state FOR DELETE TO authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_state;