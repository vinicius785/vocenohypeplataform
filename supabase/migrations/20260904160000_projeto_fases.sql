-- Fases do roadmap de um projeto — mesma forma de projeto_tarefas/
-- campanha_tarefas (jsonb por linha, escopado pelo pai), reaproveitando o
-- mesmo `createScopedArrayStore` genérico já usado por tarefas, sem
-- precisar de colunas tipadas novas. Cada linha é UMA fase; tarefas se
-- vinculam por `roadmapPhaseId` (campo dentro do jsonb da própria tarefa
-- em projeto_tarefas), nunca por uma FK física aqui — excluir uma fase
-- nunca casca para as tarefas (elas só passam a não referenciar nenhuma
-- fase existente, tratadas como "sem fase" na interface).
CREATE TABLE public.projeto_fases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  projeto_id UUID NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

CREATE INDEX projeto_fases_projeto_idx ON public.projeto_fases (projeto_id);

ALTER TABLE public.projeto_fases ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de task_dependencies (20260902130643): permissão de
-- verdade no backend, não só escondendo botão na interface.
CREATE POLICY "projeto_fases_all_authenticated" ON public.projeto_fases
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'projetos') OR public.is_admin(auth.uid()))
  WITH CHECK (public.has_permission(auth.uid(), 'projetos') OR public.is_admin(auth.uid()));
