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
  advanceQueuePointer,
  randomSelectOP,
  getLastChannelId,
} from '@/services/presenceService';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function useQueue() {
  const { user, profile } = useAuth();
  const [presenceList, setPresenceList] = useState<PresenceWithProfile[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [pointer, setPointer] = useState<QueuePointer | null>(null);
  const [loading, setLoading] = useState(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    const [pList, chList, ptr] = await Promise.all([
      getAllPresence(),
      getChannels(),
      getQueuePointer(),
    ]);
    setPresenceList(pList);
    setChannels(chList);
    setPointer(ptr);
  }, []);

  // Auto-join on mount (restore last channel after refresh/F5)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      try {
        if (!joinedRef.current) {
          const lastChannelId = getLastChannelId();
          await joinPresence(lastChannelId ?? undefined);
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
  }, [user, fetchAll]);

  // Leave on window unload
  useEffect(() => {
    const handler = () => { leavePresence().catch(() => {}); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('queue-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_pointer' }, () => {
        getQueuePointer().then(p => setPointer(p));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchAll())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  const myPresence = presenceList.find(p => p.user_id === user?.id);
  const myChannel = channels.find(c => c.id === myPresence?.channel_id);
  const readyChannel = channels.find(c => c.name === 'ready');

  const handleSwitchChannel = useCallback(async (channelId: string) => {
    try {
      await switchChannel(channelId);
      // Realtime will update list
    } catch (err) {
      toast.error('ย้ายห้องไม่สำเร็จ');
      console.error(err);
    }
  }, []);

  const handleToggleOP = useCallback(async () => {
    if (!myPresence) return;
    try {
      await setOPStatus(!myPresence.is_op);
    } catch (err) {
      toast.error('เปลี่ยนสถานะ OP ไม่สำเร็จ');
      console.error(err);
    }
  }, [myPresence]);

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
      await supabase
        .from('user_presence')
        .update({ is_op: true })
        .eq('user_id', userId);
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

  // Group presenceList by channel
  const presenceByChannel = channels.reduce<Record<string, PresenceWithProfile[]>>((acc, ch) => {
    acc[ch.id] = presenceList
      .filter(p => p.channel_id === ch.id)
      .sort((a, b) => new Date(a.joined_channel_at).getTime() - new Date(b.joined_channel_at).getTime());
    return acc;
  }, {});

  // OP list — only from ready channel
  const opList = presenceList.filter(p => p.is_op && p.channel_id === readyChannel?.id);

  return {
    presenceList,
    presenceByChannel,
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
    fetchAll,
  };
}
