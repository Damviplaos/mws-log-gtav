
-- =============================================
-- RPC: create_user_by_admin
-- Creates a new auth user + profile
-- =============================================
CREATE OR REPLACE FUNCTION create_user_by_admin(
  p_username TEXT,
  p_password TEXT,
  p_system_role TEXT DEFAULT 'user'
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
BEGIN
  -- Only admin/super_admin can call this
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  
  -- Create synthetic email from username
  v_email := p_username || '@gta-fivem.local';
  
  -- Insert into auth.users via admin API (we use service role in edge function)
  -- This RPC is a placeholder; actual creation happens in edge function
  RAISE EXCEPTION 'Use edge function create-user instead';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- RPC: upsert_weekly_stats
-- Recalculates weekly stats for a user
-- =============================================
CREATE OR REPLACE FUNCTION upsert_weekly_stats(p_user_id UUID, p_week_start DATE)
RETURNS VOID AS $$
DECLARE
  v_work_secs NUMERIC;
  v_op_secs NUMERIC;
BEGIN
  SELECT 
    COALESCE(SUM(CASE WHEN NOT is_op_time THEN COALESCE(duration_seconds, EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN is_op_time THEN COALESCE(duration_seconds, EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))) ELSE 0 END), 0)
  INTO v_work_secs, v_op_secs
  FROM time_logs
  WHERE user_id = p_user_id
    AND started_at >= p_week_start
    AND started_at < p_week_start + INTERVAL '7 days';

  INSERT INTO weekly_stats(user_id, week_start, total_work_seconds, total_op_seconds)
  VALUES (p_user_id, p_week_start, v_work_secs, v_op_secs)
  ON CONFLICT (user_id, week_start) DO UPDATE
    SET total_work_seconds = EXCLUDED.total_work_seconds,
        total_op_seconds = EXCLUDED.total_op_seconds,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- RPC: get_daily_stats
-- Returns daily work/op seconds for a user on a date
-- =============================================
CREATE OR REPLACE FUNCTION get_daily_stats(p_user_id UUID, p_date DATE)
RETURNS TABLE(total_work_seconds NUMERIC, total_op_seconds NUMERIC) AS $$
  SELECT
    COALESCE(SUM(CASE WHEN NOT is_op_time THEN COALESCE(duration_seconds, EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN is_op_time THEN COALESCE(duration_seconds, EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))) ELSE 0 END), 0)
  FROM time_logs
  WHERE user_id = p_user_id
    AND started_at >= p_date::TIMESTAMPTZ
    AND started_at < (p_date + INTERVAL '1 day')::TIMESTAMPTZ;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_weekly_stats(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_stats(UUID, DATE) TO authenticated;
