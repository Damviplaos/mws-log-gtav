
-- Fix infinite RLS recursion:
-- is_admin() / is_super_admin() query `profiles`, but `profiles` has RLS policies
-- that call is_admin(). SECURITY DEFINER breaks the cycle by running as the
-- function owner (postgres) which bypasses RLS on profiles.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND system_role IN ('super_admin', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND system_role = 'super_admin'
  );
$$;
