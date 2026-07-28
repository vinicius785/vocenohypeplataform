-- Snapshot do total de influenciadores planejados para a campanha (soma das
-- quantidades em VincularCampanhaDialog), exibido como KPI na página pública
-- de aprovação junto com aprovados/aguardando/reprovados.
ALTER TABLE public.influencer_approvals ADD COLUMN total_planejado INTEGER;
