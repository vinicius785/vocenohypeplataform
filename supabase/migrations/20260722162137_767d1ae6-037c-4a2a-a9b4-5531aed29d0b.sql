CREATE TABLE public.workspace_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  nome text NOT NULL DEFAULT 'Workspace',
  logo text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.workspace_settings TO authenticated;
GRANT ALL ON public.workspace_settings TO service_role;
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read workspace" ON public.workspace_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins or configuracoes update workspace" ON public.workspace_settings
  FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.permissions ? 'configuracoes'
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.permissions ? 'configuracoes'
    )
  );

CREATE TRIGGER workspace_settings_updated_at
  BEFORE UPDATE ON public.workspace_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.workspace_settings (id, nome) VALUES (true, 'Você no Hype')
  ON CONFLICT (id) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_settings;