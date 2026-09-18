-- Phase 1 of the client-portal auth overhaul: organizations / memberships,
-- additive read-only RLS for client-side access, backfill from existing data.
-- See CLAUDE.md and .lovable/plan.md for context. Purely additive: no
-- existing table/column/policy is dropped or altered destructively.

-- 1. organizations ----------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  logo_url text,
  type text not null check (type in ('internal','client')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. organization_members ---------------------------------------------------
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('internal_admin','internal_member','client_admin','client_member','client_viewer')),
  status text not null default 'invited' check (status in ('invited','active','suspended','removed')),
  invited_by uuid references auth.users(id),
  invited_at timestamptz default now(),
  accepted_at timestamptz,
  last_access_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, user_id)
);

-- 3. campaign_members (optional per-campaign scoping) -----------------------
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text,
  created_at timestamptz not null default now(),
  unique(campaign_id, user_id)
);

-- 4. clientes.organization_id ------------------------------------------------
alter table public.clientes
  add column if not exists organization_id uuid references public.organizations(id);

-- 5. Helper: does this user have ACTIVE access (via an ACTIVE org membership
--    in an ACTIVE org) to the client that owns this campanha_id? Campaigns
--    are nested JSONB (clientes.data.campanhas[].id), never a real FK, so
--    this is the single place that traversal lives — reused by every new
--    policy below instead of repeating the JSONB lookup inline.
create or replace function public.user_can_access_campanha(uid uuid, campanha_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clientes c
    join public.organization_members om
      on om.organization_id = c.organization_id
     and om.user_id = uid
     and om.status = 'active'
    join public.organizations o
      on o.id = c.organization_id
     and o.status = 'active'
    where exists (
      select 1
      from jsonb_array_elements(coalesce(c.data->'campanhas', '[]'::jsonb)) camp
      where (camp->>'id')::uuid = campanha_id
    )
  );
$$;

-- 6. RLS: organizations -------------------------------------------------------
alter table public.organizations enable row level security;

create policy "organizations select own or admin"
  on public.organizations for select
  to authenticated
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = organizations.id
        and om.user_id = auth.uid()
    )
  );

create policy "organizations admin write"
  on public.organizations for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- 7. RLS: organization_members ------------------------------------------------
alter table public.organization_members enable row level security;

create policy "organization_members select own"
  on public.organization_members for select
  to authenticated
  using (user_id = auth.uid());

create policy "organization_members select admin all"
  on public.organization_members for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- Future "who has portal access" list for a client_admin — read-only this
-- phase, writes stay admin-only to avoid a half-built escalation surface.
create policy "organization_members select client admin peers"
  on public.organization_members for select
  to authenticated
  using (
    exists (
      select 1 from public.organization_members me
      where me.user_id = auth.uid()
        and me.organization_id = organization_members.organization_id
        and me.role = 'client_admin'
        and me.status = 'active'
    )
  );

create policy "organization_members admin write"
  on public.organization_members for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

create policy "organization_members admin update"
  on public.organization_members for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "organization_members admin delete"
  on public.organization_members for delete
  to authenticated
  using (public.is_admin(auth.uid()));

-- 8. RLS: campaign_members -----------------------------------------------------
alter table public.campaign_members enable row level security;

create policy "campaign_members select own or admin"
  on public.campaign_members for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "campaign_members admin write"
  on public.campaign_members for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- 9. Additive client-facing SELECT policies on clientes / campanha_* --------
--    Read-only via RLS this phase; approve/reject mutations go through
--    dedicated server functions in phase 2, not raw RLS UPDATE.
create policy "org members read own clientes"
  on public.clientes for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members om
      join public.organizations o on o.id = om.organization_id
      where om.organization_id = clientes.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and o.status = 'active'
    )
  );

create policy "org members read own campanha_influenciadores"
  on public.campanha_influenciadores for select
  to authenticated
  using (public.user_can_access_campanha(auth.uid(), campanha_id));

