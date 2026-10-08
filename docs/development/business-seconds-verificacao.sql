-- Verificação do tempo útil (somente SELECT; não altera dados). Rode no SQL Editor do Supabase.
-- Expediente 09:00–19:00 (America/Sao_Paulo), seg–sex, sem feriados de public.agency_holidays.
-- Datas de 2026: 08/10 qui · 09/10 sex · 10/10 sáb · 11/10 dom · 12/10 seg (FERIADO, Aparecida) · 13/10 ter.
-- Todas as linhas devem mostrar ok = true. Se 12/10 não estiver em agency_holidays, o caso 5 diverge.
with c(caso, descricao, ini, fim, esperado_s) as (values
  (1, 'mesmo dia, dentro do expediente', '2026-10-08 10:00-03'::timestamptz, '2026-10-08 12:30-03'::timestamptz, 9000),
  (2, 'início antes da abertura',        '2026-10-08 08:00-03', '2026-10-08 10:00-03', 3600),
  (3, 'fim depois do fechamento',        '2026-10-08 18:30-03', '2026-10-08 20:00-03', 1800),
  (4, 'atravessa o fim do dia útil',     '2026-10-08 18:30-03', '2026-10-09 09:30-03', 3600),
  (5, 'sex 18:00 → ter 10:00 (fds + feriado seg)', '2026-10-09 18:00-03', '2026-10-13 10:00-03', 7200),
  (6, 'só fim de semana',                '2026-10-10 10:00-03', '2026-10-11 15:00-03', 0),
  (7, 'dias inteiros no meio',           '2026-10-07 17:00-03', '2026-10-09 10:00-03', 46800),
  (8, 'mesmo instante, entrada em UTC',  '2026-10-08 13:00+00', '2026-10-08 15:30+00', 9000),
  (9, 'intervalo invertido',             '2026-10-08 12:00-03', '2026-10-08 10:00-03', 0),
  (10,'dentro do almoço/noite (21h→23h)','2026-10-08 21:00-03', '2026-10-08 23:00-03', 0)
)
select caso, descricao, esperado_s,
       public.business_seconds_between(ini, fim)::int as obtido_s,
       public.business_seconds_between(ini, fim)::int = esperado_s as ok
from c order by caso;
