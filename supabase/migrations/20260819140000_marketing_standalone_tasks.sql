-- Tarefas "avulsas" do Marketing (criadas direto no kanban, não puxadas de
-- projeto/campanha) viviam só em localStorage ("marketing:standalone") —
-- sem sincronizar entre dispositivos/pessoas e sumindo de vez se o
-- navegador limpasse os dados. Move pra uma tabela per-row de verdade,
-- mesmo padrão de marketing_tasks (que já guarda só as referências).
CREATE TABLE public.marketing_standalone_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_standalone_tasks TO authenticated;
GRANT ALL ON public.marketing_standalone_tasks TO service_role;
ALTER TABLE public.marketing_standalone_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read marketing_standalone_tasks" ON public.marketing_standalone_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert marketing_standalone_tasks" ON public.marketing_standalone_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update marketing_standalone_tasks" ON public.marketing_standalone_tasks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete marketing_standalone_tasks" ON public.marketing_standalone_tasks FOR DELETE TO authenticated USING (true);
CREATE TRIGGER marketing_standalone_tasks_set_updated_at
BEFORE UPDATE ON public.marketing_standalone_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX marketing_standalone_tasks_created_at_idx ON public.marketing_standalone_tasks (created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.marketing_standalone_tasks;
