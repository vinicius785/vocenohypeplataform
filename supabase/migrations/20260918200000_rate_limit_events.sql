-- Piece C of the 2026-09-18 security pass (see CLAUDE.md): plain-Postgres
-- rate limiting, no external dependency (Redis/Upstash) allowed per
-- bunfig.toml's 24h supply-chain guard. Purely additive.
--
-- Safe-by-default RLS: enabled, zero policies for `authenticated`/`anon` —
-- same pattern already used for `vault_secret`/`webhook_settings` per the
-- prior security audit. All access is server-only via `supabaseAdmin`
-- (service role bypasses RLS entirely), so no policy is needed or wanted
-- here — this table exists purely as a write-only counter, never read back
-- through a user-facing query, so there is no same-table-subquery RLS risk
-- to begin with.

create table public.rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  created_at timestamptz not null default now()
);

alter table public.rate_limit_events enable row level security;
-- Intentionally no policies: no authenticated/anon grants at all.

-- Supports the helper's count-within-window query efficiently.
create index rate_limit_events_bucket_created_at_idx
  on public.rate_limit_events (bucket, created_at desc);

-- Housekeeping: old rows are worthless once every window they could matter
-- for has passed. Not strictly required (the helper only ever counts a
-- recent window), but keeps the table from growing unbounded. Not
-- scheduled automatically (no pg_cron dependency introduced here) — a
-- manual/periodic cleanup is fine given each row's row is tiny, and this is
-- explicitly punted rather than adding a background job in this pass.
comment on table public.rate_limit_events is
  'Anti-abuse counters for login/password-recovery/invite endpoints (checkRateLimit in src/lib/rate-limit.server.ts). Server-only (service-role), no RLS policies. Rows are cheap to accumulate; periodic manual cleanup of rows older than a few days is safe (nothing reads old rows).';
