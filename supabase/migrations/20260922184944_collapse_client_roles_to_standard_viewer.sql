-- Collapses the three client-facing organization_members roles
-- (client_admin, client_member, client_viewer) down to two
-- (client_standard, client_viewer). Live-verified immediately before
-- writing this migration: exactly 1 row with role='client_admin'
-- (status='removed'), 0 rows with role='client_member', 0 rows with
-- role='client_viewer'. Additive/reversible: no row deleted,
-- campaign_members untouched, old role strings simply remapped.

alter table public.organization_members
  drop constraint if exists organization_members_role_check;

update public.organization_members
  set role = 'client_standard', updated_at = now()
  where role in ('client_admin', 'client_member');

alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('internal_admin','internal_member','client_standard','client_viewer'));

-- CREATE OR REPLACE of an existing SECURITY DEFINER SQL function (does not
-- reintroduce the same-table-subquery-in-a-policy recursion bug fixed in
-- 20260918180000_fix_organization_members_rls_recursion.sql — the policy
-- calling it is unchanged, only this function's body is updated for the
-- new role name).
create or replace function public.is_active_client_admin_of(uid uuid, org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where user_id = uid
      and organization_id = org_id
      and role = 'client_standard'
      and status = 'active'
  );
$$;

-- Single summary audit entry for the migration itself (near-zero volume —
-- one row is proportionate). actor_user_id is required NOT NULL by the
-- table; there is no "system" user, so this uses a real active
-- internal_admin user id purely as the recorded actor for this one
-- system-level migration event (not a claim that this specific person
-- triggered it by hand) — the full mapping is in previous_value/new_value.
insert into public.access_audit_log (actor_user_id, organization_id, action, target_user_id, previous_value, new_value)
values (
  '02f86f8a-bbe0-4561-a61c-11ac51309055',
  null,
  'role_migration_v2',
  null,
  '{"roles": ["client_admin", "client_member", "client_viewer"]}'::jsonb,
  '{"roles": ["client_standard", "client_viewer"], "mapped_from": {"client_admin": "client_standard", "client_member": "client_standard"}, "rows_remapped": 1}'::jsonb
);
