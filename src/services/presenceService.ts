import { supabase } from '@/db/supabase';
import type { Channel, PresenceWithProfile, QueuePointer } from '@/types/types';

// =============================================
// Presence API
// =============================================

export async function joinPresence(channelId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('ไม่ได้เข้าสู่ระบบ');

  // Check if user already has active presence — ALWAYS preserve their position
  const { data: existing } = await supabase
    .from('user_presence')
    .select('channel_id, is_op')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    // User already online — just update heartbeat, don't move them
    saveLastChannelId(existing.channel_id);
    await supabase
      .from('user_presence')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('user_id', user.id);
    return existing;
  }

  // No existing presence — try edge function first
  try {
    const { data, error } = await supabase.functions.invoke('manage-presence', {
      body: { action: 'join', channel_id: channelId ?? null },
      method: 'POST',
    });
    if (error) {
      const msg = await error?.context?.text?.();
      throw new Error(msg || error.message);
    }
    return data;
  } catch (_e) {
    // Edge function not deployed — fall back to direct DB
  }

  let targetChannelId = channelId;
  if (!targetChannelId) {
    const { data: readyCh } = await supabase
      .from('channels')
      .select('id')
      .eq('name', 'ready')
      .maybeSingle();
    targetChannelId = readyCh?.id;
  }
  if (!targetChannelId) throw new Error('ไม่พบห้องพร้อมทำงาน');

  // Insert new
  const { data: newPresence, error: insertErr } = await supabase
    .from('user_presence')
    .insert({
      user_id: user.id,
      channel_id: targetChannelId,
      joined_channel_at: new Date().toISOString(),
      session_started_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString(),
      is_op: false,
    })
    .select()
    .maybeSingle();
  if (insertErr) throw insertErr;

  // Start time log if channel tracks time
  const { data: ch } = await supabase
    .from('channels')
    .select('track_time')
    .eq('id', targetChannelId)
    .maybeSingle();
  if (ch?.track_time) {
    await supabase.from('time_logs').insert({
      user_id: user.id,
      channel_id: targetChannelId,
      started_at: new Date().toISOString(),
      is_op_time: false,
    });
  }

  return newPresence;
}

