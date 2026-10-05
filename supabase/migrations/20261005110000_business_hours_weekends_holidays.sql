-- HORÁRIO ÚTIL v2: fim de semana e feriado também NÃO contam.
--
-- Complementa `20261005100000_business_seconds_between.sql` (janela diária
-- 09:00–19:00, America/Sao_Paulo). Agora um dia só tem expediente se for
-- segunda a sexta E não estiver em `agency_holidays`. Fora disso o relógio
-- não avança, como fora da janela diária.
--
-- FERIADOS: tabela `agency_holidays` (editável por admin). Semeada com os
-- feriados NACIONAIS de 2026 a 2030 (fixos + Sexta-feira Santa). NÃO inclui
-- pontos facultativos (Carnaval, Corpus Christi) nem feriados estaduais/
-- municipais — admin adiciona o que a agência de fato folga:
--   insert into public.agency_holidays (day, name) values ('2027-02-08', 'Carnaval');
-- Depois de 2030 só fins de semana são descontados até alguém cadastrar o ano.
--
-- `business_seconds_between` deixa de ser IMMUTABLE (agora consulta a tabela):
-- é STABLE e SECURITY DEFINER para funcionar também dentro das RPCs de tempo
-- de resposta. `get_member_response_time`/`get_team_response_time` não mudam.

create table if not exists public.agency_holidays (
  day date primary key,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.agency_holidays enable row level security;

drop policy if exists "agency_holidays_select_internal" on public.agency_holidays;
create policy "agency_holidays_select_internal" on public.agency_holidays
  for select to authenticated
  using (public.is_internal_team_member(auth.uid()));

drop policy if exists "agency_holidays_admin_write" on public.agency_holidays;
create policy "agency_holidays_admin_write" on public.agency_holidays
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

grant select on public.agency_holidays to authenticated;
grant insert, update, delete on public.agency_holidays to authenticated;

insert into public.agency_holidays (day, name) values
  ('2026-01-01', 'Confraternização Universal'),
  ('2026-04-03', 'Sexta-feira Santa'),
  ('2026-04-21', 'Tiradentes'),
  ('2026-05-01', 'Dia do Trabalho'),
  ('2026-09-07', 'Independência do Brasil'),
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República'),
  ('2026-11-20', 'Dia da Consciência Negra'),
  ('2026-12-25', 'Natal'),
  ('2027-01-01', 'Confraternização Universal'),
  ('2027-03-26', 'Sexta-feira Santa'),
  ('2027-04-21', 'Tiradentes'),
  ('2027-05-01', 'Dia do Trabalho'),
  ('2027-09-07', 'Independência do Brasil'),
  ('2027-10-12', 'Nossa Senhora Aparecida'),
  ('2027-11-02', 'Finados'),
  ('2027-11-15', 'Proclamação da República'),
  ('2027-11-20', 'Dia da Consciência Negra'),
  ('2027-12-25', 'Natal'),
  ('2028-01-01', 'Confraternização Universal'),
  ('2028-04-14', 'Sexta-feira Santa'),
  ('2028-04-21', 'Tiradentes'),
  ('2028-05-01', 'Dia do Trabalho'),
  ('2028-09-07', 'Independência do Brasil'),
  ('2028-10-12', 'Nossa Senhora Aparecida'),
  ('2028-11-02', 'Finados'),
  ('2028-11-15', 'Proclamação da República'),
  ('2028-11-20', 'Dia da Consciência Negra'),
  ('2028-12-25', 'Natal'),
  ('2029-01-01', 'Confraternização Universal'),
  ('2029-03-30', 'Sexta-feira Santa'),
  ('2029-04-21', 'Tiradentes'),
  ('2029-05-01', 'Dia do Trabalho'),
  ('2029-09-07', 'Independência do Brasil'),
  ('2029-10-12', 'Nossa Senhora Aparecida'),
  ('2029-11-02', 'Finados'),
  ('2029-11-15', 'Proclamação da República'),
  ('2029-11-20', 'Dia da Consciência Negra'),
  ('2029-12-25', 'Natal'),
  ('2030-01-01', 'Confraternização Universal'),
  ('2030-04-19', 'Sexta-feira Santa'),
  ('2030-04-21', 'Tiradentes'),
  ('2030-05-01', 'Dia do Trabalho'),
  ('2030-09-07', 'Independência do Brasil'),
  ('2030-10-12', 'Nossa Senhora Aparecida'),
  ('2030-11-02', 'Finados'),
  ('2030-11-15', 'Proclamação da República'),
  ('2030-11-20', 'Dia da Consciência Negra'),
  ('2030-12-25', 'Natal')
on conflict (day) do nothing;

create or replace function public.is_agency_business_day(p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select extract(isodow from p_day) < 6
     and not exists (select 1 from public.agency_holidays h where h.day = p_day);
$$;

revoke all on function public.is_agency_business_day(date) from public;
revoke all on function public.is_agency_business_day(date) from anon;
grant execute on function public.is_agency_business_day(date) to authenticated;

create or replace function public.business_seconds_between(
  p_start timestamptz,
  p_end timestamptz
)
returns double precision
language plpgsql
stable
security definer
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
  a date;
  b date;
  n integer;
  mid integer;
  total double precision := 0;
begin
  if p_start is null or p_end is null or p_end <= p_start then
    return 0;
  end if;

  s := p_start at time zone c_tz;
  e := p_end at time zone c_tz;
  s_day := s::date;
  e_day := e::date;

  if s_day = e_day then
    if not public.is_agency_business_day(s_day) then
      return 0;
    end if;
    return greatest(0, extract(epoch from
      least(e, s_day + c_close) - greatest(s, s_day + c_open)))::double precision;
  end if;

  -- 1º dia: do início até o fechamento (só se for dia útil)
  if public.is_agency_business_day(s_day) then
    total := total + greatest(0, extract(epoch from
      (s_day + c_close) - greatest(s, s_day + c_open)));
  end if;

  -- último dia: da abertura até o fim (só se for dia útil)
  if public.is_agency_business_day(e_day) then
    total := total + greatest(0, extract(epoch from
      least(e, e_day + c_close) - (e_day + c_open)));
  end if;

  -- dias inteiros no meio (a..b): segundas a sextas menos feriados em dia de semana.
  -- Semanas completas valem 5; o resto (< 7 dias) é contado dia a dia.
  a := s_day + 1;
  b := e_day - 1;
  if a <= b then
    n := b - a + 1;
    mid := (n / 7) * 5
      + (select count(*) from generate_series(0, (n % 7) - 1) i
          where extract(isodow from (a + (n / 7) * 7 + i)) < 6)
      - (select count(*) from public.agency_holidays h
          where h.day between a and b and extract(isodow from h.day) < 6);
    total := total + mid * c_day_seconds;
  end if;

  return total;
end;
$$;

revoke all on function public.business_seconds_between(timestamptz, timestamptz) from public;
revoke all on function public.business_seconds_between(timestamptz, timestamptz) from anon;
grant execute on function public.business_seconds_between(timestamptz, timestamptz) to authenticated;
