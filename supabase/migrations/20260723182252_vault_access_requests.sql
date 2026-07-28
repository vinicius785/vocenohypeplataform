CREATE TABLE public.vault_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requester_pubkey TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'granted', 'denied')),
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  granter_pubkey TEXT,
  encrypted_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_access_requests TO authenticated;
GRANT ALL ON public.vault_access_requests TO service_role;
ALTER TABLE public.vault_access_requests ENABLE ROW LEVEL SECURITY;

-- Requesters create their own pending request.
CREATE POLICY "insert own vault request"
ON public.vault_access_requests FOR INSERT
TO authenticated
WITH CHECK (requester_id = auth.uid());

-- Requesters see their own request; admins see every request (to respond to them).
CREATE POLICY "select own or admin vault request"
ON public.vault_access_requests FOR SELECT
TO authenticated
USING (requester_id = auth.uid() OR public.is_admin(auth.uid()));

-- Only admins can grant/deny (update status + attach the wrapped key material).
CREATE POLICY "admin update vault request"
ON public.vault_access_requests FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Requester can also clear the encrypted_key from their own row once consumed,
-- and either party can delete a stale/cancelled request.
CREATE POLICY "requester update own vault request"
ON public.vault_access_requests FOR UPDATE
TO authenticated
USING (requester_id = auth.uid())
WITH CHECK (requester_id = auth.uid());

CREATE POLICY "delete own or admin vault request"
ON public.vault_access_requests FOR DELETE
TO authenticated
USING (requester_id = auth.uid() OR public.is_admin(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.vault_access_requests;
