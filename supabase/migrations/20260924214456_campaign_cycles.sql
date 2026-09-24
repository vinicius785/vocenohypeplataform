-- Modela explicitamente a competência (mês operacional) de campanhas
-- recorrentes, substituindo a heurística implícita e insegura
-- `Influ.cicloMes ?? Influ.createdAt` (ver CampanhasSection.tsx / rotas do
-- portal V1) por uma relação real. Aditivo e não destrutivo:
--
-- - `campaign_cycles` é uma tabela nova.
-- - `campaign_cycle_id` em `campanha_influenciadores` é uma coluna NOVA,
--   NULLABLE — nenhuma linha existente é obrigada a ter um ciclo.
-- - O backfill abaixo só cria ciclos e só associa influenciadores que já
--   têm um `cicloMes` explícito e válido gravado em `data`. Influenciadores
--   sem `cicloMes` (ou com valor não reconhecível como "YYYY-MM") ficam
--   com `campaign_cycle_id` NULL — não adivinhamos o mês deles a partir de
--   `created_at` nem de nenhuma outra heurística. Ficam sinalizados pra
--   revisão manual do time (ver view `campanha_influenciadores_sem_ciclo`).
CREATE TABLE public.campaign_cycles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID NOT NULL,
  competence_year INT NOT NULL,
  competence_month INT NOT NULL CHECK (competence_month BETWEEN 1 AND 12),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campanha_id, competence_year, competence_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_cycles TO authenticated;
GRANT ALL ON public.campaign_cycles TO service_role;
ALTER TABLE public.campaign_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campanhas read campaign_cycles" ON public.campaign_cycles FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas insert campaign_cycles" ON public.campaign_cycles FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas update campaign_cycles" ON public.campaign_cycles FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'))
  WITH CHECK (public.has_permission(auth.uid(), 'campanhas'));
CREATE POLICY "campanhas delete campaign_cycles" ON public.campaign_cycles FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'campanhas'));

CREATE TRIGGER campaign_cycles_set_updated_at
BEFORE UPDATE ON public.campaign_cycles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX campaign_cycles_campanha_id_idx ON public.campaign_cycles (campanha_id);

-- Participação por influenciador dentro de um ciclo específico. Herdado
-- por entregas/conteúdo/métricas/cronograma (eles não ganham coluna
-- própria — pertencem ao ciclo da participação do influenciador a que
-- se referem, decisão explícita pra não fragmentar mais do que o
-- necessário).
ALTER TABLE public.campanha_influenciadores
  ADD COLUMN campaign_cycle_id UUID REFERENCES public.campaign_cycles(id) ON DELETE SET NULL;

CREATE INDEX campanha_influenciadores_cycle_id_idx ON public.campanha_influenciadores (campaign_cycle_id);

-- Backfill: cria um `campaign_cycles` pra cada (campanha_id, YYYY-MM)
-- distinto que já existe explicitamente em `data->>'cicloMes'`, e associa
-- os influenciadores correspondentes. Nunca deriva de `created_at`.
-- Duas etapas (não um único WITH): uma CTE de escrita e uma leitura comum
-- da mesma tabela dentro do mesmo comando compartilham o snapshot do
-- início da query, então a segunda não enxergaria as linhas que a
-- primeira acabou de inserir.
INSERT INTO public.campaign_cycles (campanha_id, competence_year, competence_month)
SELECT DISTINCT
  campanha_id,
  split_part(data->>'cicloMes', '-', 1)::int,
  split_part(data->>'cicloMes', '-', 2)::int
FROM public.campanha_influenciadores
WHERE data->>'cicloMes' ~ '^\d{4}-\d{2}$'
  AND split_part(data->>'cicloMes', '-', 2)::int BETWEEN 1 AND 12
ON CONFLICT (campanha_id, competence_year, competence_month) DO NOTHING;

UPDATE public.campanha_influenciadores AS ci
SET campaign_cycle_id = cc.id
FROM public.campaign_cycles cc
WHERE cc.campanha_id = ci.campanha_id
  AND ci.data->>'cicloMes' ~ '^\d{4}-\d{2}$'
  AND cc.competence_year = split_part(ci.data->>'cicloMes', '-', 1)::int
  AND cc.competence_month = split_part(ci.data->>'cicloMes', '-', 2)::int
  AND ci.campaign_cycle_id IS NULL;

-- View de apoio pro time revisar manualmente quem ficou sem ciclo (nunca
-- atribuído por suposição): participações de campanhas recorrentes cujo
-- `cicloMes` está ausente ou não reconhecível. Campanhas não são uma
-- tabela própria — vivem dentro de `clientes.data.campanhas[]` (JSONB) —
-- por isso o cruzamento usa `jsonb_array_elements` em vez de um JOIN comum.
CREATE VIEW public.campanha_influenciadores_sem_ciclo AS
SELECT
  ci.id AS campanha_influenciador_id,
  ci.campanha_id,
  ci.data->>'nome' AS influenciador_nome,
  ci.data->>'cicloMes' AS ciclo_mes_bruto,
  ci.created_at,
  campanha_json->>'nome' AS campanha_nome
FROM public.campanha_influenciadores ci
JOIN public.clientes cl ON true
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(cl.data->'campanhas', '[]'::jsonb)) AS campanha_json
WHERE ci.campaign_cycle_id IS NULL
  AND (campanha_json->>'id')::uuid = ci.campanha_id
  AND (campanha_json->>'pagClienteTipo') = 'Recorrente';

GRANT SELECT ON public.campanha_influenciadores_sem_ciclo TO authenticated;
ALTER VIEW public.campanha_influenciadores_sem_ciclo SET (security_invoker = true);
