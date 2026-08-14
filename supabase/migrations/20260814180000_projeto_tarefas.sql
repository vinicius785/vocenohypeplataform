-- Tarefas de Projeto ainda viviam dentro do JSONB do projeto inteiro
-- (`projetos.data->'tasks'`), diferente de campanha_tarefas/
-- projeto_influenciadores (20260724080000), que já são per-row. Isso
-- causava perda silenciosa de tarefas: toda edição fazia upsert da linha do
-- PROJETO INTEIRO com o array de tasks local; se duas abas/pessoas
-- editassem tarefas diferentes do mesmo projeto quase ao mesmo tempo, a
-- segunda gravação sobrescrevia o array completo e apagava a tarefa que a
-- primeira acabara de criar — sem erro, sem RLS, só overwrite de array.
-- Move tasks de projeto pro mesmo padrão scoped-per-row já usado em
-- campanha_tarefas.
CREATE TABLE public.projeto_tarefas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  projeto_id UUID NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projeto_tarefas TO authenticated;
GRANT ALL ON public.projeto_tarefas TO service_role;
ALTER TABLE public.projeto_tarefas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read projeto_tarefas" ON public.projeto_tarefas FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert projeto_tarefas" ON public.projeto_tarefas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update projeto_tarefas" ON public.projeto_tarefas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete projeto_tarefas" ON public.projeto_tarefas FOR DELETE TO authenticated USING (true);
CREATE TRIGGER projeto_tarefas_set_updated_at
BEFORE UPDATE ON public.projeto_tarefas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX projeto_tarefas_projeto_id_idx ON public.projeto_tarefas (projeto_id);
ALTER TABLE public.projeto_tarefas REPLICA IDENTITY FULL;

-- Backfill: copia as tarefas que já existem hoje dentro de projetos.data.tasks
-- pra tabela nova, preservando o id de cada tarefa. Não apaga/edita
-- projetos.data — o campo "tasks" ali fica como dado morto, inofensivo, e o
-- cliente para de ler/escrever nele a partir desta versão.
INSERT INTO public.projeto_tarefas (id, projeto_id, data)
SELECT (t.value->>'id')::uuid, p.id, t.value
FROM public.projetos p, jsonb_array_elements(COALESCE(p.data->'tasks', '[]'::jsonb)) AS t(value)
WHERE t.value->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.projeto_tarefas;
