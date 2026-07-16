-- =============================================
-- Add presence_logs table for room change history
-- =============================================
CREATE TABLE IF NOT EXISTS public.presence_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  to_channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presence_logs_user_id ON public.presence_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_presence_logs_changed_at ON public.presence_logs(changed_at DESC);

ALTER TABLE public.presence_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all logs
DROP POLICY IF EXISTS "presence_logs_select_admin" ON public.presence_logs;
CREATE POLICY "presence_logs_select_admin"
  ON public.presence_logs
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Users can view their own logs
DROP POLICY IF EXISTS "presence_logs_select_self" ON public.presence_logs;
CREATE POLICY "presence_logs_select_self"
  ON public.presence_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only service role / admin can insert (edge function uses service role)
DROP POLICY IF EXISTS "presence_logs_insert_service" ON public.presence_logs;
CREATE POLICY "presence_logs_insert_service"
  ON public.presence_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'service_role' OR is_admin());

ALTER PUBLICATION supabase_realtime ADD TABLE public.presence_logs;
