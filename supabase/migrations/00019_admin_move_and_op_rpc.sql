-- 00019: Add admin_move_user and admin_set_op RPCs (SECURITY DEFINER)
-- These bypass RLS so non-admin users with permissions can move/set OP others

-- =============================================
-- 1. admin_move_user: Move a user to a different channel
-- =============================================
CREATE OR REPLACE FUNCTION public.admin_move_user(p_target_user_id UUID, p_channel_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE user_presence
  SET channel_id = p_channel_id,
      joined_channel_at = now()
  WHERE user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_move_user(UUID, UUID) TO authenticated;

-- =============================================
-- 2. admin_set_op: Set OP status for a user and move to appropriate channel
-- =============================================
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
  SET is_op = p_is_op,
      channel_id = new_channel_id,
      joined_channel_at = now()
  WHERE user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_set_op(UUID, BOOLEAN) TO authenticated;
