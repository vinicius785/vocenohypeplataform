
-- 1) Replace admin policies that used has_role() with inline checks
DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "admins update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "admins read all roles" ON public.user_roles;

CREATE POLICY "admins read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::public.app_role
  ));

CREATE POLICY "admins update all profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::public.app_role
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::public.app_role
  ));

CREATE POLICY "admins read all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ));

-- 2) Revoke direct EXECUTE on the SECURITY DEFINER helper from client roles.
--    service_role keeps access for server-side use.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- 3) Restrict avatar reads to the owner's folder (matches insert/update/delete policies)
DROP POLICY IF EXISTS "authenticated read avatars" ON storage.objects;

CREATE POLICY "users read own avatar"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
