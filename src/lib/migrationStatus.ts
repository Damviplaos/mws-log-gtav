import { supabase } from '@/db/supabase';

const CACHE_KEY = 'medic:migration_status';
const CACHE_TTL = 3600000; // 1 hour

export interface MigrationStatus {
  hasPairedColumn: boolean;
  hasPairRPC: boolean;
  hasAdminMoveRPC: boolean;
  hasAdminSetOpRPC: boolean;
  checkedAt: number;
}

let cachedStatus: MigrationStatus | null = null;

function loadCache(): MigrationStatus | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MigrationStatus;
    if (Date.now() - parsed.checkedAt > CACHE_TTL) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(status: MigrationStatus) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(status));
  } catch {}
}

async function checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
  try {
    // Try selecting the column — if it doesn't exist, PostgREST returns an error
    const { error } = await supabase
      .from(tableName)
      .select(columnName)
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function checkRPCExists(rpcName: string, params: Record<string, string>): Promise<boolean> {
  try {
    const { error } = await supabase.rpc(rpcName, params);
    // PGRST202 = function not found in schema cache
    if (error?.code === 'PGRST202') return false;
    // Other errors (permission, constraint, etc.) = function exists
    return true;
  } catch {
    return false;
  }
}

export async function getMigrationStatus(forceRefresh = false): Promise<MigrationStatus> {
  if (!forceRefresh && cachedStatus) return cachedStatus;

  const cached = loadCache();
  if (!forceRefresh && cached) {
    cachedStatus = cached;
    return cached;
  }

  const [hasPairedColumn, hasPairRPC, hasAdminMoveRPC, hasAdminSetOpRPC] = await Promise.all([
    checkColumnExists('user_presence', 'paired_with_user_id'),
    checkRPCExists('pair_users', { p_user_a: '00000000-0000-0000-0000-000000000000', p_user_b: '00000000-0000-0000-0000-000000000000' }),
    checkRPCExists('admin_move_user', { p_target_user_id: '00000000-0000-0000-0000-000000000000', p_channel_id: '00000000-0000-0000-0000-000000000000' }),
    checkRPCExists('admin_set_op', { p_target_user_id: '00000000-0000-0000-0000-000000000000', p_is_op: 'false' }),
  ]);

  const status: MigrationStatus = {
    hasPairedColumn,
    hasPairRPC,
    hasAdminMoveRPC,
    hasAdminSetOpRPC,
    checkedAt: Date.now(),
  };

  cachedStatus = status;
  saveCache(status);
  console.log('[MigrationStatus]', status);
  return status;
}

export function isFeatureAvailable(status: MigrationStatus, feature: 'pairing' | 'admin_move' | 'admin_setop'): boolean {
  switch (feature) {
    case 'pairing':
      return status.hasPairedColumn;
    case 'admin_move':
      return status.hasAdminMoveRPC;
    case 'admin_setop':
      return status.hasAdminSetOpRPC;
    default:
      return false;
  }
}

export function clearMigrationCache() {
  cachedStatus = null;
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}
