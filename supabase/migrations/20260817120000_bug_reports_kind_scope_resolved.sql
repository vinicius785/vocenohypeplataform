-- Estrutura o bug_reports (até então texto livre) com tipo (bug/sugestão),
-- escopo (visão do influenciador/backoffice) e status de resolução — pro
-- painel dedicado dentro do Projeto HypeApp (Projetos), que passa a exigir
-- essas duas seleções no formulário de report. Aditivo: linhas antigas
-- (do botão flutuante global, sem essas colunas) ficam com os defaults
-- ('bug', escopo nulo, não resolvido) e continuam funcionando.
ALTER TABLE public.bug_reports
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'bug' CHECK (kind IN ('bug', 'sugestao')),
  ADD COLUMN scope TEXT CHECK (scope IN ('influenciador', 'backoffice')),
  ADD COLUMN resolved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN resolved_at TIMESTAMPTZ;

-- Faltava qualquer policy de UPDATE — sem isso o toggle "marcar como
-- resolvido" nunca conseguiria gravar (RLS bloqueia por padrão).
CREATE POLICY "admins update bug reports" ON public.bug_reports
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
