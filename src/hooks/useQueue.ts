import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/db/supabase';
import type { Channel, PresenceWithProfile, QueuePointer } from '@/types/types';
import {
  getAllPresence,
  getChannels,
  getQueuePointer,
  joinPresence,
  leavePresence,
  sendHeartbeat,
  switchChannel,
  setOPStatus,
  setOPStatusForUser,
  advanceQueuePointer,
  randomSelectOP,
  getLastChannelId,
  saveLastChannelId,
  pairUsers,
  cancelPair,
} from '@/services/presenceService';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { toast } from 'sonner';

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export function useQueue() {
  const { user, profile } = useAuth();
  const { currentTeam } = useTeam();
  const teamId = currentTeam?.id;
  const [presenceList, setPresenceList] = useState<PresenceWithProfile[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [pointer, setPointer] = useState<QueuePointer | null>(null);
  const [loading, setLoading] = useState(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinedRef = useRef(false);
  const prevTeamRef = useRef<string | undefined>(undefined);

  const fetchAll = useCallback(async () => {
    try {
      const [pList, chList, ptr] = await Promise.all([
        withTimeout(getAllPresence(teamId), 10000, []),
        withTimeout(getChannels(teamId), 10000, []),
        withTimeout(getQueuePointer(teamId), 10000, null),
      ]);
      setPresenceList(pList);
      setChannels(chList);
      setPointer(ptr);
    } catch (err) {
      console.error('fetchAll error:', err);
    }
  }, [teamId]);

  // Auto-join on mount and re-join when team changes
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      try {
        // Re-join if team changed
        if (prevTeamRef.current !== teamId) {
          joinedRef.current = false;
          prevTeamRef.current = teamId;
        }

        if (!joinedRef.current) {
          const lastChannelId = getLastChannelId();
          await withTimeout(joinPresence(lastChannelId ?? undefined), 10000, null);
          joinedRef.current = true;
        }
        if (!cancelled) await fetchAll();
      } catch (err) {
        console.error('Join presence failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();

    // Heartbeat every 30s
    heartbeatRef.current = setInterval(() => sendHeartbeat(), 30000);

    return () => {
      cancelled = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [user, fetchAll, teamId]);

  // Leave on window unload
  useEffect(() => {
    const handler = () => { leavePresence().catch(() => {}); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Realtime subscriptions — debounced to prevent storms
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetchAll = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { fetchAll(); }, 400);
    };
    let pointerDebounce: ReturnType<typeof setTimeout> | null = null;
    const debouncedPointer = () => {
      if (pointerDebounce) clearTimeout(pointerDebounce);
      pointerDebounce = setTimeout(() => {
        getQueuePointer(teamId).then(p => setPointer(p));
      }, 400);
    };

    const channel = supabase
      .channel('queue-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, debouncedFetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_pointer' }, debouncedPointer)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (pointerDebounce) clearTimeout(pointerDebounce);
      supabase.removeChannel(channel);
    };
  }, [fetchAll, teamId]);

  const myPresence = presenceList.find(p => p.user_id === user?.id);
  const myChannel = channels.find(c => c.id === myPresence?.channel_id);
  const readyChannel = channels.find(c => c.name === 'ready');

  const handleSwitchChannel = useCallback(async (channelId: string) => {
    try {
      await switchChannel(channelId);
    } catch (err) {
      toast.error('ย้ายห้องไม่สำเร็จ');
      console.error(err);
    }
  }, []);

  const handleToggleOP = useCallback(async () => {
    if (!myPresence) return;
    try {
      await setOPStatus(!myPresence.is_op);
      // Save channel ID so refresh puts us back in the right room
      if (!myPresence.is_op) {
        // Becoming OP — find the OP channel
        const opChannel = channels.find(c => c.name === 'op');
        if (opChannel) saveLastChannelId(opChannel.id);
      } else {
        // Leaving OP — go back to ready
        const readyCh = channels.find(c => c.name === 'ready');
        if (readyCh) saveLastChannelId(readyCh.id);
      }
    } catch (err) {
      toast.error('เปลี่ยนสถานะ OP ไม่สำเร็จ');
      console.error(err);
    }
  }, [myPresence, channels]);

  const handleNextPointer = useCallback(async () => {
    if (!myPresence?.is_op) return;
    const readyChannel = channels.find(c => c.name === 'ready');
    if (!readyChannel) return;
    try {
      await advanceQueuePointer(pointer?.pointed_user_id ?? null, readyChannel.id);
    } catch (err) {
      toast.error('เลื่อนคิวไม่สำเร็จ');
      console.error(err);
    }
  }, [myPresence, channels, pointer]);

  const handleRandomOP = useCallback(async () => {
    const readyChannel = channels.find(c => c.name === 'ready');
    if (!readyChannel) return;
    try {
      const userId = await randomSelectOP(readyChannel.id);
      if (!userId) {
        toast.error('ไม่มีคนในห้องพร้อมทำงาน');
        return;
      }
      // Use setOPStatusForUser to properly move user to OP room
      await setOPStatusForUser(userId, true);
    } catch (err) {
      toast.error('สุ่ม OP ไม่สำเร็จ');
      console.error(err);
    }
  }, [channels]);

  const handleLeave = useCallback(async () => {
    try {
      await leavePresence();
      joinedRef.current = false;
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handlePair = useCallback(async (partnerUserId: string) => {
    try {
      await pairUsers(partnerUserId);
      await fetchAll();
    } catch (err) {
      console.error('Pair error:', err);
      throw err;
    }
  }, [fetchAll]);

  const handleCancelPair = useCallback(async () => {
    try {
      await cancelPair();
      await fetchAll();
    } catch (err) {
      console.error('Cancel pair error:', err);
    }
  }, [fetchAll]);

  // Group presenceList by channel
  const presenceByChannel = channels.reduce<Record<string, PresenceWithProfile[]>>((acc, ch) => {
    acc[ch.id] = presenceList
      .filter(p => p.channel_id === ch.id)
      .sort((a, b) => new Date(a.joined_channel_at).getTime() - new Date(b.joined_channel_at).getTime());
    return acc;
  }, {});

  // OP list — users with is_op=true (from OP channel or any channel)
  const opList = presenceList.filter(p => p.is_op);

  // Filter OP users out of ready channel display (they only show in OP box)
  const filteredPresenceByChannel = Object.fromEntries(
    Object.entries(presenceByChannel).map(([chId, presences]) => {
      const ch = channels.find(c => c.id === chId);
      if (ch?.name === 'ready') {
        return [chId, presences.filter(p => !p.is_op)];
      }
      return [chId, presences];
    })
  );

  return {
    presenceList,
    presenceByChannel: filteredPresenceByChannel,
    channels,
    pointer,
    myPresence,
    myChannel,
    opList,
    loading,
    profile,
    handleSwitchChannel,
    handleToggleOP,
    handleNextPointer,
    handleRandomOP,
    handleLeave,
    handlePair,
    handleCancelPair,
    fetchAll,
  };
}
