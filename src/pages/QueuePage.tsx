import { useQueue } from '@/hooks/useQueue';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ChevronRight, Shuffle, ArrowRight, Star, UserCheck, X, ArrowLeftRight, Shield } from 'lucide-react';
import type { PresenceWithProfile, Channel } from '@/types/types';
import { getUserRoles } from '@/services/adminService';
import { moveUserToChannel, setOPStatusForUser, pairUsersAsAdmin } from '@/services/presenceService';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import type { Role } from '@/types/types';

// =============================================
// Role badges — batch-fetched for all users
// =============================================
function useRoleCache(userIds: string[]): Map<string, Role[]> {
  const [cache, setCache] = useState<Map<string, Role[]>>(new Map());
  useEffect(() => {
    const missing = userIds.filter(id => !cache.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map(id => getUserRoles(id).then(ur => ({ id, roles: ur.map(u => u.role!).filter(Boolean) }))))
      .then(results => {
        if (cancelled) return;
        setCache(prev => {
          const next = new Map(prev);
          results.forEach(r => next.set(r.id, r.roles));
          return next;
        });
      });
    return () => { cancelled = true; };
  }, [userIds.join(','), cache]);
  return cache;
}

function UserRolesBadges({ userId, roleCache }: { userId: string; roleCache: Map<string, Role[]> }) {
  const roles = roleCache.get(userId) ?? [];
  if (!roles.length) return null;
  return (
    <span className="flex items-center gap-1 flex-wrap">
      {roles.slice(0, 2).map(r => (
        <span key={r.id} className="role-badge" style={{ color: r.color, borderColor: r.color + '55' }}>
          {r.name}
        </span>
      ))}
    </span>
  );
}

// =============================================
// Pairing picker dialog
// =============================================
interface PairingPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (presence: PresenceWithProfile) => void;
  allPresences: PresenceWithProfile[];
  myUserId: string;
}

