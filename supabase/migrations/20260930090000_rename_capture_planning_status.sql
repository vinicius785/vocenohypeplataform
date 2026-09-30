-- Reconstrução do domínio Comercial/Clientes/Campanhas/Contratos/Financeiro
-- (pedido do usuário) — Fase 2 "Definição dos estados canônicos".
--
-- Renomeia dois valores de enum já existentes (sem introduzir uma segunda
-- estrutura paralela, conforme exigido):
--   cliente.status:  "negotiating" -> "capture"   (rótulo "Captação")
--   campanha.status: "negotiation" -> "planning"  (rótulo "Planejamento")
--
-- Diagnóstico rodado antes desta migration (produção, 2026-09-30):
--   clientes: 6 "active", 3 "archived", ZERO "negotiating" — rename do
--     enum não precisa tocar nenhuma linha existente.
--   campanhas: 4 "active", 4 "completed", 1 "negotiation" — só essa 1
--     linha precisa ser reescrita para "planning".
-- Nenhum outro valor além desses dois é alterado; "active"/"archived"
-- (cliente) e "active"/"completed"/"archived" (campanha) permanecem
-- idênticos.
--
-- Ordem importa: os triggers de validação precisam aceitar o novo valor
-- ANTES do UPDATE de backfill rodar (senão o próprio trigger rejeita a
-- gravação do valor novo que ele ainda não conhece).

-- ============================================================
-- 1. Triggers de validação primeiro
-- ============================================================
create or replace function public.validate_cliente_status()
returns trigger
language plpgsql
as $$
declare
  status text;
begin
  status := NEW.data->>'status';
  if status is not null and status not in ('capture', 'active', 'closed', 'archived') then
    raise exception 'Status de cliente inválido: % (esperado capture/active/closed/archived)', status;
  end if;
  return NEW;
end;
$$;

create or replace function public.validate_campanha_status()
returns trigger
language plpgsql
as $$
declare
  campanha jsonb;
  status text;
begin
  if NEW.data ? 'campanhas' and jsonb_typeof(NEW.data->'campanhas') = 'array' then
    for campanha in select * from jsonb_array_elements(NEW.data->'campanhas')
    loop
      status := campanha->>'status';
      if status is not null and status not in ('planning', 'active', 'completed', 'archived') then
        raise exception 'Status de campanha inválido: % (esperado planning/active/completed/archived)', status;
      end if;
    end loop;
  end if;
  return NEW;
end;
$$;

-- ============================================================
-- 2. Backfill (agora seguro, triggers já aceitam os novos valores)
-- ============================================================
update public.clientes
set data = jsonb_set(data, '{status}', '"capture"')
where data->>'status' = 'negotiating';

update public.clientes c
set data = jsonb_set(
  c.data,
  '{campanhas}',
  (
    select jsonb_agg(
      case
        when camp->>'status' = 'negotiation' then camp || jsonb_build_object('status', 'planning')
        else camp
      end
    )
    from jsonb_array_elements(c.data->'campanhas') as camp
  )
)
where c.data ? 'campanhas'
  and jsonb_typeof(c.data->'campanhas') = 'array'
  and exists (
    select 1 from jsonb_array_elements(c.data->'campanhas') as camp
    where camp->>'status' = 'negotiation'
  );
