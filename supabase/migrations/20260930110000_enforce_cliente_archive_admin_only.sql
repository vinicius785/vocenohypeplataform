-- Reconstrução do domínio Comercial/Clientes/Campanhas/Contratos/Financeiro
-- — item 21: "Validar no backend e RLS. Não confiar somente na
-- interface." O frontend já restringe arquivar/restaurar cliente a admin
-- (`ClienteStatusControl.tsx`'s `canArchiveOrRestore`), mas a RLS de
-- `clientes` só exige `has_permission('clientes') OR
-- has_permission('campanhas')` pra QUALQUER update — nada impedia, no
-- banco, que um usuário com permissão "clientes" (mas não admin) chamasse
-- a API diretamente e arquivasse/restaurasse um cliente por fora da UI.
--
-- Este trigger fecha esse gap: bloqueia a transição DE/PARA "archived" no
-- UPDATE quando quem está autenticado não é admin. `auth.uid() IS NULL`
-- (chamada via service-role, sem usuário autenticado — ex. rotinas
-- administrativas futuras) é tratado como já confiável, já que quem
-- decide usar a service-role key já bypassa RLS por definição; o gap real
-- era só o usuário autenticado comum.

create or replace function public.enforce_cliente_archive_admin_only()
returns trigger
language plpgsql
security definer
as $$
declare
  old_status text := OLD.data->>'status';
  new_status text := NEW.data->>'status';
begin
  if (new_status = 'archived' and old_status is distinct from 'archived')
     or (old_status = 'archived' and new_status is distinct from 'archived') then
    if auth.uid() is not null and not public.is_admin(auth.uid()) then
      raise exception 'Apenas administradores podem arquivar ou restaurar um cliente.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists clientes_enforce_archive_admin_only on public.clientes;
create trigger clientes_enforce_archive_admin_only
  before update on public.clientes
  for each row execute function public.enforce_cliente_archive_admin_only();
