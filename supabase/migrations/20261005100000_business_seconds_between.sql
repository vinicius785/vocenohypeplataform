-- HORÁRIO ÚTIL DA AGÊNCIA — regra única de tempo de resposta/SLA.
--
-- Funcionamento: 09:00 às 19:00, horário de Brasília (timezone canônica
-- America/Sao_Paulo). FORA dessa janela o relógio NÃO avança: mensagem às
-- 18:30 respondida às 09:30 do dia seguinte = 1h de tempo útil (não 15h).
--
-- Esta é a ÚNICA função que converte um intervalo em "tempo útil"; toda
-- métrica de tempo de resposta (hoje `get_member_response_time` e, por
-- reaproveitamento, `get_team_response_time`) chama ela. NUNCA comparar
-- horário direto em outra função/componente. Espelho TS só das constantes:
-- `src/lib/agency-hours.ts` (um teste garante que os valores batem).
--
-- Fins de semana e feriados: HOJE não são descontados (a plataforma nunca
-- teve calendário de expediente — só esta janela diária, todos os dias). Se
-- a agência quiser excluí-los, é a única função a mudar.
--
-- Usa o horário LOCAL (`at time zone`) de cada instante, então vale mesmo se
-- o fuso de Brasília voltar a ter horário de verão. Intervalo invertido,
-- vazio ou com ponta nula = 0.

create or replace function public.business_seconds_between(
  p_start timestamptz,
  p_end timestamptz
)
returns double precision
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  c_tz    constant text := 'America/Sao_Paulo';
  c_open  constant time := '09:00';
  c_close constant time := '19:00';
  c_day_seconds constant double precision := 36000; -- 10h úteis por dia
  s timestamp;
  e timestamp;
  s_day date;
  e_day date;
begin
  if p_start is null or p_end is null or p_end <= p_start then
    return 0;
  end if;

  s := p_start at time zone c_tz;
  e := p_end at time zone c_tz;
  s_day := s::date;
  e_day := e::date;

  if s_day = e_day then
    return greatest(0, extract(epoch from
      least(e, s_day + c_close) - greatest(s, s_day + c_open)))::double precision;
  end if;

  return
    -- 1º dia: do início até o fechamento
    greatest(0, extract(epoch from (s_day + c_close) - greatest(s, s_day + c_open)))
    -- dias inteiros no meio
    + (e_day - s_day - 1) * c_day_seconds
    -- último dia: da abertura até o fim
    + greatest(0, extract(epoch from least(e, e_day + c_close) - (e_day + c_open)));
end;
$$;

revoke all on function public.business_seconds_between(timestamptz, timestamptz) from public;
revoke all on function public.business_seconds_between(timestamptz, timestamptz) from anon;
grant execute on function public.business_seconds_between(timestamptz, timestamptz) to authenticated;
