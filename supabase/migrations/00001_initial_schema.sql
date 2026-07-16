
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PROFILES TABLE (extends auth.users)
-- =============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  nickname TEXT,
  ic_name TEXT,
  system_role TEXT NOT NULL DEFAULT 'user' CHECK (system_role IN ('super_admin', 'admin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- CHANNELS (ROOMS) TABLE
-- =============================================
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  track_time BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default 4 channels
INSERT INTO channels (name, display_name, sort_order, track_time) VALUES
  ('ready', 'พร้อมทำงาน', 1, TRUE),
  ('afk', 'เหม่อ', 2, TRUE),
  ('activity', 'ไปกิจกรรม', 3, TRUE),
  ('off_duty', 'ออกเวร', 4, FALSE);

-- =============================================
-- USER PRESENCE TABLE (who is online & in which channel)
-- =============================================
CREATE TABLE user_presence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id),
  joined_channel_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_op BOOLEAN NOT NULL DEFAULT FALSE,
  queue_position INT,
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- QUEUE POINTER TABLE (global pointer state)
-- =============================================
CREATE TABLE queue_pointer (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pointed_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert initial pointer row
INSERT INTO queue_pointer (id) VALUES ('00000000-0000-0000-0000-000000000001');

-- =============================================
-- ROLES TABLE
-- =============================================
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- ROLE CRITERIA TABLE (promotion requirements)
-- =============================================
CREATE TABLE role_criteria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  next_role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  min_work_hours_per_week NUMERIC(10,2),
  min_op_hours_per_week NUMERIC(10,2),
  work_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  op_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role_id)
);

-- =============================================
-- USER ROLES (many-to-many)
-- =============================================
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id),
  UNIQUE(user_id, role_id)
);

-- =============================================
-- TIME LOGS TABLE (work/OP time records)
-- =============================================
CREATE TABLE time_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  is_op_time BOOLEAN NOT NULL DEFAULT FALSE,
  duration_seconds NUMERIC(15,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- WEEKLY STATS TABLE (cached aggregates)
-- =============================================
CREATE TABLE weekly_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  total_work_seconds NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_op_seconds NUMERIC(15,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

-- =============================================
-- ENABLE REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE user_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE queue_pointer;
ALTER PUBLICATION supabase_realtime ADD TABLE channels;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE user_roles;
ALTER PUBLICATION supabase_realtime ADD TABLE roles;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_user_presence_channel ON user_presence(channel_id);
CREATE INDEX idx_user_presence_user ON user_presence(user_id);
CREATE INDEX idx_time_logs_user ON time_logs(user_id);
CREATE INDEX idx_time_logs_started ON time_logs(started_at);
CREATE INDEX idx_weekly_stats_user_week ON weekly_stats(user_id, week_start);

-- =============================================
-- UPDATED_AT TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- RLS: ENABLE ON ALL TABLES
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_pointer ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_stats ENABLE ROW LEVEL SECURITY;

-- =============================================
-- HELPER: check if current user is admin
-- =============================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND system_role IN ('super_admin', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND system_role = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================
-- RLS POLICIES: profiles
-- =============================================
CREATE POLICY "profiles_select_authenticated" ON profiles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "profiles_insert_admin" ON profiles FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "profiles_update_self_or_admin" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR is_admin());
CREATE POLICY "profiles_delete_admin" ON profiles FOR DELETE TO authenticated USING (is_admin());

-- =============================================
-- RLS POLICIES: channels
-- =============================================
CREATE POLICY "channels_select_authenticated" ON channels FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "channels_insert_admin" ON channels FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "channels_update_admin" ON channels FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "channels_delete_admin" ON channels FOR DELETE TO authenticated USING (is_admin());

-- =============================================
-- RLS POLICIES: user_presence
-- =============================================
CREATE POLICY "presence_select_authenticated" ON user_presence FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "presence_insert_self_or_admin" ON user_presence FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR is_admin());
CREATE POLICY "presence_update_self_or_admin" ON user_presence FOR UPDATE TO authenticated USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "presence_delete_self_or_admin" ON user_presence FOR DELETE TO authenticated USING (user_id = auth.uid() OR is_admin());

-- =============================================
-- RLS POLICIES: queue_pointer
-- =============================================
CREATE POLICY "pointer_select_authenticated" ON queue_pointer FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "pointer_update_authenticated" ON queue_pointer FOR UPDATE TO authenticated USING (TRUE);

-- =============================================
-- RLS POLICIES: roles
-- =============================================
CREATE POLICY "roles_select_authenticated" ON roles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "roles_insert_admin" ON roles FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "roles_update_admin" ON roles FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "roles_delete_admin" ON roles FOR DELETE TO authenticated USING (is_admin());

-- =============================================
-- RLS POLICIES: role_criteria
-- =============================================
CREATE POLICY "criteria_select_authenticated" ON role_criteria FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "criteria_insert_admin" ON role_criteria FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "criteria_update_admin" ON role_criteria FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "criteria_delete_admin" ON role_criteria FOR DELETE TO authenticated USING (is_admin());

-- =============================================
-- RLS POLICIES: user_roles
-- =============================================
CREATE POLICY "user_roles_select_authenticated" ON user_roles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "user_roles_insert_admin" ON user_roles FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "user_roles_update_admin" ON user_roles FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "user_roles_delete_admin" ON user_roles FOR DELETE TO authenticated USING (is_admin());

-- =============================================
-- RLS POLICIES: time_logs
-- =============================================
CREATE POLICY "time_logs_select_self_or_admin" ON time_logs FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "time_logs_insert_self_or_admin" ON time_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR is_admin());
CREATE POLICY "time_logs_update_self_or_admin" ON time_logs FOR UPDATE TO authenticated USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "time_logs_delete_admin" ON time_logs FOR DELETE TO authenticated USING (is_admin());

-- =============================================
-- RLS POLICIES: weekly_stats
-- =============================================
CREATE POLICY "weekly_stats_select_self_or_admin" ON weekly_stats FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "weekly_stats_insert_self_or_admin" ON weekly_stats FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR is_admin());
CREATE POLICY "weekly_stats_update_self_or_admin" ON weekly_stats FOR UPDATE TO authenticated USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "weekly_stats_delete_admin" ON weekly_stats FOR DELETE TO authenticated USING (is_admin());
