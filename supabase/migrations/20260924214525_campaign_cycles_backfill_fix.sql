-- Corrige o backfill da migration anterior: a UPDATE dentro do mesmo WITH
-- não enxergava as linhas recém-inseridas em `campaign_cycles` (CTEs
-- compartilham o snapshot do início da query). Reaplicada aqui como
-- consulta separada; idempotente (só afeta linhas com campaign_cycle_id
-- ainda NULL). A migration `campaign_cycles` já foi corrigida em código
-- pra próximas instalações não precisarem deste arquivo.
UPDATE public.campanha_influenciadores AS ci
SET campaign_cycle_id = cc.id
FROM public.campaign_cycles cc
WHERE cc.campanha_id = ci.campanha_id
  AND ci.data->>'cicloMes' ~ '^\d{4}-\d{2}$'
  AND cc.competence_year = split_part(ci.data->>'cicloMes', '-', 1)::int
  AND cc.competence_month = split_part(ci.data->>'cicloMes', '-', 2)::int
  AND ci.campaign_cycle_id IS NULL;
