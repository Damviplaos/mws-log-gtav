import { supabase } from '@/db/supabase';
import type { Role, RoleCriteria, UserRole, WeeklyStats, RolePermission, PresenceLog } from '@/types/types';

// =============================================
// Roles
// =============================================

export async function getRoles(): Promise<Role[]> {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? (data as Role[]) : [];
}

export async function createRole(name: string, color: string): Promise<Role> {
  const { data: existing } = await supabase.from('roles').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  const maxOrder = existing?.[0]?.sort_order ?? 0;
  const { data, error } = await supabase
    .from('roles')
    .insert({ name, color, sort_order: maxOrder + 1 })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Role;
}

export async function updateRole(id: string, updates: Partial<Pick<Role, 'name' | 'color' | 'sort_order'>>) {
  const { error } = await supabase.from('roles').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteRole(id: string) {
  const { data, error } = await supabase.functions.invoke('delete-role', {
    body: { role_id: id },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(msg || error.message);
  }
  if (data?.error) throw new Error(data.error);
}

export async function reorderRoles(orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from('roles').update({ sort_order: idx }).eq('id', id)
    )
  );
}

// =============================================
// Role Criteria
// =============================================

export async function getRoleCriteria(roleId: string): Promise<RoleCriteria | null> {
  const { data, error } = await supabase
    .from('role_criteria')
    .select('*')
    .eq('role_id', roleId)
    .maybeSingle();
  if (error) throw error;
  return data as RoleCriteria | null;
}

export async function upsertRoleCriteria(criteria: Omit<RoleCriteria, 'id' | 'created_at'>) {
  const { error } = await supabase
    .from('role_criteria')
    .upsert(criteria, { onConflict: 'role_id' });
  if (error) throw error;
}

// =============================================
// User Permissions (from role_permissions)
// =============================================

export async function getUserPermissions(userId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_user_permissions', { p_user_id: userId });
  if (error) return [];
  return Array.isArray(data) ? data.map((row: { permission: string }) => row.permission) : [];
}

// =============================================
// User Roles
// =============================================

export async function getUserRoles(userId: string): Promise<UserRole[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('*, role:roles(*)')
    .eq('user_id', userId)
    .order('assigned_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? (data as UserRole[]) : [];
}

export async function getAllUserRoles(): Promise<UserRole[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('*, role:roles(*), profile:profiles(*)')
    .order('assigned_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? (data as UserRole[]) : [];
}

export async function assignRole(userId: string, roleId: string, assignedBy: string) {
  const { error } = await supabase
    .from('user_roles')
    .insert({ user_id: userId, role_id: roleId, assigned_by: assignedBy });
  if (error) throw error;
}

export async function removeRole(userId: string, roleId: string) {
  const { error } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role_id', roleId);
  if (error) throw error;
}

// =============================================
// Weekly Stats
// =============================================

export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

export async function getWeeklyStats(userId: string, weekStart: string): Promise<WeeklyStats | null> {
  const { data, error } = await supabase
    .from('weekly_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  return data as WeeklyStats | null;
}

export async function getAllWeeklyStats(weekStart: string): Promise<WeeklyStats[]> {
  const { data, error } = await supabase
    .from('weekly_stats')
    .select('*, profile:profiles(*)')
    .eq('week_start', weekStart)
    .order('total_work_seconds', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? (data as WeeklyStats[]) : [];
}

export async function refreshWeeklyStats(userId: string) {
  const weekStart = getWeekStart();
  await supabase.rpc('upsert_weekly_stats', { p_user_id: userId, p_week_start: weekStart });
}

export async function getDailyStats(userId: string, date: string) {
  const { data, error } = await supabase.rpc('get_daily_stats', {
    p_user_id: userId,
    p_date: date,
  });
  if (error) throw error;
  return data?.[0] ?? { total_work_seconds: 0, total_op_seconds: 0 };
}

// =============================================
// All Profiles (for admin)
// =============================================

export async function getAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('username', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function updateProfile(userId: string, updates: { nickname?: string; ic_name?: string }) {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);
  if (error) throw error;
}

export async function updateUserByAdmin(
  userId: string,
  updates: { nickname?: string | null; ic_name?: string | null; system_role?: string }
) {
  const body: Record<string, unknown> = { user_id: userId };
  if (Object.prototype.hasOwnProperty.call(updates, 'nickname')) body.nickname = updates.nickname ?? null;
  if (Object.prototype.hasOwnProperty.call(updates, 'ic_name')) body.ic_name = updates.ic_name ?? null;
  if (Object.prototype.hasOwnProperty.call(updates, 'system_role')) body.system_role = updates.system_role;

  const { data, error } = await supabase.functions.invoke('update-user', {
    body,
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(msg || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function changePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function createUserByAdmin(username: string, password: string, systemRole: string) {
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { username, password, system_role: systemRole },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(msg || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function deleteUserByAdmin(userId: string) {
  const { data, error } = await supabase.functions.invoke('delete-user', {
    body: { user_id: userId },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(msg || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function changeUserPassword(userId: string, newPassword: string) {
  const { data, error } = await supabase.functions.invoke('change-password', {
    body: { user_id: userId, new_password: newPassword },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(msg || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// =============================================
// Presence Logs (room change history)
// =============================================

export async function getPresenceLogs(limit = 100): Promise<PresenceLog[]> {
  const { data, error } = await supabase
    .from('presence_logs')
    .select(`
      *,
      profile:profiles!presence_logs_user_id_fkey(*),
      from_channel:channels!presence_logs_from_channel_id_fkey(*),
      to_channel:channels!presence_logs_to_channel_id_fkey(*)
    `)
    .order('changed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return Array.isArray(data) ? (data as PresenceLog[]) : [];
}

// =============================================
// Role Permissions
// =============================================

export async function getRolePermissions(roleId: string): Promise<RolePermission[]> {
  const { data, error } = await supabase
    .from('role_permissions')
    .select('*')
    .eq('role_id', roleId);
  if (error) throw error;
  return Array.isArray(data) ? (data as RolePermission[]) : [];
}

export async function setRolePermissions(
  roleId: string,
  permissions: Record<string, boolean>
) {
  // Delete all existing permissions for this role
  await supabase.from('role_permissions').delete().eq('role_id', roleId);

  // Insert enabled ones
  const rows = Object.entries(permissions)
    .map(([permission, enabled]) => ({ role_id: roleId, permission, enabled }));

  if (rows.length === 0) return;

  const { error } = await supabase.from('role_permissions').insert(rows);
  if (error) throw error;
}

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getWarnings(userId?: string): Promise<Array<{
  id: string; reason: string; issued_at: string; is_active: boolean;
  severity: string; expires_at: string | null; created_at: string;
}>> {
  let q = supabase.from('warnings').select('*').order('created_at', { ascending: false });
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// =============================================
// Time Log Management (admin)
// =============================================

export async function deleteUserTimeLogs(userId: string) {
  // Close any open time log first
  await supabase
    .from('time_logs')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('ended_at', null);

  // Delete all time logs for this user
  const { error } = await supabase
    .from('time_logs')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;

  // Reset weekly stats
  const weekStart = getWeekStart();
  await supabase.rpc('upsert_weekly_stats', { p_user_id: userId, p_week_start: weekStart });
}
