-- Até aqui, as permissões por seção marcadas na tela de criação/edição de
-- membro (Time > Novo membro) eram só cosméticas: só decidiam o que aparecia
-- na UI, mas qualquer usuário autenticado tinha CRUD completo em todas essas
-- tabelas via RLS `USING (true)`. Isso passa a checar de verdade a permissão
-- do usuário (ou admin) para ler/escrever nelas.
--
-- Fora de escopo aqui (documentado, não silencioso): `clientes` e
-- `shared_state` continuam sem esse enforcement — hoje os dados de campanha
-- vivem embutidos dentro da linha do cliente (`clientes.data`), então gatear
-- a tabela `clientes` pela permissão "clientes" também bloquearia quem só
-- tem a permissão "campanhas" (e vice-versa). Isso exige separar esse dado
-- em tabelas próprias antes de poder aplicar RLS por permissão sem quebrar o
-- outro caso — por ora essas duas seções continuam protegidas só no cliente
-- (menu "apagado" + tela bloqueada).

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.permissions ? _permission
  );
$$;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;

-- leads (Comercial)
DROP POLICY IF EXISTS "authenticated read leads" ON public.leads;
DROP POLICY IF EXISTS "authenticated insert leads" ON public.leads;
DROP POLICY IF EXISTS "authenticated update leads" ON public.leads;
DROP POLICY IF EXISTS "authenticated delete leads" ON public.leads;
CREATE POLICY "comercial read leads" ON public.leads FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'comercial'));
CREATE POLICY "comercial insert leads" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'comercial'));
CREATE POLICY "comercial update leads" ON public.leads FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'comercial'))
  WITH CHECK (public.has_permission(auth.uid(), 'comercial'));
CREATE POLICY "comercial delete leads" ON public.leads FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'comercial'));

-- financeiro_lancamentos (Financeiro)
DROP POLICY IF EXISTS "authenticated read financeiro_lancamentos" ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS "authenticated insert financeiro_lancamentos" ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS "authenticated update financeiro_lancamentos" ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS "authenticated delete financeiro_lancamentos" ON public.financeiro_lancamentos;
CREATE POLICY "financeiro read financeiro_lancamentos" ON public.financeiro_lancamentos FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro'));
CREATE POLICY "financeiro insert financeiro_lancamentos" ON public.financeiro_lancamentos FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'financeiro'));
CREATE POLICY "financeiro update financeiro_lancamentos" ON public.financeiro_lancamentos FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_permission(auth.uid(), 'financeiro'));
CREATE POLICY "financeiro delete financeiro_lancamentos" ON public.financeiro_lancamentos FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro'));

-- banco_influenciadores (Banco de influenciadores)
DROP POLICY IF EXISTS "authenticated read banco_influenciadores" ON public.banco_influenciadores;
DROP POLICY IF EXISTS "authenticated insert banco_influenciadores" ON public.banco_influenciadores;
DROP POLICY IF EXISTS "authenticated update banco_influenciadores" ON public.banco_influenciadores;
DROP POLICY IF EXISTS "authenticated delete banco_influenciadores" ON public.banco_influenciadores;
CREATE POLICY "influenciadores read banco_influenciadores" ON public.banco_influenciadores FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'influenciadores'));
CREATE POLICY "influenciadores insert banco_influenciadores" ON public.banco_influenciadores FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'influenciadores'));
CREATE POLICY "influenciadores update banco_influenciadores" ON public.banco_influenciadores FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'influenciadores'))
  WITH CHECK (public.has_permission(auth.uid(), 'influenciadores'));
CREATE POLICY "influenciadores delete banco_influenciadores" ON public.banco_influenciadores FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'influenciadores'));

-- reunioes (Reuniões)
DROP POLICY IF EXISTS "authenticated read reunioes" ON public.reunioes;
DROP POLICY IF EXISTS "authenticated insert reunioes" ON public.reunioes;
DROP POLICY IF EXISTS "authenticated update reunioes" ON public.reunioes;
DROP POLICY IF EXISTS "authenticated delete reunioes" ON public.reunioes;
CREATE POLICY "reunioes read reunioes" ON public.reunioes FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'reunioes'));
CREATE POLICY "reunioes insert reunioes" ON public.reunioes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'reunioes'));
CREATE POLICY "reunioes update reunioes" ON public.reunioes FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'reunioes'))
  WITH CHECK (public.has_permission(auth.uid(), 'reunioes'));
CREATE POLICY "reunioes delete reunioes" ON public.reunioes FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'reunioes'));