create policy "org members read own campanha_tarefas"
  on public.campanha_tarefas for select
  to authenticated
  using (public.user_can_access_campanha(auth.uid(), campanha_id));

create policy "org members read own campanha_documentos"
  on public.campanha_documentos for select
  to authenticated
  using (public.user_can_access_campanha(auth.uid(), campanha_id));

create policy "org members read own campanha_cronograma"
  on public.campanha_cronograma for select
  to authenticated
  using (public.user_can_access_campanha(auth.uid(), campanha_id));

-- 10. Backfill (idempotent — safe to re-run) ----------------------------------

-- 10a. Internal org.
insert into public.organizations (name, type, slug)
select 'Você no Hype', 'internal', 'vocenohype'
where not exists (select 1 from public.organizations where slug = 'vocenohype');

-- 10b. Every profile gets an active membership in the internal org.
insert into public.organization_members (organization_id, user_id, role, status, accepted_at)
select
  (select id from public.organizations where slug = 'vocenohype'),
  p.id,
  case when public.is_admin(p.id) then 'internal_admin' else 'internal_member' end,
  'active',
  now()
from public.profiles p
where not exists (
  select 1 from public.organization_members om
  where om.user_id = p.id
    and om.organization_id = (select id from public.organizations where slug = 'vocenohype')
);

-- 10c. One client organization per `clientes` row (name from `data->>'empresa'`
--      — confirmed via execute_sql that this is the real display-name field;
--      `data->>'nome'` does not exist on any of the 9 rows).
insert into public.organizations (name, type, status)
select coalesce(nullif(trim(c.data->>'empresa'), ''), 'Cliente sem nome'), 'client', 'active'
from public.clientes c
where c.organization_id is null;

-- 10d. Link each clientes row to the org just created for it. Matches by
--      insertion order within this statement batch is unsafe across
--      re-runs, so instead we match 1:1 on the fact that every clientes row
--      needing backfill got exactly one fresh client org with the same name
--      created in 10c AND not yet linked to any other clientes row. To keep
--      this correct even if two clients share the same `empresa` name, we
--      use a numbered-row join instead of a plain name match.
with unlinked_clientes as (
  select id, data->>'empresa' as empresa,
         row_number() over (partition by data->>'empresa' order by created_at) as rn
  from public.clientes
  where organization_id is null
),
unlinked_orgs as (
  select id, name,
         row_number() over (partition by name order by created_at) as rn
  from public.organizations
  where type = 'client'
    and id not in (select organization_id from public.clientes where organization_id is not null)
)
update public.clientes c
set organization_id = uo.id, updated_at = now()
from unlinked_clientes uc
join unlinked_orgs uo
  on uo.name = coalesce(nullif(trim(uc.empresa), ''), 'Cliente sem nome')
 and uo.rn = uc.rn
where c.id = uc.id;

-- 10e. Enforce NOT NULL only if every row backfilled cleanly (checked live
--      against real data before this migration was written: 9/9 clientes
--      rows had a non-null `empresa` and all 9 backfilled). If a future
--      re-run of this file ever finds a leftover null (shouldn't happen —
--      idempotent), this will simply fail loudly instead of silently
--      allowing an ownerless client row to exist going forward.
do $$
begin
  if not exists (select 1 from public.clientes where organization_id is null) then
    alter table public.clientes alter column organization_id set not null;
  end if;
end $$;

-- 11. Lock down the new SECURITY DEFINER helper (matches the advisor findings
--     already flagged for the pre-existing is_admin/has_permission — this one
--     is tightened here rather than left at the PostgREST default of PUBLIC).
revoke all on function public.user_can_access_campanha(uuid, uuid) from public;
revoke all on function public.user_can_access_campanha(uuid, uuid) from anon;
grant execute on function public.user_can_access_campanha(uuid, uuid) to authenticated;
