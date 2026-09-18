-- Phase 2a of the client-portal auth overhaul: audit log for admin-mediated
-- portal-access mutations (resend invite, role change, campaign scoping,
-- suspend/reactivate/remove). Purely additive. See CLAUDE.md.

create table public.access_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id),
  organization_id uuid references public.organizations(id),
  action text not null,
  target_user_id uuid references auth.users(id),
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
alter table public.access_audit_log enable row level security;

create policy "access_audit_log select admin"
  on public.access_audit_log for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- No insert/update/delete policy for `authenticated` at all — writes only
-- via supabaseAdmin from server functions, bypassing RLS (intentional).