function PairingPicker({ open, onClose, onSelect, allPresences, myUserId }: PairingPickerProps) {
  const others = allPresences.filter(p => p.user_id !== myUserId);
  const getName = (p: PresenceWithProfile) =>
    p.profile?.nickname || p.profile?.ic_name || p.profile?.username || '?';

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary" /> เลือกคู่ที่ต้องการจับคู่
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {others.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">ไม่มีผู้ใช้ออนไลน์</p>
          ) : (
            others.map(p => (
              <button
                key={p.user_id}
                onClick={() => { onSelect(p); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-sm hover:bg-muted/60 transition-colors text-left"
              >
                <span className="online-dot-static shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{getName(p)}</p>
                  {p.channel?.display_name && (
                    <p className="text-xs text-muted-foreground truncate">{p.channel.display_name}</p>
                  )}
                </div>
                {p.is_op && <Star className="w-3.5 h-3.5 text-warning fill-warning shrink-0" />}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================
// Single user row inside a channel
// =============================================
interface UserRowProps {
  presence: PresenceWithProfile;
  isPointed: boolean;
  isMe: boolean;
  channels: Channel[];
  allPresences: PresenceWithProfile[];
  myPairUserId: string | null;
  onSwitchChannel: (channelId: string) => void;
  onStartPairing: () => void;
  onCancelPair: () => void;
  onMoveUser?: (targetUserId: string, channelId: string) => void;
  onToggleOPUser?: (targetUserId: string, isOp: boolean) => void;
  onAdminPair?: (targetUserId: string) => void;
  canMoveOthers?: boolean;
  canToggleOPOthers?: boolean;
  canPairOthers?: boolean;
  roleCache: Map<string, Role[]>;
}

function UserRow({
  presence, isPointed, isMe, channels, allPresences,
  myPairUserId, onSwitchChannel, onStartPairing, onCancelPair,
  onMoveUser, onToggleOPUser, onAdminPair, canMoveOthers, canToggleOPOthers, canPairOthers, roleCache,
}: UserRowProps) {
  const displayName = presence.profile?.nickname || presence.profile?.ic_name || presence.profile?.username || '?';
  // Check pairing from DB-backed paired_with_user_id
  const isPaired = (presence as PresenceWithProfile & { paired_with_user_id?: string | null }).paired_with_user_id != null;

  // Highlight pair partner row
  const isMyPartner = !isMe && presence.user_id === myPairUserId;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-sm group transition-colors
      ${isMe ? 'bg-primary/5' : isMyPartner ? 'bg-muted/30 border-l-2 border-foreground/40' : 'hover:bg-muted/50'}
    `}>
      <span className="online-dot-static" />
      <span className={`w-4 text-center text-sm transition-opacity ${isPointed ? 'opacity-100' : 'opacity-0'}`}>
        👉
      </span>
      {presence.is_op && (
        <Star className="w-3.5 h-3.5 text-warning fill-warning shrink-0" />
      )}
      {isMyPartner && (
        <UserCheck className="w-3.5 h-3.5 text-foreground shrink-0" />
      )}
      <span className={`flex-1 min-w-0 text-sm ${isMe ? 'text-primary font-semibold' : isMyPartner ? 'text-foreground font-semibold' : 'text-foreground'} truncate`}>
        {displayName}
        {isMe && <span className="ml-1 text-xs text-muted-foreground">(คุณ)</span>}
        {isMyPartner && <span className="ml-1 text-xs text-muted-foreground">[คู่ของคุณ]</span>}
      </span>
      <UserRolesBadges userId={presence.user_id} roleCache={roleCache} />
      {presence.profile?.ic_name && presence.profile.ic_name !== displayName && (
        <span className="text-xs text-muted-foreground hidden md:block truncate max-w-24">
          [{presence.profile.ic_name}]
        </span>
      )}

      {/* Switch channel + pair menu — only for self */}
      {isMe && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded border border-transparent hover:border-border transition-colors shrink-0">
              เมนู <ChevronRight className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* Channel switch items */}
            {channels.map(ch => (
              <DropdownMenuItem
                key={ch.id}
                onClick={() => onSwitchChannel(ch.id)}
                disabled={ch.id === presence.channel_id}
                className={ch.id === presence.channel_id ? 'opacity-50' : ''}
              >
                {ch.id === presence.channel_id ? '✓ ' : ''}{ch.display_name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {/* Pairing options */}
            {isPaired ? (
              <DropdownMenuItem
                onClick={onCancelPair}
                className="text-destructive focus:text-destructive"
              >
                <X className="w-3.5 h-3.5 mr-2" /> ยกเลิกจับคู่
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onStartPairing} disabled={allPresences.filter(p => p.user_id !== presence.user_id).length === 0}>
                <UserCheck className="w-3.5 h-3.5 mr-2" /> จับคู่กับ...
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Admin controls for OTHER users */}
      {!isMe && (canMoveOthers || canToggleOPOthers || canPairOthers) && onMoveUser && onToggleOPUser && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-warning px-1.5 py-0.5 rounded border border-transparent hover:border-warning/30 transition-colors shrink-0 opacity-0 group-hover:opacity-100">
              <Shield className="w-3 h-3" /> <ChevronRight className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {canMoveOthers && (
              <>
                <p className="px-2 py-1 text-[10px] text-muted-foreground font-semibold uppercase">ย้ายห้อง</p>
                {channels.map(ch => (
                  <DropdownMenuItem
                    key={ch.id}
                    onClick={() => onMoveUser(presence.user_id, ch.id)}
                    disabled={ch.id === presence.channel_id}
                    className={ch.id === presence.channel_id ? 'opacity-50' : ''}
                  >
                    <ArrowLeftRight className="w-3 h-3 mr-2" />
                    {ch.id === presence.channel_id ? '✓ ' : ''}{ch.display_name}
                  </DropdownMenuItem>
                ))}
              </>
            )}
            {canMoveOthers && canToggleOPOthers && <DropdownMenuSeparator />}
            {canToggleOPOthers && (
              <DropdownMenuItem onClick={() => onToggleOPUser(presence.user_id, !presence.is_op)}>
                <Star className="w-3 h-3 mr-2" />
                {presence.is_op ? 'เลิกเป็น OP ให้' : 'ตั้งเป็น OP ให้'}
              </DropdownMenuItem>
            )}
            {canPairOthers && onAdminPair && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onAdminPair(presence.user_id)}>
                  <UserCheck className="w-3 h-3 mr-2" />
                  จับคู่ให้...
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// =============================================
// Paired combined row (two users merged into one)
// =============================================
function PairedRow({
  me, partner, isPointed, channels, onSwitchChannel, onCancelPair,
}: {
  me: PresenceWithProfile;
  partner: PresenceWithProfile;
  isPointed: boolean;
  channels: Channel[];
  onSwitchChannel?: (channelId: string) => void;
  onCancelPair?: () => void;
}) {
  const name = (p: PresenceWithProfile) =>
    p.profile?.nickname || p.profile?.ic_name || p.profile?.username || '?';
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-muted/30 border-l-2 border-foreground/40 group">
      <span className="online-dot-static" />
      <span className={`w-4 text-center text-sm transition-opacity ${isPointed ? 'opacity-100' : 'opacity-0'}`}>
        👉
      </span>
      <UserCheck className="w-3.5 h-3.5 text-foreground shrink-0" />
      <span className="flex-1 min-w-0 text-sm text-foreground font-semibold truncate">
        {name(me)}<span className="text-muted-foreground font-bold mx-1">+</span>{name(partner)}
        <span className="ml-1.5 text-xs text-muted-foreground font-normal">[จับคู่]</span>
      </span>
      {/* Self menu — only show if callbacks are provided (i.e. this is the current user's pair) */}
      {onSwitchChannel && onCancelPair && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded border border-transparent hover:border-border transition-colors shrink-0">
              เมนู <ChevronRight className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {channels.map(ch => (
              <DropdownMenuItem
                key={ch.id}
                onClick={() => onSwitchChannel(ch.id)}
                disabled={ch.id === me.channel_id}
                className={ch.id === me.channel_id ? 'opacity-50' : ''}
              >
                {ch.id === me.channel_id ? '✓ ' : ''}{ch.display_name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCancelPair} className="text-destructive focus:text-destructive">
              <X className="w-3.5 h-3.5 mr-2" /> ยกเลิกจับคู่
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// =============================================
// Channel section
// =============================================
interface ChannelSectionProps {
  channel: Channel;
  presences: PresenceWithProfile[];
  pointedUserId: string | null;
  myUserId: string;
  isReadyChannel: boolean;
  channels: Channel[];
  allPresences: PresenceWithProfile[];
  myPairUserId: string | null;
  onSwitchChannel: (channelId: string) => void;
  onStartPairing: () => void;
  onCancelPair: () => void;
  onMoveUser?: (targetUserId: string, channelId: string) => void;
  onToggleOPUser?: (targetUserId: string, isOp: boolean) => void;
  onAdminPair?: (targetUserId: string) => void;
  canMoveOthers?: boolean;
  canToggleOPOthers?: boolean;
  canPairOthers?: boolean;
  roleCache: Map<string, Role[]>;
}

function ChannelSection({
  channel, presences, pointedUserId, myUserId, isReadyChannel, channels, allPresences,
  myPairUserId, onSwitchChannel, onStartPairing, onCancelPair,
  onMoveUser, onToggleOPUser, onAdminPair, canMoveOthers, canToggleOPOthers, canPairOthers, roleCache,
}: ChannelSectionProps) {
  // Build rendered rows — merge ALL paired users into one row when both are in this channel
  const renderedRows: JSX.Element[] = [];
  const skippedIds = new Set<string>();

  // Build a lookup of which users are paired with whom in this channel
  const presenceMap = new Map(presences.map(p => [p.user_id, p]));

  // Pre-mark all paired partners to skip (for ALL pairs, not just mine)
  for (const p of presences) {
    const pairedId = (p as PresenceWithProfile & { paired_with_user_id?: string | null }).paired_with_user_id;
    if (pairedId && presenceMap.has(pairedId) && !skippedIds.has(p.user_id)) {
      // This user is paired with someone in the same channel — skip the partner
      skippedIds.add(pairedId);
    }
  }

  for (const p of presences) {
    if (skippedIds.has(p.user_id)) continue;
    const isMe = p.user_id === myUserId;

    const pairedId = (p as PresenceWithProfile & { paired_with_user_id?: string | null }).paired_with_user_id;
    const partnerPresence = pairedId ? presenceMap.get(pairedId) : null;

    if (pairedId && partnerPresence) {
      // Show merged pair row for ANY paired users
      renderedRows.push(
        <PairedRow
          key={`pair-${p.id}`}
          me={p}
          partner={partnerPresence}
          isPointed={isReadyChannel && pointedUserId === p.user_id}
          channels={channels}
          onSwitchChannel={isMe ? onSwitchChannel : undefined}
          onCancelPair={isMe ? onCancelPair : undefined}
        />
      );
    } else {
      renderedRows.push(
        <UserRow
          key={p.id}
          presence={p}
          isPointed={isReadyChannel && pointedUserId === p.user_id}
          isMe={isMe}
          channels={channels}
          allPresences={allPresences}
          myPairUserId={myPairUserId}
          onSwitchChannel={onSwitchChannel}
          onStartPairing={onStartPairing}
          onCancelPair={onCancelPair}
          onMoveUser={onMoveUser}
          onToggleOPUser={onToggleOPUser}
          onAdminPair={onAdminPair}
          canMoveOthers={canMoveOthers}
          canToggleOPOthers={canToggleOPOthers}
          canPairOthers={canPairOthers}
          roleCache={roleCache}
        />
      );
    }
  }

  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 px-3 py-1">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {channel.display_name}
        </span>
        <span className="text-xs text-muted-foreground">— {presences.length}</span>
        {!channel.track_time && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 border-muted-foreground/30 text-muted-foreground">
            ไม่นับเวลา
          </Badge>
        )}
      </div>
      <div>
        {presences.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3 py-1 italic">ว่างอยู่</p>
        ) : renderedRows}
      </div>
      <div className="channel-divider mt-2" />
    </div>
  );
}

// =============================================
// OP Box
// =============================================
interface OPBoxProps {
  opList: PresenceWithProfile[];
  myPresence: PresenceWithProfile | null | undefined;
  onToggleOP: () => void;
  onRandom: () => void;
  onNext: () => void;
}

function OPBox({ opList, myPresence, onToggleOP, onRandom, onNext }: OPBoxProps) {
  const isOP = myPresence?.is_op ?? false;

  return (
    <div className="rounded-sm border border-warning/30 bg-warning/5 mb-4">
      <div className="flex items-center justify-between px-3 py-2 border-b border-warning/20">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-warning fill-warning" />
          <span className="text-sm font-bold text-warning tracking-wider">คนรับ OP</span>
          <span className="text-xs text-muted-foreground">({opList.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRandom}
            className="h-7 text-xs border-border"
            title="สุ่มผู้ทำหน้าที่ OP"
          >
            <Shuffle className="w-3 h-3 mr-1" /> สุ่ม
          </Button>
          <Button
            size="sm"
            onClick={onNext}
            disabled={!isOP}
            className="h-7 text-xs bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
            title={isOP ? 'เลื่อนคิวถัดไป' : 'เฉพาะ OP เท่านั้น'}
          >
            <ArrowRight className="w-3 h-3 mr-1" /> ถัดไป
          </Button>
        </div>
      </div>
      <div className="px-3 py-2 min-h-10">
        {opList.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">ยังไม่มีคนรับ OP</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {opList.map(p => (
              <div key={p.id} className="flex items-center gap-1.5">
                <span className="online-dot-static" />
                <span className="text-sm font-semibold text-warning">
                  {p.profile?.nickname || p.profile?.ic_name || p.profile?.username}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* My OP toggle */}
      <div className="px-3 py-2 border-t border-warning/20 flex justify-end">
        <Button
          variant={isOP ? 'destructive' : 'outline'}
          size="sm"
          onClick={onToggleOP}
          className="h-7 text-xs"
        >
          {isOP ? 'เลิกเป็น OP' : 'ขึ้นเป็น OP'}
        </Button>
      </div>
    </div>
  );
}

// =============================================
// Main Queue Page
// =============================================
export default function QueuePage() {
  const { user, profile, hasPermission } = useAuth();
  const {
    presenceList, presenceByChannel, channels, pointer, myPresence,
    opList, loading, handleSwitchChannel, handleToggleOP,
    handleNextPointer, handleRandomOP, fetchAll, handlePair, handleCancelPair,
  } = useQueue();

  // ── Pairing state (DB-backed via paired_with column) ──────────────
  const [pairingPickerOpen, setPairingPickerOpen] = useState(false);
  const [adminPairTarget, setAdminPairTarget] = useState<string | null>(null);
  const [adminPairPartnerPickerOpen, setAdminPairPartnerPickerOpen] = useState(false);

  const myPairUserId = myPresence?.paired_with_user_id ?? null;

  // Batch-fetch roles for all visible users (eliminates N+1 queries)
  const allUserIds = useMemo(() => presenceList.map(p => p.user_id), [presenceList]);
  const roleCache = useRoleCache(allUserIds);

  // Track my current channel to detect room moves
  const myChannelIdRef = useRef<string | null>(null);
  const prevMyPresence = useRef<PresenceWithProfile | null>(null);

  useEffect(() => {
    if (!myPresence) return;
    const prev = prevMyPresence.current;
    prevMyPresence.current = myPresence;
    myChannelIdRef.current = myPresence.channel_id;
  }, [myPresence]);

  // Watch partner — cancel if partner went offline or moved rooms
  useEffect(() => {
    if (!myPairUserId) return;
    const partner = presenceList.find(p => p.user_id === myPairUserId);
    if (!partner) {
      handleCancelPair();
      toast.info('คู่ของคุณออกจากระบบ — การจับคู่ถูกยกเลิก');
      return;
    }
    if (myPresence && partner.channel_id !== myPresence.channel_id) {
      handleCancelPair();
      toast.info(`${partner.profile?.nickname || partner.profile?.username || 'คู่ของคุณ'} ย้ายห้อง — การจับคู่ถูกยกเลิก`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenceList, myPairUserId]);

  const handleSelectPair = async (presence: PresenceWithProfile) => {
    try {
      await handlePair(presence.user_id);
      const name = presence.profile?.nickname || presence.profile?.username || '?';
      toast.success(`จับคู่กับ "${name}" สำเร็จ`);
    } catch {
      toast.error('จับคู่ไม่สำเร็จ');
    }
  };

  const handleCancelPairLocal = async () => {
    await handleCancelPair();
    toast.info('ยกเลิกการจับคู่แล้ว');
  };

  // ── Per-action permissions ─────
  const canMoveOthers = hasPermission('move_player');
  const canToggleOPOthers = hasPermission('set_op_others');
  const canPairOthers = hasPermission('admin_pair_others');

  const handleMoveUser = useCallback(async (targetUserId: string, channelId: string) => {
    try {
      await moveUserToChannel(targetUserId, channelId);
      const chName = channels.find(c => c.id === channelId)?.display_name || '';
      toast.success(`ย้ายผู้ใช้ไปห้อง "${chName}" สำเร็จ`);
      await fetchAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ย้ายผู้ใช้ไม่สำเร็จ';
      toast.error(msg);
      console.error(err);
    }
  }, [channels, fetchAll]);

  const handleToggleOPUser = useCallback(async (targetUserId: string, isOp: boolean) => {
    try {
      await setOPStatusForUser(targetUserId, isOp);
      toast.success(isOp ? 'ตั้งเป็น OP สำเร็จ' : 'เลิกเป็น OP สำเร็จ');
      await fetchAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เปลี่ยนสถานะ OP ไม่สำเร็จ';
      toast.error(msg);
      console.error(err);
    }
  }, [fetchAll]);

  const handleAdminPair = useCallback(async (targetUserId: string, partnerUserId: string) => {
    try {
      await pairUsersAsAdmin(targetUserId, partnerUserId);
      setAdminPairTarget(null);
      const partner = presenceList.find(p => p.user_id === partnerUserId);
      const target = presenceList.find(p => p.user_id === targetUserId);
      if (partner && target) {
        toast.success(`จับคู่ ${target.profile?.nickname || target.profile?.username} กับ ${partner.profile?.nickname || partner.profile?.username} สำเร็จ`);
      }
      await fetchAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'จับคู่ไม่สำเร็จ';
      toast.error(msg);
    }
  }, [presenceList, fetchAll]);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-24 w-full" />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-4/5" />
          </div>
        ))}
      </div>
    );
  }

  const totalOnline = Object.values(presenceByChannel).flat().length;
  const partnerPresence = myPairUserId ? presenceList.find(p => p.user_id === myPairUserId) : null;

  const readyChannel = channels.find(c => c.name === 'ready');

  return (
    <div className="p-3 md:p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">ห้องปฏิบัติการ</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="inline-flex items-center gap-1">
              <span className="online-dot-static" />
              ออนไลน์ {totalOnline} คน
            </span>
          </p>
        </div>
      </div>

      {/* Active pair banner */}
      {myPairUserId && partnerPresence && (
        <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-sm border border-foreground/20 bg-muted/30">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-foreground shrink-0" />
            <span className="text-sm text-foreground font-semibold">
              จับคู่กับ: {partnerPresence.profile?.nickname || partnerPresence.profile?.username}
            </span>
            {partnerPresence.channel?.display_name && (
              <span className="text-xs text-muted-foreground">({partnerPresence.channel.display_name})</span>
            )}
          </div>
          <button onClick={handleCancelPairLocal} className="text-xs text-destructive hover:underline shrink-0">
            ยกเลิก
          </button>
        </div>
      )}

      {/* OP Box */}
      <OPBox
        opList={opList}
        myPresence={myPresence}
        onToggleOP={handleToggleOP}
        onRandom={handleRandomOP}
        onNext={handleNextPointer}
      />

      {/* Channel list */}
      <div className="rounded-sm border border-border bg-card overflow-hidden">
        <div className="px-3 py-2 border-b border-border">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">รายชื่อออนไลน์</p>
        </div>
        <div className="p-2">
          {channels.map(ch => (
            <ChannelSection
              key={ch.id}
              channel={ch}
              presences={presenceByChannel[ch.id] ?? []}
              pointedUserId={pointer?.pointed_user_id ?? null}
              myUserId={user?.id ?? ''}
              isReadyChannel={ch.id === readyChannel?.id}
              channels={channels}
              allPresences={presenceList}
              myPairUserId={myPairUserId}
              onSwitchChannel={(cid) => {
                handleSwitchChannel(cid);
                toast.success(`ย้ายไป ${channels.find(c => c.id === cid)?.display_name || ''}`);
              }}
              onStartPairing={() => setPairingPickerOpen(true)}
              onCancelPair={handleCancelPairLocal}
              onMoveUser={handleMoveUser}
              onToggleOPUser={handleToggleOPUser}
              onAdminPair={(targetId) => {
                setAdminPairTarget(targetId);
                setAdminPairPartnerPickerOpen(true);
              }}
              canMoveOthers={canMoveOthers}
              canToggleOPOthers={canToggleOPOthers}
              canPairOthers={canPairOthers}
              roleCache={roleCache}
            />
          ))}
        </div>
      </div>

      {/* Pairing picker dialog */}
      <PairingPicker
        open={pairingPickerOpen}
        onClose={() => setPairingPickerOpen(false)}
        onSelect={handleSelectPair}
        allPresences={presenceList}
        myUserId={user?.id ?? ''}
      />

      {/* Admin pair partner picker */}
      {adminPairTarget && (
        <PairingPicker
          open={adminPairPartnerPickerOpen}
          onClose={() => { setAdminPairPartnerPickerOpen(false); setAdminPairTarget(null); }}
          onSelect={(partner) => {
            handleAdminPair(adminPairTarget, partner.user_id);
            setAdminPairPartnerPickerOpen(false);
          }}
          allPresences={presenceList.filter(p => p.user_id !== adminPairTarget)}
          myUserId={adminPairTarget}
        />
      )}
    </div>
  );
}
