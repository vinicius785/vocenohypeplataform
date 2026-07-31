-- Permite gerar links "somente visualização" (foto/nome/rede social, sem
-- aprovar/reprovar) além do link de aprovação existente.
ALTER TABLE public.influencer_approvals
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'approve';

ALTER TABLE public.influencer_approvals
  ADD CONSTRAINT influencer_approvals_mode_check CHECK (mode IN ('approve', 'view'));
