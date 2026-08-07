-- Nome/logo do workspace não são sensíveis (é só a marca "Você no Hype")
-- e precisam aparecer na barra superior das páginas públicas de
-- aprovação/visualização de influenciadores (/aprovacao/$token), que
-- rodam sem sessão autenticada.
GRANT SELECT ON public.workspace_settings TO anon;

CREATE POLICY "public read workspace" ON public.workspace_settings
  FOR SELECT TO anon USING (true);