-- projetos (Projetos)
DROP POLICY IF EXISTS "authenticated read projetos" ON public.projetos;
DROP POLICY IF EXISTS "authenticated insert projetos" ON public.projetos;
DROP POLICY IF EXISTS "authenticated update projetos" ON public.projetos;
DROP POLICY IF EXISTS "authenticated delete projetos" ON public.projetos;
CREATE POLICY "projetos read projetos" ON public.projetos FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'projetos'));
CREATE POLICY "projetos insert projetos" ON public.projetos FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'projetos'));
CREATE POLICY "projetos update projetos" ON public.projetos FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'projetos'))
  WITH CHECK (public.has_permission(auth.uid(), 'projetos'));
CREATE POLICY "projetos delete projetos" ON public.projetos FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'projetos'));

-- projeto_influenciadores (parte de Projetos)
DROP POLICY IF EXISTS "authenticated read projeto_influenciadores" ON public.projeto_influenciadores;
DROP POLICY IF EXISTS "authenticated insert projeto_influenciadores" ON public.projeto_influenciadores;
DROP POLICY IF EXISTS "authenticated update projeto_influenciadores" ON public.projeto_influenciadores;
DROP POLICY IF EXISTS "authenticated delete projeto_influenciadores" ON public.projeto_influenciadores;
CREATE POLICY "projetos read projeto_influenciadores" ON public.projeto_influenciadores FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'projetos'));
CREATE POLICY "projetos insert projeto_influenciadores" ON public.projeto_influenciadores FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'projetos'));
CREATE POLICY "projetos update projeto_influenciadores" ON public.projeto_influenciadores FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'projetos'))
  WITH CHECK (public.has_permission(auth.uid(), 'projetos'));
CREATE POLICY "projetos delete projeto_influenciadores" ON public.projeto_influenciadores FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'projetos'));

-- campanha_influenciadores / campanha_tarefas / campanha_documentos / marketing_tasks (Campanhas)
DROP POLICY IF EXISTS "authenticated read campanha_influenciadores" ON public.campanha_influenciadores;
DROP POLICY IF EXISTS "authenticated insert campanha_influenciadores" ON public.campanha_influenciadores;
DROP POLICY IF EXISTS "authenticated update campanha_influenciadores" ON public.campanha_influenciadores;
DROP POLICY IF EXISTS "authenticated delete campanha_influenciadores" ON public.campanha_influenciadores;
CREATE POLICY "campanhas read campanha_influenciadores" ON public.campanha_influenciadores FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas insert campanha_influenciadores" ON public.campanha_influenciadores FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas update campanha_influenciadores" ON public.campanha_influenciadores FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'))
  WITH CHECK (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas delete campanha_influenciadores" ON public.campanha_influenciadores FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'));

DROP POLICY IF EXISTS "authenticated read campanha_tarefas" ON public.campanha_tarefas;
DROP POLICY IF EXISTS "authenticated insert campanha_tarefas" ON public.campanha_tarefas;
DROP POLICY IF EXISTS "authenticated update campanha_tarefas" ON public.campanha_tarefas;
DROP POLICY IF EXISTS "authenticated delete campanha_tarefas" ON public.campanha_tarefas;
CREATE POLICY "campanhas read campanha_tarefas" ON public.campanha_tarefas FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas insert campanha_tarefas" ON public.campanha_tarefas FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas update campanha_tarefas" ON public.campanha_tarefas FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'))
  WITH CHECK (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas delete campanha_tarefas" ON public.campanha_tarefas FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'));

DROP POLICY IF EXISTS "authenticated read campanha_documentos" ON public.campanha_documentos;
DROP POLICY IF EXISTS "authenticated insert campanha_documentos" ON public.campanha_documentos;
DROP POLICY IF EXISTS "authenticated update campanha_documentos" ON public.campanha_documentos;
DROP POLICY IF EXISTS "authenticated delete campanha_documentos" ON public.campanha_documentos;
CREATE POLICY "campanhas read campanha_documentos" ON public.campanha_documentos FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas insert campanha_documentos" ON public.campanha_documentos FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas update campanha_documentos" ON public.campanha_documentos FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'))
  WITH CHECK (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas delete campanha_documentos" ON public.campanha_documentos FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'));

DROP POLICY IF EXISTS "authenticated read marketing_tasks" ON public.marketing_tasks;
DROP POLICY IF EXISTS "authenticated insert marketing_tasks" ON public.marketing_tasks;
DROP POLICY IF EXISTS "authenticated update marketing_tasks" ON public.marketing_tasks;
DROP POLICY IF EXISTS "authenticated delete marketing_tasks" ON public.marketing_tasks;
CREATE POLICY "campanhas read marketing_tasks" ON public.marketing_tasks FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas insert marketing_tasks" ON public.marketing_tasks FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas update marketing_tasks" ON public.marketing_tasks FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'))
  WITH CHECK (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas delete marketing_tasks" ON public.marketing_tasks FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'));
