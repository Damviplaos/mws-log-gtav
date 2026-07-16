
-- Ensure role_permissions has unique constraint for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'role_permissions_role_id_permission_key'
  ) THEN
    ALTER TABLE public.role_permissions
      ADD CONSTRAINT role_permissions_role_id_permission_key UNIQUE (role_id, permission);
  END IF;
END$$;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON public.role_permissions(role_id);

-- Fix RLS: channels delete should allow service_role too (edge functions)
DROP POLICY IF EXISTS channels_delete_admin ON public.channels;
CREATE POLICY channels_delete_admin ON public.channels
  FOR DELETE TO authenticated
  USING (
    auth.role() = 'service_role'
    OR is_admin()
  );

-- Allow authenticated users to delete their own presence cleanup on channel delete
-- (No additional migration needed; managed via service role in edge function)
