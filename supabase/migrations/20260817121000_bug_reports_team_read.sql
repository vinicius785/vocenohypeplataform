-- O painel de Bugs & Sugestões dentro do Projeto HypeApp é um board do
-- time inteiro (não só admins) — sem isso, qualquer membro não-admin
-- conseguia reportar (INSERT já era liberado) mas não via a própria lista
-- (SELECT era admin-only). Update/Delete continuam restritos a admin.
CREATE POLICY "authenticated read bug reports" ON public.bug_reports
  FOR SELECT TO authenticated USING (true);
