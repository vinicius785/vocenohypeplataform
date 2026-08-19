-- "Esqueci minha senha" na tela de login — esta plataforma não tem fluxo
-- de e-mail de recuperação (contas são geridas pelo admin via
-- team.functions.ts::resetMemberPassword), então o pedido só registra
-- a solicitação e avisa os admins (push), que resetam manualmente.
-- Inserção só via service-role (server function pública, sem sessão) —
-- por isso não existe policy de INSERT pra authenticated/anon.
CREATE TABLE public.password_reset_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.password_reset_requests TO authenticated;
GRANT ALL ON public.password_reset_requests TO service_role;
CREATE POLICY "admins read password reset requests" ON public.password_reset_requests
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admins update password reset requests" ON public.password_reset_requests
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
ALTER PUBLICATION supabase_realtime ADD TABLE public.password_reset_requests;
