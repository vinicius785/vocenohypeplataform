-- Defesa em profundidade (auditoria de segurança): todo o isolamento do
-- Portal do Cliente depende de um invariante que hoje só é garantido por
-- CONVENÇÃO DE CÓDIGO, não pelo banco — `inviteClientUserCore`
-- (organization-invites.functions.ts) nunca grava `permissions` no
-- metadata do usuário convidado, então `handle_new_user()` deixa
-- `profiles.permissions` como `'[]'::jsonb` pra ele, e toda policy
-- `has_permission(auth.uid(), '<secao>')` passa a ser sempre falsa pra
-- clientes. Mas nada no schema impede uma mudança futura de código (ou um
-- update manual) de dar alguma `permission` a um membro de organização
-- `client` — o que reabriria exatamente o cenário crítico que esta
-- auditoria procurou (cliente lendo dado interno via uma policy
-- `has_permission`). Este trigger torna esse invariante uma regra do
-- banco, não só uma esperança do código.
create or replace function public.prevent_client_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.permissions is not null and jsonb_array_length(new.permissions) > 0 then
    if exists (
      select 1
      from public.organization_members om
      join public.organizations o on o.id = om.organization_id
      where om.user_id = new.id
        and om.status = 'active'
        and o.status = 'active'
        and o.type = 'client'
    ) then
      raise exception
        'Usuários de organizações do tipo client nunca podem ter permissions internas (profiles.id=%).',
        new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_client_permissions_trigger on public.profiles;
create trigger prevent_client_permissions_trigger
  before insert or update of permissions on public.profiles
  for each row
  execute function public.prevent_client_permissions();
