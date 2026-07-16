import { supabase } from '@/db/supabase';
import type { Channel, PresenceWithProfile, QueuePointer } from '@/types/types';

// =============================================
// Presence API
// =============================================

export async function joinPresence(channelId?: string) {
  const { data, error } = await supabase.functions.invoke('manage-presence', {
    body: { action: 'join', channel_id: channelId ?? null },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(msg || error.message);
  }
  return data;
}

export async function leavePresence() {
  const { data, error } = await supabase.functions.invoke('manage-presence', {
    body: { action: 'leave' },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(msg || error.message);
  }
  return data;
}

export async function sendHeartbeat() {
  const { error } = await supabase.functions.invoke('manage-presence', {
    body: { action: 'heartbeat' },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    console.error('Heartbeat error:', msg || error.message);
  }
}

export async function setOPStatus(isOp: boolean) {
  const { data, error } = await supabase.functions.invoke('manage-presence', {
    body: { action: 'set_op', is_op: isOp },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(msg || error.message);
  }
  return data;
}

const LAST_CHANNEL_KEY = 'medic:last_channel_id';

export function saveLastChannelId(channelId: string) {
  try { localStorage.setItem(LAST_CHANNEL_KEY, channelId); } catch {}
}

export function getLastChannelId(): string | null {
  try { return localStorage.getItem(LAST_CHANNEL_KEY); } catch { return null; }
}

export async function switchChannel(channelId: string) {
  const { data, error } = await supabase.functions.invoke('manage-presence', {
    body: { action: 'join', channel_id: channelId },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(msg || error.message);
  }
  saveLastChannelId(channelId);
  return data;
}

// =============================================
// Channels
// =============================================

export async function getChannels(): Promise<Channel[]> {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? (data as Channel[]) : [];
}

export async function updateChannelTrackTime(channelId: string, trackTime: boolean) {
  const { error } = await supabase
    .from('channels')
    .update({ track_time: trackTime })
    .eq('id', channelId);
  if (error) throw error;
}

export async function addChannel(displayName: string): Promise<Channel> {
  const { data: existing } = await supabase
    .from('channels')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);
  const maxOrder = existing?.[0]?.sort_order ?? 0;
  const slug = displayName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-ก-๙]/g, '') || `ch-${Date.now()}`;
  const { data, error } = await supabase
    .from('channels')
    .insert({ name: slug, display_name: displayName.trim(), sort_order: maxOrder + 1, track_time: true })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Channel;
}

export async function deleteChannel(channelId: string) {
  // Try edge function first (uses service_role to bypass RLS)
  try {
    const { data, error } = await supabase.functions.invoke('delete-channel', {
      body: { channel_id: channelId },
      method: 'POST',
    });
    if (error) {
      const msg = await error?.context?.text?.();
      throw new Error(msg || error.message);
    }
    if (data?.error) throw new Error(data.error);
    return;
  } catch (_edgeFnError) {
    // Edge function failed — fall back to direct Supabase delete with admin RLS
  }

  // Fallback: direct delete via client (admin user via RLS policy)
  // 1. Find fallback channel to migrate users
  const { data: otherChannels } = await supabase
    .from('channels')
    .select('id')
    .neq('id', channelId)
    .order('sort_order', { ascending: true })
    .limit(1);

  const fallbackChannelId = otherChannels?.[0]?.id ?? null;

  // 2. Migrate or remove users in this channel
  if (fallbackChannelId) {
    await supabase
      .from('user_presence')
      .update({ channel_id: fallbackChannelId, joined_channel_at: new Date().toISOString() })
      .eq('channel_id', channelId);
  } else {
    await supabase.from('user_presence').delete().eq('channel_id', channelId);
  }

  // 3. Nullify presence_logs references
  await supabase.from('presence_logs').update({ from_channel_id: null }).eq('from_channel_id', channelId);
  await supabase.from('presence_logs').update({ to_channel_id: null }).eq('to_channel_id', channelId);

  // 4. Delete the channel
  const { error: deleteError } = await supabase
    .from('channels')
    .delete()
    .eq('id', channelId);

  if (deleteError) throw new Error('ลบห้องไม่สำเร็จ: ' + deleteError.message);
}

// =============================================
// Presence List (all online users)
// =============================================

export async function getAllPresence(): Promise<PresenceWithProfile[]> {
  const { data, error } = await supabase
    .from('user_presence')
    .select(`
      *,
      profile:profiles!user_presence_user_id_fkey(*),
      channel:channels!user_presence_channel_id_fkey(*)
    `)
    .order('joined_channel_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? (data as PresenceWithProfile[]) : [];
}

// =============================================
// Queue Pointer
// =============================================

export async function getQueuePointer(): Promise<QueuePointer | null> {
  const { data, error } = await supabase
    .from('queue_pointer')
    .select('*')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .maybeSingle();
  if (error) throw error;
  return data as QueuePointer | null;
}

export async function advanceQueuePointer(currentPointedUserId: string | null, readyChannelId: string) {
  // Get all users in ready channel ordered by join time
  const { data: queue } = await supabase
    .from('user_presence')
    .select('user_id, joined_channel_at')
    .eq('channel_id', readyChannelId)
    .order('joined_channel_at', { ascending: true });

  if (!queue || queue.length === 0) {
    await supabase
      .from('queue_pointer')
      .update({ pointed_user_id: null, updated_at: new Date().toISOString() })
      .eq('id', '00000000-0000-0000-0000-000000000001');
    return;
  }

  if (!currentPointedUserId) {
    // Point to first
    await supabase
      .from('queue_pointer')
      .update({ pointed_user_id: queue[0].user_id, updated_at: new Date().toISOString() })
      .eq('id', '00000000-0000-0000-0000-000000000001');
    return;
  }

  const idx = queue.findIndex(q => q.user_id === currentPointedUserId);
  const nextIdx = (idx + 1) % queue.length;
  await supabase
    .from('queue_pointer')
    .update({ pointed_user_id: queue[nextIdx].user_id, updated_at: new Date().toISOString() })
    .eq('id', '00000000-0000-0000-0000-000000000001');
}

export async function randomSelectOP(readyChannelId: string) {
  const { data: queue } = await supabase
    .from('user_presence')
    .select('user_id')
    .eq('channel_id', readyChannelId)
    .eq('is_op', false);

  if (!queue || queue.length === 0) return null;
  const pick = queue[Math.floor(Math.random() * queue.length)];
  return pick.user_id;
}

// =============================================
// Admin: Move / Toggle OP for other users
// =============================================

export async function moveUserToChannel(targetUserId: string, channelId: string) {
  const { data, error } = await supabase.functions.invoke('manage-presence', {
    body: { action: 'move_user', target_user_id: targetUserId, channel_id: channelId },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(msg || error.message);
  }
  if (data?.error) throw new Error(data.error);
}

export async function setOPStatusForUser(targetUserId: string, isOp: boolean) {
  const { data, error } = await supabase.functions.invoke('manage-presence', {
    body: { action: 'set_op_others', target_user_id: targetUserId, is_op: isOp },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(msg || error.message);
  }
  if (data?.error) throw new Error(data.error);
}
