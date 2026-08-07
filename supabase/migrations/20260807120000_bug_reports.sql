-- Relatos de bug enviados pelo botão flutuante "ENCONTROU UM BUG?",
-- visíveis apenas para admins na seção Time.
CREATE TABLE public.bug_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reporter_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  screenshot_path TEXT,
  page_context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.bug_reports TO authenticated;
GRANT ALL ON public.bug_reports TO service_role;

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own bug reports" ON public.bug_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "admins read bug reports" ON public.bug_reports
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admins delete bug reports" ON public.bug_reports
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "users upload own bug screenshots" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bug-reports' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "admins read bug screenshots" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'bug-reports' AND public.is_admin(auth.uid()));
CREATE POLICY "admins delete bug screenshots" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'bug-reports' AND public.is_admin(auth.uid()));
