-- Client-portal accounts (organization_members.role IN ('client_standard',
-- 'client_viewer')) were leaking into internal-only surfaces (Time/Equipe
-- tab, chat DM list, mention/participant selectors, presence, score/ranking)
-- because those surfaces were built before organizations/organization_members
-- existed (Phase 1: 20260918160000_client_organizations_phase1.sql) and never
-- got updated to consult it — they either query `profiles` directly (which
-- every auth user gets a row in via the `handle_new_user` trigger, client or
-- not) or query chat tables with no team-membership check at all.
--
-- This migration adds the single SQL source of truth for "is this an
-- internal team member" (mirrors `is_admin()`'s style/security posture) and
-- uses it to close the RLS gaps on the chat/presence tables. The matching
-- TS-side source of truth is `src/lib/team-membership.ts`, used by
-- `getTeamDirectory` and friends — see that file's docstring.
--
-- Purely additive: no existing table/column/policy is dropped without an
-- equivalent-or-stricter replacement in the same statement, no grant is
-- widened, nothing is deleted.

-- 1. Helper -------------------------------------------------------------
-- ACTIVE internal_admin/internal_member membership in the ACTIVE internal
-- org ('vocenohype'), OR is_admin() — an admin must always count as
-- internal even before/without an organization_members backfill row (e.g. a
-- freshly created admin in a test/staging env that hasn't run the Phase 1
-- backfill). Mirrors `access-guards.server.ts`'s `requireInternalAccess`.
CREATE OR REPLACE FUNCTION public.is_internal_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.user_id = _user_id
        AND om.status = 'active'
        AND o.type = 'internal'
        AND o.status = 'active'
        AND om.role IN ('internal_admin', 'internal_member')
    )
$$;

REVOKE ALL ON FUNCTION public.is_internal_team_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_internal_team_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_internal_team_member(uuid) TO authenticated, service_role;

-- The fixed synthetic author id chat_messages already uses for the Hypito
-- bot (see 20260917150200_hypito_payload_author_check.sql) — repeated here
-- (Postgres has no named constants) so the INSERT policy below can
-- special-case it without loosening the existing hypito_payload check.
-- 2. chat_channels --------------------------------------------------------
-- Public (non-private) channels were readable by ANY authenticated user;
-- private channels were already correctly scoped by allowed_member_ids.
-- Creating/updating/deleting a channel was unrestricted (`USING (true)`).
DROP POLICY IF EXISTS "authenticated read channels" ON public.chat_channels;
CREATE POLICY "authenticated read channels" ON public.chat_channels
  FOR SELECT TO authenticated
  USING (
    (is_private = false AND public.is_internal_team_member(auth.uid()))
    OR auth.uid() = ANY(allowed_member_ids)
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "authenticated create channels" ON public.chat_channels;
CREATE POLICY "authenticated create channels" ON public.chat_channels
  FOR INSERT TO authenticated
  WITH CHECK (public.is_internal_team_member(auth.uid()));

DROP POLICY IF EXISTS "authenticated update channels" ON public.chat_channels;
CREATE POLICY "authenticated update channels" ON public.chat_channels
  FOR UPDATE TO authenticated
  USING (public.is_internal_team_member(auth.uid()))
  WITH CHECK (public.is_internal_team_member(auth.uid()));

DROP POLICY IF EXISTS "authenticated delete channels" ON public.chat_channels;
CREATE POLICY "authenticated delete channels" ON public.chat_channels
  FOR DELETE TO authenticated
  USING (public.is_internal_team_member(auth.uid()));

-- 3. chat_messages ---------------------------------------------------------
-- Reading a channel-backed convo_id already deferred to chat_channels'
-- policy in spirit (20260917150100) but re-derived visibility inline rather
-- than reusing it, so it needs the same internal-only gate on the
-- "is_private = false" branch. DM visibility (participant-scoped) and the
-- ad-hoc/campaign-linked convo_id fallback are unchanged.
DROP POLICY IF EXISTS "authenticated read messages" ON public.chat_messages;
CREATE POLICY "authenticated read messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    convo_id NOT LIKE 'dm:%'
    AND (
      NOT EXISTS (SELECT 1 FROM public.chat_channels cc WHERE cc.id::text = chat_messages.convo_id)
      OR EXISTS (
        SELECT 1 FROM public.chat_channels cc
        WHERE cc.id::text = chat_messages.convo_id
          AND (
            (cc.is_private = false AND public.is_internal_team_member(auth.uid()))
            OR auth.uid() = ANY (cc.allowed_member_ids)
            OR public.is_admin(auth.uid())
          )
      )
    )
    OR (convo_id LIKE 'dm:%' AND position(auth.uid()::text in convo_id) > 0)
  );

-- Insert: an author_id must belong to an internal team member, except the
-- two pre-existing special cases — `author_id IS NULL` (client-side
-- "system" messages, unrelated to this fix, see 20260917150200) and the
-- fixed Hypito bot author id (already the only id allowed to carry
-- hypito_payload).
DROP POLICY IF EXISTS "authenticated insert own messages" ON public.chat_messages;
CREATE POLICY "authenticated insert own messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id IS NULL
    OR author_id = '00000000-0000-4000-a000-48797069746f'::uuid
    OR (author_id = auth.uid() AND public.is_internal_team_member(auth.uid()))
  );

-- 4. chat_status (presence) -------------------------------------------------
-- Was readable by every authenticated user and writable by anyone for their
-- own row, with no internal-team check at all — client-portal accounts
-- showed up as online/offline in the same roster as the team.
DROP POLICY IF EXISTS "authenticated read status" ON public.chat_status;
CREATE POLICY "authenticated read status" ON public.chat_status
  FOR SELECT TO authenticated
  USING (public.is_internal_team_member(auth.uid()));

DROP POLICY IF EXISTS "user upsert own status" ON public.chat_status;
CREATE POLICY "user upsert own status" ON public.chat_status
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_internal_team_member(auth.uid()));

DROP POLICY IF EXISTS "user update own status" ON public.chat_status;
CREATE POLICY "user update own status" ON public.chat_status
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.is_internal_team_member(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.is_internal_team_member(auth.uid()));

-- 5. chat_reads --------------------------------------------------------------
-- Already strictly self-scoped (no cross-user leak possible regardless of
-- team membership) — gated too, for symmetry/defense-in-depth, since an
-- unread marker for a channel a client can no longer read is meaningless.
DROP POLICY IF EXISTS "user manage own reads" ON public.chat_reads;
CREATE POLICY "user manage own reads" ON public.chat_reads
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND public.is_internal_team_member(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.is_internal_team_member(auth.uid()));
