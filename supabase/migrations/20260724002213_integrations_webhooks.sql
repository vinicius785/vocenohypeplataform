-- Secret for the incoming "leads" webhook (src/routes/api/public/leads.ts).
-- Deliberately NO grants to authenticated/anon — only reachable via the
-- service-role client inside admin-gated server functions
-- (src/lib/integrations.functions.ts), same pattern as vault_secret.
CREATE TABLE public.webhook_settings (
  key TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.webhook_settings TO service_role;

-- Outgoing webhooks: admins configure a target URL + which platform events
-- should POST to it (e.g. Zapier/Make catch hooks). Dispatch itself always
-- goes through the service-role client (see dispatchOutgoingWebhook), since
-- the user who triggers an event (e.g. any authenticated user creating a
-- lead) isn't necessarily an admin and RLS here is admin-only.
CREATE TABLE public.outgoing_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.outgoing_webhooks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outgoing_webhooks TO authenticated;
GRANT ALL ON public.outgoing_webhooks TO service_role;

CREATE POLICY "admin manage outgoing_webhooks" ON public.outgoing_webhooks
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
