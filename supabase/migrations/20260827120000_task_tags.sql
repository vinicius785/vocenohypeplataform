-- Etiquetas de tarefa (TaskBoard) viviam só como texto livre dentro de
-- cada tarefa (`tags: string[]`) — sem registro nenhum, então não dava
-- pra reaproveitar o nome exato nem editar a cor de uma etiqueta pra
-- todo mundo de uma vez (estilo ClickUp). Essa tabela é o REGISTRO
-- compartilhado (nome + cor); a tarefa continua só guardando o nome em
-- `tags: string[]` — a cor é sempre resolvida na hora daqui.
CREATE TABLE public.task_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_tags TO authenticated;
GRANT ALL ON public.task_tags TO service_role;
ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read task_tags" ON public.task_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert task_tags" ON public.task_tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update task_tags" ON public.task_tags FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete task_tags" ON public.task_tags FOR DELETE TO authenticated USING (true);
CREATE TRIGGER task_tags_set_updated_at
BEFORE UPDATE ON public.task_tags
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX task_tags_created_at_idx ON public.task_tags (created_at ASC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_tags;
