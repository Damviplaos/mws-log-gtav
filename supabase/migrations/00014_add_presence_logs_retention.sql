-- Add presence_logs retention to weekly_stats_reset()
-- Purges presence_logs older than 2 weeks (same as time_logs/weekly_stats)

CREATE OR REPLACE FUNCTION public.weekly_stats_reset()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start date;
  v_cutoff timestamp;
  v_user record;
BEGIN
  v_week_start := date_trunc('week', now())::date;

  -- Archive current week stats for all users with time_logs
  FOR v_user IN
    SELECT DISTINCT user_id FROM public.time_logs
    WHERE started_at >= v_week_start
  LOOP
    PERFORM public.upsert_weekly_stats(v_user.user_id, v_week_start);
  END LOOP;

  -- Purge old data (older than 2 weeks)
  v_cutoff := date_trunc('week', now()) - INTERVAL '2 weeks';

  DELETE FROM public.time_logs WHERE started_at < v_cutoff;
  DELETE FROM public.weekly_stats WHERE week_start < v_cutoff::date;
  DELETE FROM public.presence_logs WHERE changed_at < v_cutoff;
END;
$$;
