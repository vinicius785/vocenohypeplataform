-- Scoped-down mitigation for the "double submit" race in
-- `submitInscricaoCampanha` (`src/lib/inscricao-campanha.functions.ts`, the
-- PUBLIC campaign-signup endpoint): its dedup is a plain
-- SELECT-existing -> decide-in-JS -> INSERT/UPDATE with no transaction, no
-- advisory lock, and no unique constraint backing it, so two
-- near-simultaneous submissions (double-click, network retry, browser
-- back-and-resubmit) for the SAME candidate can both pass the SELECT
-- before either write completes, producing two rows.
--
-- Full fix would be an atomic `pg_advisory_xact_lock` + the whole
-- match/decide/write sequence inside a single Postgres function call (one
-- round-trip) — `supabaseAdmin` is a PostgREST/REST client
-- (`src/integrations/supabase/client.server.ts`'s `createSupabaseFetch`
-- wraps plain `fetch`), not a persistent raw Postgres connection, so a
-- session-level `pg_advisory_lock`/`pg_advisory_unlock` pair issued as two
-- separate `.rpc()` calls would NOT reliably hold across both calls
-- (`.rpc()` each runs in its own implicit transaction/connection from the
-- pool) — that would require porting the existing, nontrivial JS matching
-- logic (`normalizeEmail`/`normalizePhoneDigits`/`normalizeSocialInput`/
-- `isDuplicateProfile`) into SQL/plpgsql, which is a much larger, riskier
-- change than this task's budget allows for a single pass.
--
-- This migration instead closes the EXACT-resubmission case (the same
-- physical request retried — network retry, double form-submit of the
-- same click) atomically and safely, via a DB-enforced unique constraint:
-- the server function inserts a row here keyed by (campanha_id,
-- idempotency_key) BEFORE doing its match/decide/write; the unique index
-- makes a concurrent duplicate insert fail atomically at the database
-- level (this part IS real transactional serialization, just for the
-- "same request twice" case, not for "two different but overlapping
-- submissions" for the same person clicking distinct times — that broader
-- race is NOT closed by this migration; see the code comment in
-- `submitInscricaoCampanha` for the full picture).
--
-- Server-only (service-role/`supabaseAdmin`), like `rate_limit_events` —
-- no `authenticated`/`anon` grants needed or wanted.

create table public.inscricao_campanha_idempotency (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null,
  idempotency_key text not null,
  result jsonb,
  created_at timestamptz not null default now()
);

alter table public.inscricao_campanha_idempotency enable row level security;
-- Intentionally no policies: no authenticated/anon grants at all — only
-- ever touched via supabaseAdmin from submitInscricaoCampanha.

-- The constraint doing the actual work: makes "insert the same
-- (campanha_id, idempotency_key) twice" fail atomically instead of racing.
create unique index inscricao_campanha_idempotency_key_idx
  on public.inscricao_campanha_idempotency (campanha_id, idempotency_key);

comment on table public.inscricao_campanha_idempotency is
  'Idempotency guard for the public campaign-signup endpoint (submitInscricaoCampanha). Scoped-down mitigation: closes exact-resubmission races via a unique (campanha_id, idempotency_key) constraint; does NOT close the broader "two different submissions for the same person" race (would need a full pg_advisory_xact_lock + SQL-ported matching logic — see migration comment). Server-only, no RLS policies. Safe to periodically prune rows older than a few days.';
