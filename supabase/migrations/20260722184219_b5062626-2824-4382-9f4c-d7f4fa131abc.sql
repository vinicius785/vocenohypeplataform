
-- profiles: restrict SELECT to self + admin
DROP POLICY IF EXISTS "authenticated read all profiles" ON public.profiles;
CREATE POLICY "read own or admin profiles" ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- chat_channels: restrict UPDATE/DELETE to admins
DROP POLICY IF EXISTS "authenticated update channels" ON public.chat_channels;
DROP POLICY IF EXISTS "authenticated delete channels" ON public.chat_channels;
CREATE POLICY "admin update channels" ON public.chat_channels
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admin delete channels" ON public.chat_channels
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- leads: restrict UPDATE/DELETE to admins
DROP POLICY IF EXISTS "authenticated update leads" ON public.leads;
DROP POLICY IF EXISTS "authenticated delete leads" ON public.leads;
CREATE POLICY "admin update leads" ON public.leads
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admin delete leads" ON public.leads
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- shared_state: tie writes to caller identity
DROP POLICY IF EXISTS "auth insert shared" ON public.shared_state;
DROP POLICY IF EXISTS "auth update shared" ON public.shared_state;
DROP POLICY IF EXISTS "auth delete shared" ON public.shared_state;
CREATE POLICY "self insert shared" ON public.shared_state
FOR INSERT TO authenticated
WITH CHECK (updated_by = auth.uid());
CREATE POLICY "self update shared" ON public.shared_state
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (updated_by = auth.uid());
CREATE POLICY "admin delete shared" ON public.shared_state
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- Trigger-only SECURITY DEFINER functions: no direct EXECUTE
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
