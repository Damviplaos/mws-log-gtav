-- =============================================
-- MEDIC LOG: Run this in Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/settwqznsqrcxakslfjuv/sql/new
-- =============================================

-- 1. Pairing: add paired_with_user_id column
ALTER TABLE user_presence ADD COLUMN IF NOT EXISTS paired_with_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_user_presence_paired ON user_presence(paired_with_user_id) WHERE paired_with_user_id IS NOT NULL;

-- 2. RPC: pair_users
CREATE OR REPLACE FUNCTION public.pair_users(p_user_a UUID, p_user_b UUID)
RETURNS void AS $$
BEGIN
  UPDATE user_presence SET paired_with_user_id = p_user_b WHERE user_id = p_user_a;
  UPDATE user_presence SET paired_with_user_id = p_user_a WHERE user_id = p_user_b;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC: cancel_pair
CREATE OR REPLACE FUNCTION public.cancel_pair(p_user_id UUID)
RETURNS void AS $$
DECLARE
  partner_id UUID;
BEGIN
  SELECT paired_with_user_id INTO partner_id FROM user_presence WHERE user_id = p_user_id;
  UPDATE user_presence SET paired_with_user_id = NULL WHERE user_id = p_user_id;
  IF partner_id IS NOT NULL THEN
    UPDATE user_presence SET paired_with_user_id = NULL WHERE user_id = partner_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: admin_move_user (bypasses RLS)
CREATE OR REPLACE FUNCTION public.admin_move_user(p_target_user_id UUID, p_channel_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE user_presence
  SET channel_id = p_channel_id, joined_channel_at = now()
  WHERE user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: admin_set_op (bypasses RLS)
CREATE OR REPLACE FUNCTION public.admin_set_op(p_target_user_id UUID, p_is_op BOOLEAN)
RETURNS void AS $$
DECLARE
  op_channel_id UUID;
  ready_channel_id UUID;
  new_channel_id UUID;
BEGIN
  SELECT id INTO op_channel_id FROM channels WHERE name = 'op' LIMIT 1;
  SELECT id INTO ready_channel_id FROM channels WHERE name = 'ready' LIMIT 1;

  IF p_is_op AND op_channel_id IS NOT NULL THEN
    new_channel_id := op_channel_id;
  ELSIF NOT p_is_op AND ready_channel_id IS NOT NULL THEN
    new_channel_id := ready_channel_id;
  ELSE
    SELECT channel_id INTO new_channel_id FROM user_presence WHERE user_id = p_target_user_id;
  END IF;

  UPDATE user_presence
  SET is_op = p_is_op, channel_id = new_channel_id, joined_channel_at = now()
  WHERE user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Grant permissions
GRANT EXECUTE ON FUNCTION public.pair_users(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_pair(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_move_user(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_op(UUID, BOOLEAN) TO authenticated;