export async function leavePresence() {
  try {
    const { data, error } = await supabase.functions.invoke('manage-presence', {
      body: { action: 'leave' },
      method: 'POST',
    });
    if (error) {
      const msg = await error?.context?.text?.();
      throw new Error(msg || error.message);
    }
    return data;
  } catch (_e) {
    // Edge function not deployed — fall back to direct DB
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('time_logs')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('ended_at', null);

  await supabase.from('user_presence').delete().eq('user_id', user.id);
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
  try {
    const { data, error } = await supabase.functions.invoke('manage-presence', {
      body: { action: 'set_op', is_op: isOp },
      method: 'POST',
    });
    if (error) {
      const msg = await error?.context?.text?.();
      throw new Error(msg || error.message);
    }
    return data;
  } catch (_e) {
    // Edge function not deployed — fall back to direct DB
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('ไม่ได้เข้าสู่ระบบ');

  // Close any open time log
  await supabase.from('time_logs').update({ ended_at: new Date().toISOString() }).eq('user_id', user.id).is('ended_at', null);

  // Find OP/ready channels
  const { data: opCh } = await supabase.from('channels').select('id').eq('name', 'op').maybeSingle();
  const { data: readyCh } = await supabase.from('channels').select('id').eq('name', 'ready').maybeSingle();

  const { data: tp } = await supabase.from('user_presence').select('channel_id').eq('user_id', user.id).maybeSingle();
  let newChannelId = tp?.channel_id;
  if (isOp && opCh) newChannelId = opCh.id;
  else if (!isOp && readyCh) newChannelId = readyCh.id;

  const { error: opErr } = await supabase
    .from('user_presence')
    .update({ is_op: isOp, channel_id: newChannelId, joined_channel_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (opErr) throw opErr;

  if (newChannelId) {
    saveLastChannelId(newChannelId);
    const { data: ch } = await supabase.from('channels').select('track_time').eq('id', newChannelId).maybeSingle();
    if (ch?.track_time) {
      await supabase.from('time_logs').insert({ user_id: user.id, channel_id: newChannelId, started_at: new Date().toISOString(), is_op_time: isOp });
    }
  }
}

const LAST_CHANNEL_KEY = 'medic:last_channel_id';

export function saveLastChannelId(channelId: string) {
  try { localStorage.setItem(LAST_CHANNEL_KEY, channelId); } catch {}
}

export function getLastChannelId(): string | null {
  try { return localStorage.getItem(LAST_CHANNEL_KEY); } catch { return null; }
}

export async function switchChannel(channelId: string) {
  try {
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
  } catch (_e) {
    // Edge function not deployed — fall back to direct DB
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('ไม่ได้เข้าสู่ระบบ');

  // Close any open time log
  await supabase.from('time_logs').update({ ended_at: new Date().toISOString() }).eq('user_id', user.id).is('ended_at', null);

  const { data: existing } = await supabase.from('user_presence').select('id').eq('user_id', user.id).maybeSingle();

  if (existing) {
    const { error: updateErr } = await supabase
      .from('user_presence')
      .update({ channel_id: channelId, joined_channel_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (updateErr) throw updateErr;
  } else {
    const { error: insertErr } = await supabase
      .from('user_presence')
      .insert({ user_id: user.id, channel_id: channelId, is_op: false, joined_channel_at: new Date().toISOString(), last_heartbeat: new Date().toISOString() });
    if (insertErr) throw insertErr;
  }

  saveLastChannelId(channelId);
  const { data: ch } = await supabase.from('channels').select('track_time').eq('id', channelId).maybeSingle();
  if (ch?.track_time) {
    await supabase.from('time_logs').insert({ user_id: user.id, channel_id: channelId, started_at: new Date().toISOString(), is_op_time: false });
  }
}

// =============================================
// Channels — fallback to all if team filter returns empty
// =============================================

export async function getChannels(teamId?: string): Promise<Channel[]> {
  if (teamId) {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('team_id', teamId)
      .order('sort_order', { ascending: true });
    if (!error && Array.isArray(data) && data.length > 0) return data as Channel[];
  }
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

export async function addChannel(displayName: string, teamId?: string): Promise<Channel> {
  const { data: existing } = await supabase
    .from('channels')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);
  const maxOrder = existing?.[0]?.sort_order ?? 0;
  const slug = displayName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-ก-๙]/g, '') || `ch-${Date.now()}`;
  const insertData: Record<string, unknown> = { name: slug, display_name: displayName.trim(), sort_order: maxOrder + 1, track_time: true };
  if (teamId) insertData.team_id = teamId;
  const { data, error } = await supabase
    .from('channels')
    .insert(insertData)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Channel;
}

export async function deleteChannel(channelId: string) {
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
    // Edge function failed — fall back to direct Supabase delete
  }

  const { data: otherChannels } = await supabase
    .from('channels')
    .select('id')
    .neq('id', channelId)
    .order('sort_order', { ascending: true })
    .limit(1);

  const fallbackChannelId = otherChannels?.[0]?.id ?? null;

  if (fallbackChannelId) {
    await supabase
      .from('user_presence')
      .update({ channel_id: fallbackChannelId, joined_channel_at: new Date().toISOString() })
      .eq('channel_id', channelId);
  } else {
    await supabase.from('user_presence').delete().eq('channel_id', channelId);
  }

  await supabase.from('presence_logs').update({ from_channel_id: null }).eq('from_channel_id', channelId);
  await supabase.from('presence_logs').update({ to_channel_id: null }).eq('to_channel_id', channelId);
  await supabase.from('time_logs').delete().eq('channel_id', channelId);

  const { error: deleteError } = await supabase
    .from('channels')
    .delete()
    .eq('id', channelId);

  if (deleteError) throw new Error('ลบห้องไม่สำเร็จ: ' + deleteError.message);
}

// =============================================
// Presence List — fallback to all if team filter returns empty
// =============================================

export async function getAllPresence(teamId?: string): Promise<PresenceWithProfile[]> {
  if (teamId) {
    const { data, error } = await supabase
      .from('user_presence')
      .select(`
        *,
        profile:profiles!user_presence_user_id_fkey(*),
        channel:channels!user_presence_channel_id_fkey(*)
      `)
      .eq('team_id', teamId)
      .order('joined_channel_at', { ascending: true });
    if (!error && Array.isArray(data) && data.length > 0) return data as PresenceWithProfile[];
  }
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
// Queue Pointer — fallback to default if team filter returns null
// =============================================

export async function getQueuePointer(teamId?: string): Promise<QueuePointer | null> {
  if (teamId) {
    const { data, error } = await supabase
      .from('queue_pointer')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .eq('team_id', teamId)
      .maybeSingle();
    if (!error && data) return data as QueuePointer;
  }
  const { data, error } = await supabase
    .from('queue_pointer')
    .select('*')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .maybeSingle();
  if (error) throw error;
  return data as QueuePointer | null;
}

export async function advanceQueuePointer(currentPointedUserId: string | null, readyChannelId: string) {
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
  try {
    const { data, error } = await supabase.functions.invoke('manage-presence', {
      body: { action: 'move_user', target_user_id: targetUserId, channel_id: channelId },
      method: 'POST',
    });
    if (error) {
      const msg = await error?.context?.text?.();
      const errText = msg || error.message || '';
      // 403 = permission denied, don't silently swallow
      if (error.context?.status === 403 || errText.includes('403') || errText.includes('สิทธิ์')) {
        throw new Error(errText || 'ไม่มีสิทธิ์ย้ายผู้ใช้');
      }
      throw new Error(errText);
    }
    if (data?.error) throw new Error(data.error);
    return;
  } catch (e) {
    // If it's a permission error, re-throw
    if (e instanceof Error && (e.message.includes('สิทธิ์') || e.message.includes('403'))) {
      throw e;
    }
    // Edge function not deployed — fall back to direct DB
  }

  // Fallback: direct move
  const { error: closeErr } = await supabase
    .from('time_logs')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', targetUserId)
    .is('ended_at', null);
  if (closeErr) console.error('close time log error:', closeErr);

  const { error: moveErr } = await supabase
    .from('user_presence')
    .update({ channel_id: channelId, joined_channel_at: new Date().toISOString() })
    .eq('user_id', targetUserId);
  if (moveErr) throw moveErr;

  // Start new time log if channel tracks time
  const { data: ch } = await supabase
    .from('channels')
    .select('track_time')
    .eq('id', channelId)
    .maybeSingle();
  if (ch?.track_time) {
    await supabase.from('time_logs').insert({
      user_id: targetUserId,
      channel_id: channelId,
      started_at: new Date().toISOString(),
      is_op_time: false,
    });
  }
}

export async function setOPStatusForUser(targetUserId: string, isOp: boolean) {
  try {
    const { data, error } = await supabase.functions.invoke('manage-presence', {
      body: { action: 'set_op_others', target_user_id: targetUserId, is_op: isOp },
      method: 'POST',
    });
    if (error) {
      const msg = await error?.context?.text?.();
      const errText = msg || error.message || '';
      if (error.context?.status === 403 || errText.includes('403') || errText.includes('สิทธิ์')) {
        throw new Error(errText || 'ไม่มีสิทธิ์เปลี่ยนสถานะ OP');
      }
      throw new Error(errText);
    }
    if (data?.error) throw new Error(data.error);
    return;
  } catch (e) {
    if (e instanceof Error && (e.message.includes('สิทธิ์') || e.message.includes('403'))) {
      throw e;
    }
    // Edge function not deployed — fall back to direct DB
  }

  // Fallback: direct update — move to OP or ready room
  const { error: closeErr } = await supabase
    .from('time_logs')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', targetUserId)
    .is('ended_at', null);
  if (closeErr) console.error('close time log error:', closeErr);

  // Find OP/ready channels
  const { data: opCh } = await supabase.from('channels').select('id').eq('name', 'op').maybeSingle();
  const { data: readyCh } = await supabase.from('channels').select('id').eq('name', 'ready').maybeSingle();

  const { data: tp } = await supabase.from('user_presence').select('channel_id').eq('user_id', targetUserId).maybeSingle();
  let newChannelId = tp?.channel_id;
  if (isOp && opCh) newChannelId = opCh.id;
  else if (!isOp && readyCh) newChannelId = readyCh.id;

  const { error: opErr } = await supabase
    .from('user_presence')
    .update({ is_op: isOp, channel_id: newChannelId, joined_channel_at: new Date().toISOString() })
    .eq('user_id', targetUserId);
  if (opErr) throw opErr;

  if (newChannelId) {
    const { data: ch } = await supabase.from('channels').select('track_time').eq('id', newChannelId).maybeSingle();
    if (ch?.track_time) {
      await supabase.from('time_logs').insert({
        user_id: targetUserId,
        channel_id: newChannelId,
        started_at: new Date().toISOString(),
        is_op_time: isOp,
      });
    }
    // If this is the current user, save channel so refresh preserves position
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser && currentUser.id === targetUserId) {
      saveLastChannelId(newChannelId);
    }
  }
}

// =============================================
// Pairing (DB-backed via RPC)
// =============================================

export async function pairUsers(partnerUserId: string) {
  try {
    const { data, error } = await supabase.functions.invoke('manage-presence', {
      body: { action: 'pair_users', partner_user_id: partnerUserId },
      method: 'POST',
    });
    if (error) {
      const msg = await error?.context?.text?.();
      throw new Error(msg || error.message);
    }
    if (data?.error) throw new Error(data.error);
    return;
  } catch (_e) {
    // Edge function not deployed or failed — fall back
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('ไม่ได้เข้าสู่ระบบ');

  // Try RPC
  const { error: rpcErr } = await supabase.rpc('pair_users', { p_user_a: user.id, p_user_b: partnerUserId });
  if (!rpcErr) return;

  // RPC failed — direct DB fallback (update own row, then partner's row)
  await supabase.from('user_presence').update({ paired_with_user_id: partnerUserId }).eq('user_id', user.id);
  await supabase.from('user_presence').update({ paired_with_user_id: user.id }).eq('user_id', partnerUserId);
}

export async function pairUsersAsAdmin(targetUserId: string, partnerUserId: string) {
  try {
    const { data, error } = await supabase.functions.invoke('manage-presence', {
      body: { action: 'pair_users_admin', target_user_id: targetUserId, partner_user_id: partnerUserId },
      method: 'POST',
    });
    if (error) {
      const msg = await error?.context?.text?.();
      const errText = msg || error.message || '';
      if (error.context?.status === 403 || errText.includes('403') || errText.includes('สิทธิ์')) {
        throw new Error(errText || 'ไม่มีสิทธิ์จับคู่ให้ผู้อื่น');
      }
      throw new Error(errText);
    }
    if (data?.error) throw new Error(data.error);
    return;
  } catch (e) {
    if (e instanceof Error && (e.message.includes('สิทธิ์') || e.message.includes('403'))) {
      throw e;
    }
    // Edge function not deployed or failed — fall back
  }

  // Try RPC
  const { error: rpcErr } = await supabase.rpc('pair_users', { p_user_a: targetUserId, p_user_b: partnerUserId });
  if (!rpcErr) return;

  // RPC failed — direct DB fallback
  await supabase.from('user_presence').update({ paired_with_user_id: partnerUserId }).eq('user_id', targetUserId);
  await supabase.from('user_presence').update({ paired_with_user_id: targetUserId }).eq('user_id', partnerUserId);
}

export async function cancelPair() {
  try {
    const { data, error } = await supabase.functions.invoke('manage-presence', {
      body: { action: 'cancel_pair' },
      method: 'POST',
    });
    if (error) {
      const msg = await error?.context?.text?.();
      throw new Error(msg || error.message);
    }
    if (data?.error) throw new Error(data.error);
    return;
  } catch (_e) {
    // Edge function not deployed or failed — fall back
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Try RPC
  const { error: rpcErr } = await supabase.rpc('cancel_pair', { p_user_id: user.id });
  if (!rpcErr) return;

  // RPC failed — direct DB fallback: find partner then clear both sides
  const { data: myPresence } = await supabase.from('user_presence').select('paired_with_user_id').eq('user_id', user.id).maybeSingle();
  const partnerId = myPresence?.paired_with_user_id;
  await supabase.from('user_presence').update({ paired_with_user_id: null }).eq('user_id', user.id);
  if (partnerId) {
    await supabase.from('user_presence').update({ paired_with_user_id: null }).eq('user_id', partnerId);
  }
}
