-- Bug em produção: ao salvar QUALQUER alteração (ex.: subir um roteiro) num influenciador APROVADO,
-- o gatilho `ensure_campanha_nps_influenciador` falha com
--   "function gen_random_bytes(integer) does not exist".
--
-- Causa: a migration 20261001121500 já havia corrigido isso qualificando a chamada como
-- `extensions.gen_random_bytes` (pgcrypto vive no schema `extensions` nesta instância e a função
-- roda com `search_path = public`). A migration 20261005000000_demo_operacional.sql redefiniu a
-- MESMA função copiando a versão ANTIGA, sem o prefixo — reintroduzindo o erro. Aqui a função volta
-- a qualificar a chamada, mantendo a condição nova de ignorar campanhas de demo.
create or replace function public.ensure_campanha_nps_influenciador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.data->>'status' = 'APROVADO'
     and not exists (select 1 from public.demo_sessions d where d.campanha_id = NEW.campanha_id) then
    insert into public.campanha_nps_influenciador (campanha_id, influenciador_id, token)
    values (NEW.campanha_id, NEW.id, encode(extensions.gen_random_bytes(16), 'hex'))
    on conflict (campanha_id, influenciador_id) do nothing;
  end if;
  return NEW;
end;
$$;

-- Mesmo risco no DEFAULT de `demo_sessions.realtime_key` (avaliado no search_path de quem insere).
alter table public.demo_sessions
  alter column realtime_key set default encode(extensions.gen_random_bytes(16), 'hex');
