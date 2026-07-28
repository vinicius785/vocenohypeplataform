CREATE TABLE public.influencer_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  campanha_id TEXT,
  campanha_nome TEXT,
  cliente_nome TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  influencers JSONB NOT NULL DEFAULT '[]'::jsonb,
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.influencer_approvals TO authenticated;
GRANT ALL ON public.influencer_approvals TO service_role;
ALTER TABLE public.influencer_approvals ENABLE ROW LEVEL SECURITY;

-- Team-wide trust model, same as shared_state: any authenticated user can
-- create/view/manage approval links. Deliberately NO anon grants/policies —
-- the public approval page never talks to this table directly; it only goes
-- through the getApprovalByToken/respondApproval server functions, which use
-- the service-role client and validate the token themselves.
CREATE POLICY "authenticated read influencer_approvals" ON public.influencer_approvals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert influencer_approvals" ON public.influencer_approvals
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update influencer_approvals" ON public.influencer_approvals
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete influencer_approvals" ON public.influencer_approvals
  FOR DELETE TO authenticated USING (true);

CREATE INDEX influencer_approvals_campanha_id_idx ON public.influencer_approvals (campanha_id);
