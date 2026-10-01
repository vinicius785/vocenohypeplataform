-- Bug pego em teste manual: `ensure_campanha_nps_influenciador` ganhou
-- `search_path = public` no hardening anterior
-- (20261001120500_campanha_nps_influenciador_harden_functions.sql), mas
-- `gen_random_bytes` (pgcrypto) vive no schema `extensions` nesta instância
-- Supabase, não em `public` — a função passou a falhar com "function
-- gen_random_bytes(integer) does not exist" em qualquer aprovação real.
-- Corrige qualificando a chamada com `extensions.gen_random_bytes`, sem
-- reabrir o search_path (mantém só `public`, que é o endurecimento que
-- importava).
create or replace function public.ensure_campanha_nps_influenciador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.data->>'status' = 'APROVADO' then
    insert into public.campanha_nps_influenciador (campanha_id, influenciador_id, token)
    values (NEW.campanha_id, NEW.id, encode(extensions.gen_random_bytes(16), 'hex'))
    on conflict (campanha_id, influenciador_id) do nothing;
  end if;
  return NEW;
end;
$$;
