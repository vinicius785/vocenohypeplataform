-- INCIDENTE DE PRODUÇÃO (2026-09-18): a política "organization_members
-- select client admin peers" (criada na Fase 2a, migração
-- 20260918170000_access_audit_log.sql — na verdade adicionada por engano
-- numa migração anterior à criação dessa tabela de auditoria, mas o efeito
-- é o mesmo) fazia uma subquery em `organization_members` DENTRO da
-- própria política de RLS de `organization_members`:
--
--   USING (EXISTS (
--     SELECT 1 FROM organization_members me
--     WHERE me.user_id = auth.uid() AND me.organization_id = organization_members.organization_id
--       AND me.role = 'client_admin' AND me.status = 'active'
--   ))
--
-- Isso causa "infinite recursion detected in policy for relation
-- organization_members" em QUALQUER leitura dessa tabela — inclusive a
-- chamada de `resolveUserEnvironment()` no login de todo mundo (time e
-- clientes), derrubando a plataforma inteira. Corrigido movendo a checagem
-- para uma função SECURITY DEFINER (mesmo padrão já usado por is_admin()/
-- has_permission()), que executa fora do contexto de RLS do chamador e
-- portanto não recursa.

CREATE OR REPLACE FUNCTION public.is_active_client_admin_of(uid uuid, org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = uid
      AND organization_id = org_id
      AND role = 'client_admin'
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_client_admin_of(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_active_client_admin_of(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "organization_members select client admin peers" ON public.organization_members;

CREATE POLICY "organization_members select client admin peers" ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.is_active_client_admin_of(auth.uid(), organization_id));
