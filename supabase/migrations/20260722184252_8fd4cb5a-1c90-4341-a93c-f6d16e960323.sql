
DROP POLICY IF EXISTS "authenticated create channels" ON public.chat_channels;
CREATE POLICY "authenticated create channels" ON public.chat_channels
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated insert leads" ON public.leads;
CREATE POLICY "authenticated insert leads" ON public.leads
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
