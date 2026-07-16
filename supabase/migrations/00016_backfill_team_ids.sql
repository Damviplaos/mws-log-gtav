-- =============================================
-- Backfill team_id on all tables from profiles
-- =============================================

-- user_presence: set team_id from the user's profile
UPDATE public.user_presence up
SET team_id = p.team_id
FROM public.profiles p
WHERE up.user_id = p.id AND up.team_id IS NULL AND p.team_id IS NOT NULL;

-- queue_pointer: set team_id from owner's profile (default pointer)
UPDATE public.queue_pointer qp
SET team_id = (
  SELECT p.team_id FROM public.profiles p
  WHERE p.id = '00000000-0000-0000-0000-000000000001'
)
WHERE qp.team_id IS NULL;

-- time_logs: set team_id from user's profile
UPDATE public.time_logs tl
SET team_id = p.team_id
FROM public.profiles p
WHERE tl.user_id = p.id AND tl.team_id IS NULL AND p.team_id IS NOT NULL;

-- presence_logs: set team_id from user's profile
UPDATE public.presence_logs pl
SET team_id = p.team_id
FROM public.profiles p
WHERE pl.user_id = p.id AND pl.team_id IS NULL AND p.team_id IS NOT NULL;

-- weekly_stats: set team_id from user's profile
UPDATE public.weekly_stats ws
SET team_id = p.team_id
FROM public.profiles p
WHERE ws.user_id = p.id AND ws.team_id IS NULL AND p.team_id IS NOT NULL;

-- warnings: set team_id from user's profile
UPDATE public.warnings w
SET team_id = p.team_id
FROM public.profiles p
WHERE w.user_id = p.id AND w.team_id IS NULL AND p.team_id IS NOT NULL;

-- role_criteria: set team_id from roles table
UPDATE public.role_criteria rc
SET team_id = r.team_id
FROM public.roles r
WHERE rc.role_id = r.id AND rc.team_id IS NULL AND r.team_id IS NOT NULL;

-- user_roles: set team_id from roles table
UPDATE public.user_roles ur
SET team_id = r.team_id
FROM public.roles r
WHERE ur.role_id = r.id AND ur.team_id IS NULL AND r.team_id IS NOT NULL;

-- role_permissions: set team_id from roles table
UPDATE public.role_permissions rp
SET team_id = r.team_id
FROM public.roles r
WHERE rp.role_id = r.id AND rp.team_id IS NULL AND r.team_id IS NOT NULL;

-- system_settings: set team_id from default team
UPDATE public.system_settings ss
SET team_id = '00000000-0000-0000-0000-000000000001'
WHERE ss.team_id IS NULL;
