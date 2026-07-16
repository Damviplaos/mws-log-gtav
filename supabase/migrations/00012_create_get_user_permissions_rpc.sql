-- RPC: get_user_permissions
-- Returns all enabled permissions for a user based on their assigned roles
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS TABLE(permission TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT rp.permission
  FROM user_roles ur
  JOIN role_permissions rp ON rp.role_id = ur.role_id
  WHERE ur.user_id = p_user_id
    AND rp.enabled = true;
$$;

GRANT EXECUTE ON FUNCTION get_user_permissions(UUID) TO authenticated;
