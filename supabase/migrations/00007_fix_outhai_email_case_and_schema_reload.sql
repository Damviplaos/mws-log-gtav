
-- Fix 1: Normalize Outhai's email to lowercase so GoTrue can find it
UPDATE auth.users
SET email = lower(email)
WHERE email = 'Outhai@gta-fivem.local';

-- Fix 2: Make sure outhai's profile is not hidden from authenticated queries
-- The profiles_readable_by_authenticated (public role) policy blocks ghost profiles
-- for non-service-role contexts. Replace it with a safer version.
DROP POLICY IF EXISTS profiles_readable_by_authenticated ON public.profiles;

CREATE POLICY profiles_readable_by_authenticated ON public.profiles
  FOR SELECT TO public
  USING (
    auth.role() = 'service_role'
    OR id = auth.uid()
    OR NOT is_ghost
  );

-- Fix 3: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
