
-- ============================================================
-- Definitive fix: Recreate is_admin / is_super_admin with
-- hardened SECURITY DEFINER + explicit search_path + STABLE
-- and use public.profiles to avoid any search_path ambiguity.
-- This breaks the RLS recursion cycle at the source.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND system_role IN ('super_admin', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND system_role = 'super_admin'
  );
$$;

-- Re-grant execute to authenticated role
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ============================================================
-- Remove duplicate/conflicting SELECT policies on profiles
-- that could cause ambiguous evaluation during auth flow.
-- Keep only the simple 'true' one for authenticated users.
-- ============================================================

-- Drop the complex overlapping SELECT policy on profiles
-- (the simple 'true' policy already allows all authenticated reads)
DROP POLICY IF EXISTS profiles_readable_by_authenticated ON public.profiles;

-- Recreate it cleanly — non-ghost visible to everyone, ghost only to self or service_role
CREATE POLICY profiles_readable_by_authenticated ON public.profiles
  FOR SELECT
  TO public
  USING (
    auth.role() = 'service_role'
    OR id = auth.uid()
    OR NOT is_ghost
  );

-- ============================================================
-- Remove duplicate/conflicting channels SELECT policies
-- 'channels_select_authenticated' (true) already covers all.
-- The ALL policy creates duplicate SELECT evaluation.
-- ============================================================

-- Drop the ALL channels policy that queries profiles inline
-- (specific INSERT/UPDATE/DELETE policies via is_admin() are sufficient)
DROP POLICY IF EXISTS channels_managed_by_privileged ON public.channels;

-- ============================================================
-- Reload PostgREST schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';
