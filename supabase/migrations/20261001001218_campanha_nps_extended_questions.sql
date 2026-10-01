-- NPS mensal: avaliação passa de "nota + comentário" pra 4 perguntas
-- obrigatórias + comentário opcional. `score` (NPS 0-10) e `comment`
-- continuam como estão. Regra de negócio (UNIQUE(campanha_id,
-- reference_month), RLS, elegibilidade) NÃO muda.
--
-- Tipos seguem o padrão do schema: escala numérica como smallint + CHECK
-- de range (igual `score`); opção fixa como text + CHECK IN (...) com
-- valores snake_case em português (igual `contratos.status`,
-- `commercial_interactions.outcome`).
--
-- NOT NULL direto: tabela confirmada vazia (count = 0) antes de aplicar,
-- então não há respostas antigas sem esses valores.
alter table public.campanha_nps
  add column satisfaction_score smallint not null
    check (satisfaction_score >= 1 and satisfaction_score <= 5),
  add column delivery_quality text not null
    check (delivery_quality in ('muito_ruim', 'ruim', 'regular', 'boa', 'excelente')),
  add column communication_rating text not null
    check (communication_rating in ('muito_ruim', 'ruim', 'regular', 'boa', 'excelente'));
