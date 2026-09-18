-- Security audit finding: campanha_cronograma was left fully open
-- (USING (true) for all 4 operations) by the two earlier permission-scoping
-- passes (20260729190000, 20260830110000), which covered every other
-- campaign-domain table but missed this one. Any authenticated team member
-- — even one with zero "campanhas" permission — could read/write any
-- campaign's schedule data directly via the Supabase REST API. Closing it
-- with the exact same has_permission('campanhas') pattern already used for
-- campanha_tarefas/campanha_documentos/campanha_influenciadores.

DROP POLICY IF EXISTS "authenticated read campanha_cronograma" ON public.campanha_cronograma;
DROP POLICY IF EXISTS "authenticated insert campanha_cronograma" ON public.campanha_cronograma;
DROP POLICY IF EXISTS "authenticated update campanha_cronograma" ON public.campanha_cronograma;
DROP POLICY IF EXISTS "authenticated delete campanha_cronograma" ON public.campanha_cronograma;

CREATE POLICY "campanhas read campanha_cronograma" ON public.campanha_cronograma
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'campanhas'::text));

CREATE POLICY "campanhas insert campanha_cronograma" ON public.campanha_cronograma
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'campanhas'::text));

CREATE POLICY "campanhas update campanha_cronograma" ON public.campanha_cronograma
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'campanhas'::text))
  WITH CHECK (has_permission(auth.uid(), 'campanhas'::text));

CREATE POLICY "campanhas delete campanha_cronograma" ON public.campanha_cronograma
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'campanhas'::text));
