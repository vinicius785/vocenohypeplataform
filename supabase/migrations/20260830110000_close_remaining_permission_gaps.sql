-- Fecha os 4 gaps remanescentes de "permissão só no cliente": clientes,
-- projeto_tarefas, marketing_standalone_tasks e metas ainda tinham
-- policies `USING (true)` — qualquer usuário autenticado, independente
-- de permissão, lia/escrevia essas 4 tabelas via chamada direta ao
-- Supabase. As demais tabelas do mesmo grupo (campanha_*, financeiro_
-- lancamentos, leads, projetos, reunioes, banco_influenciadores,
-- marketing_tasks) já usavam has_permission() de uma rodada anterior
-- (20260729190000_permission_scoped_rls.sql).

-- clientes: campanha vive dentro da própria linha do cliente (JSONB),
-- então tanto quem tem "clientes" quanto quem tem "campanhas" precisa
-- continuar lendo/escrevendo essa tabela — union das duas permissões
-- (mesma limitação já documentada em permissions.ts, não resolvida
-- aqui: RLS não separa "editar cliente" de "editar campanha" dentro da
-- mesma linha, só bloqueia quem não tem NENHUMA das duas).
DROP POLICY IF EXISTS "authenticated read clientes" ON public.clientes;
DROP POLICY IF EXISTS "authenticated insert clientes" ON public.clientes;
DROP POLICY IF EXISTS "authenticated update clientes" ON public.clientes;
DROP POLICY IF EXISTS "authenticated delete clientes" ON public.clientes;

CREATE POLICY "clientes/campanhas read clientes" ON public.clientes
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'clientes') OR has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "clientes/campanhas insert clientes" ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'clientes') OR has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "clientes/campanhas update clientes" ON public.clientes
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'clientes') OR has_permission(auth.uid(), 'campanhas'))
  WITH CHECK (has_permission(auth.uid(), 'clientes') OR has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "clientes/campanhas delete clientes" ON public.clientes
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'clientes') OR has_permission(auth.uid(), 'campanhas'));

-- projeto_tarefas: mesma permissão que já protege a tabela `projetos`.
DROP POLICY IF EXISTS "authenticated read projeto_tarefas" ON public.projeto_tarefas;
DROP POLICY IF EXISTS "authenticated insert projeto_tarefas" ON public.projeto_tarefas;
DROP POLICY IF EXISTS "authenticated update projeto_tarefas" ON public.projeto_tarefas;
DROP POLICY IF EXISTS "authenticated delete projeto_tarefas" ON public.projeto_tarefas;

CREATE POLICY "projetos read projeto_tarefas" ON public.projeto_tarefas
  FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'projetos'));
CREATE POLICY "projetos insert projeto_tarefas" ON public.projeto_tarefas
  FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'projetos'));
CREATE POLICY "projetos update projeto_tarefas" ON public.projeto_tarefas
  FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'projetos')) WITH CHECK (has_permission(auth.uid(), 'projetos'));
CREATE POLICY "projetos delete projeto_tarefas" ON public.projeto_tarefas
  FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'projetos'));

-- marketing_standalone_tasks: só é acessada via MarketingSection.tsx,
-- montado em /projeto/$id — mesma permissão "projetos" que já protege
-- essa rota (não "campanhas": o board de Marketing é um projeto, não
-- uma campanha, mesmo puxando referências dos dois).
DROP POLICY IF EXISTS "authenticated read marketing_standalone_tasks" ON public.marketing_standalone_tasks;
DROP POLICY IF EXISTS "authenticated insert marketing_standalone_tasks" ON public.marketing_standalone_tasks;
DROP POLICY IF EXISTS "authenticated update marketing_standalone_tasks" ON public.marketing_standalone_tasks;
DROP POLICY IF EXISTS "authenticated delete marketing_standalone_tasks" ON public.marketing_standalone_tasks;

CREATE POLICY "projetos read marketing_standalone_tasks" ON public.marketing_standalone_tasks
  FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'projetos'));
CREATE POLICY "projetos insert marketing_standalone_tasks" ON public.marketing_standalone_tasks
  FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'projetos'));
CREATE POLICY "projetos update marketing_standalone_tasks" ON public.marketing_standalone_tasks
  FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'projetos')) WITH CHECK (has_permission(auth.uid(), 'projetos'));
CREATE POLICY "projetos delete marketing_standalone_tasks" ON public.marketing_standalone_tasks
  FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'projetos'));

-- metas: permissão dedicada, já existente em permissions.ts.
DROP POLICY IF EXISTS "authenticated read metas" ON public.metas;
DROP POLICY IF EXISTS "authenticated insert metas" ON public.metas;
DROP POLICY IF EXISTS "authenticated update metas" ON public.metas;
DROP POLICY IF EXISTS "authenticated delete metas" ON public.metas;

CREATE POLICY "metas read metas" ON public.metas
  FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'metas'));
CREATE POLICY "metas insert metas" ON public.metas
  FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'metas'));
CREATE POLICY "metas update metas" ON public.metas
  FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'metas')) WITH CHECK (has_permission(auth.uid(), 'metas'));
CREATE POLICY "metas delete metas" ON public.metas
  FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'metas'));
