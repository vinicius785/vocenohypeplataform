-- Onboarding de primeiro acesso do Portal do Cliente: "o usuário já confirmou nome, telefone e foto?"
-- Fica em `profiles` (a fonte de verdade do perfil de qualquer usuário) e acompanha a PESSOA — não o
-- navegador. NULL = ainda não concluiu. Aditivo; nenhuma política nova (cada um já edita o próprio perfil).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS portal_onboarding_completed_at timestamptz;

-- Quem já usa a plataforma não deve ver o onboarding: marca como concluído todo perfil EXISTENTE,
-- exceto quem ainda tem um convite de cliente pendente (ainda não fez o primeiro acesso).
UPDATE public.profiles p
   SET portal_onboarding_completed_at = now()
 WHERE p.portal_onboarding_completed_at IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.organization_members m
       JOIN public.organizations o ON o.id = m.organization_id
      WHERE m.user_id = p.id
        AND o.type = 'client'
        AND m.status = 'invited'
   );
