-- Reconstrução do modelo de status de CLIENTES (Fase 1) — mesmo padrão já
-- aplicado a campanhas em 20260928130000_campanha_status.sql. Até aqui não
-- existia status de cliente nenhum (nem persistido, nem calculado): tudo
-- vive em `data` (JSONB), sem coluna/campo de status. Esta migration cuida
-- de:
--   1. Validar no banco que `data->>'status'`, quando presente, é um dos 4
--      valores oficiais (negotiating/active/closed/archived) — igual ao
--      trigger de campanha, nunca confiar só no TypeScript/frontend.
--   2. Backfill único: todo cliente existente ganha `status = "active"`.
--      Diagnóstico rodado antes desta migration (produção, 2026-09-29): 9
--      clientes, nenhum com `status` (todos null/ausente) — nenhum sinal de
--      "negociando" nos dados atuais (todos são clientes operacionais
--      reais), então não há ambiguidade nenhuma a resolver manualmente:
--      todos os 9 recebem "active" no backfill. Depois deste UPDATE, nada
--      mais recalcula isso automaticamente — é só o valor de partida
--      (mesma decisão já tomada para campanha).
--
-- Diferente de campanha, aqui o status vive direto em `data->>'status'`
-- (campo escalar no nível raiz do JSONB), não dentro de um array
-- (`data->'campanhas'`) — não há elementos aninhados pra iterar.

-- ============================================================
-- 1. Validação no banco
-- ============================================================
create or replace function public.validate_cliente_status()
returns trigger
language plpgsql
as $$
declare
  status text;
begin
  status := NEW.data->>'status';
  if status is not null and status not in ('negotiating', 'active', 'closed', 'archived') then
    raise exception 'Status de cliente inválido: % (esperado negotiating/active/closed/archived)', status;
  end if;
  return NEW;
end;
$$;

drop trigger if exists clientes_validate_cliente_status on public.clientes;
create trigger clientes_validate_cliente_status
  before insert or update on public.clientes
  for each row execute function public.validate_cliente_status();

-- ============================================================
-- 2. Backfill único (ver diagnóstico acima)
-- ============================================================
update public.clientes c
set data = jsonb_set(c.data, '{status}', '"active"')
where c.data->>'status' is null;
