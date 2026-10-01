-- Expande a pesquisa de NPS do influenciador (20261001120000) de "só NPS"
-- pra uma experiência de encerramento de participação com várias perguntas
-- — mesmo padrão já usado para o NPS do cliente em
-- `20261001001218_campanha_nps_extended_questions.sql` (colunas de rating
-- texto com CHECK, nunca NOT NULL, porque a linha existe desde a
-- aprovação — só fica preenchida quando `answered_at` é setado).
--
-- `comment` (coluna original, texto livre genérico) fica como está, sem
-- uso pela UI nova — substituída por 2 comentários específicos
-- (`improvement_comment`/`positive_comment`). Não removida: dado já
-- gravado em produção não é apagado, e a coluna não atrapalha nada ficando
-- ociosa.
--
-- Zero respostas reais existentes no momento desta migration (verificado:
-- `select count(*) where answered_at is not null` = 0), então não há
-- nenhum dado histórico a migrar/backfill aqui.

alter table public.campanha_nps_influenciador
  add column communication_rating text
    check (communication_rating is null or communication_rating in ('muito_ruim','ruim','regular','boa','excelente')),
  add column briefing_rating text
    check (briefing_rating is null or briefing_rating in ('muito_ruim','ruim','regular','boa','excelente')),
  add column approval_process_rating text
    check (approval_process_rating is null or approval_process_rating in ('muito_ruim','ruim','regular','boa','excelente')),
  add column payment_experience_rating text
    check (payment_experience_rating is null or payment_experience_rating in ('muito_ruim','ruim','regular','boa','excelente')),
  add column overall_experience_rating text
    check (overall_experience_rating is null or overall_experience_rating in ('muito_ruim','ruim','regular','boa','excelente')),
  add column improvement_comment text,
  add column positive_comment text,
  add column would_work_again text
    check (would_work_again is null or would_work_again in ('sim','talvez','nao'));
