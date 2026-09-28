-- Reconstrução do modelo de status de campanhas: até aqui não existia
-- status persistido nenhum — "ativa/encerrada/sem prazo" era CALCULADO na
-- hora a partir de `prazo`/`pagClienteTipo` (ver `campanha-ui.ts`). Essa
-- lógica é removida do código; esta migration só cuida de:
--   1. Validar no banco que `campanhas[].status`, quando presente, é um
--      dos 4 valores oficiais (negotiation/active/completed/archived) —
--      nunca confiar só no TypeScript/frontend pra isso.
--   2. Backfill único: toda campanha existente ganha um `status` inicial,
--      calculado com a MESMA regra que já existia (recorrente ou prazo no
--      futuro → active; prazo vencido → completed; sem prazo →
--      negotiation). Depois deste UPDATE, nada mais recalcula isso — é só
--      o valor de partida, igual ao pedido explicitamente pediu ("não usar
--      data final pra decidir status" é uma regra de execução contínua,
--      não proíbe uma migração de valor inicial única e documentada).
--
-- Diagnóstico rodado antes desta migration (produção, 2026-09-28): 9
-- campanhas em 9 clientes, todas com `status` ausente (null) — nenhum
-- valor ambíguo, nenhuma campanha já arquivada por mecanismo antigo (não
-- existia mecanismo de arquivamento nenhum até aqui). Não há necessidade de
-- lista de "registros ambíguos pra decisão manual": os 9 casos mapeiam sem
-- ambiguidade pela regra acima.

-- ============================================================
-- 1. Validação no banco
-- ============================================================
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
      if status is not null and status not in ('negotiation', 'active', 'completed', 'archived') then
        raise exception 'Status de campanha inválido: % (esperado negotiation/active/completed/archived)', status;
      end if;
    end loop;
  end if;
  return NEW;
end;
$$;

drop trigger if exists clientes_validate_campanha_status on public.clientes;
create trigger clientes_validate_campanha_status
  before insert or update on public.clientes
  for each row execute function public.validate_campanha_status();

-- ============================================================
-- 2. Backfill único (ver diagnóstico acima)
-- ============================================================
update public.clientes c
set data = jsonb_set(
  c.data,
  '{campanhas}',
  coalesce(
    (
      select jsonb_agg(
        camp || jsonb_build_object(
          'status',
          case
            when camp->>'status' is not null then camp->'status'
            when camp->>'pagClienteTipo' = 'Recorrente' then to_jsonb('active'::text)
            when coalesce(camp->>'prazo', '') !~ '^\d{4}-\d{2}-\d{2}' then to_jsonb('negotiation'::text)
            when (camp->>'prazo')::date >= current_date then to_jsonb('active'::text)
            else to_jsonb('completed'::text)
          end
        )
      )
      from jsonb_array_elements(c.data->'campanhas') as camp
    ),
    '[]'::jsonb
  )
)
where c.data ? 'campanhas'
  and jsonb_typeof(c.data->'campanhas') = 'array'
  and jsonb_array_length(c.data->'campanhas') > 0;
