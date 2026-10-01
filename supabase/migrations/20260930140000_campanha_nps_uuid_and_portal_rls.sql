-- Endurecimento de `campanha_nps` (20260930130000_create_campanha_nps_table.sql):
--
-- 1. `campanha_id` text -> uuid, alinhado ao padrão do resto do banco
--    (`campanha_influenciadores.campanha_id uuid`,
--    `user_can_access_campanha(uid, campanha_id uuid)`). Tabela estava vazia
--    no momento da migration (verificado), e todo `campanhas[].id` existente
--    é UUID — o cast é seguro.
-- 2. RLS para usuário do Portal do Cliente: hoje toda escrita/leitura do
--    portal passa por `supabaseAdmin`, mas o banco agora também garante a
--    relação auth user -> organization_members -> clientes.organization_id
--    -> campanha (via `user_can_access_campanha`), como rede de segurança
--    caso algum caminho futuro use o client RLS-scoped.

alter table public.campanha_nps
  alter column campanha_id type uuid using campanha_id::uuid;

-- Leitura: membro ativo da organização dona do cliente vê só as linhas de
-- campanhas do próprio cliente (e `cliente_id` precisa bater com o cliente
-- da sua organização — nunca confia só no id da campanha).
create policy "org members read own campanha_nps"
  on public.campanha_nps for select
  to authenticated
  using (
    public.user_can_access_campanha(auth.uid(), campanha_id)
    and exists (
      select 1
      from public.clientes c
      join public.organization_members om
        on om.organization_id = c.organization_id
       and om.user_id = auth.uid()
       and om.status = 'active'
      where c.id = campanha_nps.cliente_id
    )
  );

-- Escrita (defesa em profundidade): se algum dia um INSERT do portal for
-- feito com o client RLS-scoped em vez de `supabaseAdmin`, a linha só pode
-- pertencer a uma campanha do cliente da própria organização, e
-- `answered_by` precisa ser o próprio usuário. Policies permissivas são
-- combinadas por OR com a policy admin existente. Sem UPDATE/DELETE pro
-- portal: resposta é imutável do lado do cliente.
create policy "org members insert own campanha_nps"
  on public.campanha_nps for insert
  to authenticated
  with check (
    answered_by = auth.uid()
    and public.user_can_access_campanha(auth.uid(), campanha_id)
    and exists (
      select 1
      from public.clientes c
      join public.organization_members om
        on om.organization_id = c.organization_id
       and om.user_id = auth.uid()
       and om.status = 'active'
      join public.organizations o
        on o.id = c.organization_id
       and o.status = 'active'
      where c.id = campanha_nps.cliente_id
        and exists (
          select 1
          from jsonb_array_elements(coalesce(c.data->'campanhas', '[]'::jsonb)) camp
          where (camp->>'id')::uuid = campanha_nps.campanha_id
        )
    )
  );
