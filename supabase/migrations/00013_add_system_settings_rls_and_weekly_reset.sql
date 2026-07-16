
-- Ensure system_settings has proper RLS
ALTER TABLE IF EXISTS public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_settings_select_all" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_write_admin" ON public.system_settings;

-- Everyone can read settings
CREATE POLICY "system_settings_select_all"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can write
CREATE POLICY "system_settings_write_admin"
  ON public.system_settings FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Ensure key column has unique constraint for upsert
ALTER TABLE public.system_settings
  DROP CONSTRAINT IF EXISTS system_settings_key_unique;
ALTER TABLE public.system_settings
  ADD CONSTRAINT system_settings_key_unique UNIQUE (key);

-- Ensure updated_at column exists
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Ensure presence_logs channel FK is SET NULL on delete (fix for delete-channel)
ALTER TABLE public.presence_logs
  DROP CONSTRAINT IF EXISTS presence_logs_from_channel_id_fkey;
ALTER TABLE public.presence_logs
  DROP CONSTRAINT IF EXISTS presence_logs_to_channel_id_fkey;
ALTER TABLE public.presence_logs
  ADD CONSTRAINT presence_logs_from_channel_id_fkey
    FOREIGN KEY (from_channel_id) REFERENCES public.channels(id) ON DELETE SET NULL;
ALTER TABLE public.presence_logs
  ADD CONSTRAINT presence_logs_to_channel_id_fkey
    FOREIGN KEY (to_channel_id) REFERENCES public.channels(id) ON DELETE SET NULL;

-- =============================================
-- Weekly reset function (called by pg_cron)
-- Archives stats then purges old time_logs
-- =============================================
CREATE OR REPLACE FUNCTION public.weekly_stats_reset()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_week_start DATE;
  v_cutoff     TIMESTAMPTZ;
  v_uid        UUID;
BEGIN
  -- Current week start (Monday)
  v_week_start := date_trunc('week', now())::date;

  -- Archive current week stats for every user who has time logs this week
  FOR v_uid IN
    SELECT DISTINCT user_id
    FROM public.time_logs
    WHERE started_at >= v_week_start
  LOOP
    PERFORM public.upsert_weekly_stats(v_uid, v_week_start);
  END LOOP;

  -- Delete time_logs older than 2 weeks
  v_cutoff := date_trunc('week', now()) - INTERVAL '2 weeks';
  DELETE FROM public.time_logs
  WHERE started_at < v_cutoff;

  -- Also purge weekly_stats rows older than 2 weeks
  DELETE FROM public.weekly_stats
  WHERE week_start < v_cutoff::date;
END;
$$;

GRANT EXECUTE ON FUNCTION public.weekly_stats_reset() TO service_role;

-- Enable pg_cron extension (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any existing schedule before re-creating
SELECT cron.unschedule('weekly-stats-reset') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'weekly-stats-reset'
);

-- Schedule every Monday at 00:00 Thai time (GMT+7) = Sunday 17:00 UTC
SELECT cron.schedule(
  'weekly-stats-reset',
  '0 17 * * 0',
  'SELECT public.weekly_stats_reset()'
);
