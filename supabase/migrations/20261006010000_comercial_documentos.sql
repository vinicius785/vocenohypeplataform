-- Recursos → Documentos da página Comercial: lista de links/anexos (mesmo modelo
-- `CampaignDoc` dos Documentos de campanha), em tabela própria; cada linha guarda
-- um documento em `data`. Não altera nenhuma tabela existente.
--
-- RLS (ver docs/security/rls-internal-only.md): conta de cliente do portal NÃO
-- passa — só equipe interna/admin COM a permissão "comercial".
CREATE TABLE public.comercial_documentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comercial_documentos TO authenticated;
GRANT ALL ON public.comercial_documentos TO service_role;
ALTER TABLE public.comercial_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comercial read comercial_documentos" ON public.comercial_documentos
  FOR SELECT TO authenticated
  USING ((public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()))
         AND public.has_permission(auth.uid(), 'comercial'));
CREATE POLICY "comercial insert comercial_documentos" ON public.comercial_documentos
  FOR INSERT TO authenticated
  WITH CHECK ((public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()))
              AND public.has_permission(auth.uid(), 'comercial'));
CREATE POLICY "comercial update comercial_documentos" ON public.comercial_documentos
  FOR UPDATE TO authenticated
  USING ((public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()))
         AND public.has_permission(auth.uid(), 'comercial'))
  WITH CHECK ((public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()))
              AND public.has_permission(auth.uid(), 'comercial'));
CREATE POLICY "comercial delete comercial_documentos" ON public.comercial_documentos
  FOR DELETE TO authenticated
  USING ((public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()))
         AND public.has_permission(auth.uid(), 'comercial'));

CREATE TRIGGER comercial_documentos_set_updated_at
BEFORE UPDATE ON public.comercial_documentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX comercial_documentos_created_at_idx ON public.comercial_documentos (created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.comercial_documentos;
