import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { AlertTriangle, Plus, Trash2, ShieldAlert, ShieldOff } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { getAllProfiles } from '@/services/adminService';
import type { Profile } from '@/types/types';

interface Warning {
  id: string;
  user_id: string;
  issued_by: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  user?: Profile;
  issuer?: Profile;
}

const SEVERITY_LABEL: Record<string, string> = { low: 'เบา', medium: 'กลาง', high: 'หนัก' };
const SEVERITY_COLOR: Record<string, string> = {
  low: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  medium: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  high: 'bg-destructive/15 text-destructive border-destructive/30',
};

// =============================================
// Issue Warning Dialog
// =============================================
function IssueWarningDialog({ profiles, onIssued }: { profiles: Profile[]; onIssued: () => void }) {
  const { profile: me } = useAuth();
  const { currentTeam } = useTeam();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('low');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!userId || !reason.trim()) { toast.error('กรุณาเลือกผู้ใช้และกรอกเหตุผล'); return; }
    if (!me) return;
    setLoading(true);
    try {
      const insertData: Record<string, unknown> = {
        user_id: userId,
        issued_by: me.id,
        reason: reason.trim(),
        severity,
        is_active: true,
        expires_at: expiresAt || null,
      };
      if (currentTeam?.id) insertData.team_id = currentTeam.id;
      const { error } = await supabase.from('warnings').insert(insertData);
      if (error) throw error;
      toast.success('ออกใบเตือนสำเร็จ');
      setOpen(false);
      setUserId(''); setReason(''); setSeverity('low'); setExpiresAt('');
      onIssued();
    } catch {
      toast.error('ออกใบเตือนไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const eligible = profiles.filter(p => p.id !== me?.id && p.system_role !== 'super_admin');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-primary text-primary-foreground hover:opacity-90">
          <Plus className="w-4 h-4 mr-1" /> ออกใบเตือน
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
        <DialogHeader>
          <DialogTitle>ออกใบเตือนสมาชิก</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">สมาชิก</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="bg-muted border-border">
                <SelectValue placeholder="เลือกสมาชิก..." />
              </SelectTrigger>
              <SelectContent>
                {eligible.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nickname || p.ic_name || p.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">ระดับความรุนแรง</Label>
            <Select value={severity} onValueChange={v => setSeverity(v as 'low' | 'medium' | 'high')}>
              <SelectTrigger className="bg-muted border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">เบา</SelectItem>
                <SelectItem value="medium">กลาง</SelectItem>
                <SelectItem value="high">หนัก</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">เหตุผล</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="ระบุเหตุผลการออกใบเตือน..."
              className="bg-muted border-border resize-none min-h-[80px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">วันหมดอายุ (ถ้ามี)</Label>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              className="bg-muted border-border"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button size="sm" onClick={handleSubmit} disabled={loading}
              className="bg-primary text-primary-foreground hover:opacity-90">
              {loading ? 'กำลังออกใบเตือน...' : 'ยืนยัน'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================
// Warning Card
// =============================================
function WarningCard({
  warning,
  canManage,
  onRevoke,
  onDelete,
}: {
  warning: Warning;
  canManage: boolean;
  onRevoke: (id: string) => void;
  onDelete: (w: Warning) => void;
}) {
  const displayName = (p?: Profile) => p?.nickname || p?.ic_name || p?.username || '—';
  const expired = warning.expires_at ? new Date(warning.expires_at) < new Date() : false;
  const status = !warning.is_active ? 'ยกเลิกแล้ว' : expired ? 'หมดอายุ' : 'ใช้งาน';
  const statusColor = !warning.is_active || expired
    ? 'bg-muted text-muted-foreground border-border'
    : 'bg-primary/10 text-primary border-primary/30';

  return (
    <div className={`rounded-sm border p-3 space-y-2 transition-opacity ${!warning.is_active || expired ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">
            {displayName(warning.user)}
          </span>
          <Badge variant="outline" className={`text-xs px-1.5 py-0 ${SEVERITY_COLOR[warning.severity]}`}>
            {SEVERITY_LABEL[warning.severity]}
          </Badge>
          <Badge variant="outline" className={`text-xs px-1.5 py-0 ${statusColor}`}>
            {status}
          </Badge>
        </div>
        {canManage && (
          <div className="flex items-center gap-1 shrink-0">
            {warning.is_active && !expired && (
              <Button
                variant="ghost" size="icon"
                className="w-7 h-7 text-muted-foreground hover:text-foreground"
                onClick={() => onRevoke(warning.id)}
                title="ยกเลิกใบเตือน"
              >
                <ShieldOff className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              variant="ghost" size="icon"
              className="w-7 h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onDelete(warning)}
              title="ลบใบเตือน"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
      <p className="text-sm text-foreground">{warning.reason}</p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <span>ออกโดย: <span className="text-foreground">{displayName(warning.issuer)}</span></span>
        <span>{new Date(warning.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        {warning.expires_at && (
          <span>หมดอายุ: {new Date(warning.expires_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        )}
      </div>
    </div>
  );
}

// =============================================
// Main Warnings Page
// =============================================
export default function WarningsPage() {
  const { profile: me } = useAuth();
  const { currentTeam } = useTeam();
  const teamId = currentTeam?.id;
  const isAdmin = me?.system_role === 'super_admin' || me?.system_role === 'admin';

  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [toDelete, setToDelete] = useState<Warning | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('warnings').select('*, user:profiles!user_id(*), issuer:profiles!issued_by(*)').order('created_at', { ascending: false });
      if (!isAdmin) query = query.eq('user_id', me!.id);
      const { data, error } = await query;
      if (error) {
        // If team_id column doesn't exist, the select with profiles join may fail
        // Try simpler query
        let fallback = supabase.from('warnings').select('*').order('created_at', { ascending: false });
        if (!isAdmin) fallback = fallback.eq('user_id', me!.id);
        const { data: fb, error: fbErr } = await fallback;
        if (fbErr) throw fbErr;
        setWarnings((fb ?? []) as Warning[]);
      } else {
        setWarnings((data ?? []) as Warning[]);
      }
      if (isAdmin) {
        const p = await getAllProfiles(teamId);
        setProfiles(p as Profile[]);
      }
    } catch {
      setWarnings([]);
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, me, teamId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRevoke = async (id: string) => {
    const { error } = await supabase.from('warnings').update({ is_active: false }).eq('id', id);
    if (error) { toast.error('ยกเลิกใบเตือนไม่สำเร็จ'); return; }
    setWarnings(prev => prev.map(w => w.id === id ? { ...w, is_active: false } : w));
    toast.success('ยกเลิกใบเตือนแล้ว');
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from('warnings').delete().eq('id', toDelete.id);
    if (error) { toast.error('ลบใบเตือนไม่สำเร็จ'); return; }
    setWarnings(prev => prev.filter(w => w.id !== toDelete.id));
    toast.success('ลบใบเตือนแล้ว');
    setToDelete(null);
  };

  const filtered = warnings.filter(w => {
    const expired = w.expires_at ? new Date(w.expires_at) < new Date() : false;
    if (filter === 'active') return w.is_active && !expired;
    if (filter === 'inactive') return !w.is_active || expired;
    return true;
  });

  const activeCount = warnings.filter(w => w.is_active && !(w.expires_at && new Date(w.expires_at) < new Date())).length;

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-primary" /> ใบเตือน
          </h1>
          <p className="text-xs text-muted-foreground">
            {isAdmin ? `ใบเตือนทั้งหมดในระบบ · ใช้งานอยู่ ${activeCount} ใบ` : `ใบเตือนของคุณ · ใช้งานอยู่ ${activeCount} ใบ`}
          </p>
        </div>
        {isAdmin && <IssueWarningDialog profiles={profiles} onIssued={loadData} />}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted rounded-sm p-0.5 w-fit">
        {(['active', 'inactive', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
              filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'active' ? 'ใช้งาน' : f === 'inactive' ? 'หมดแล้ว' : 'ทั้งหมด'}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : filtered.length === 0 ? (
          <Card className="border-border">
            <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <ShieldAlert className="w-8 h-8 opacity-30" />
              <p className="text-sm">ไม่มีใบเตือน{filter === 'active' ? 'ที่ใช้งานอยู่' : filter === 'inactive' ? 'ที่หมดอายุ' : ''}</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map(w => (
            <WarningCard
              key={w.id}
              warning={w}
              canManage={isAdmin}
              onRevoke={handleRevoke}
              onDelete={setToDelete}
            />
          ))
        )}
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!toDelete} onOpenChange={open => !open && setToDelete(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>ลบใบเตือนนี้?</AlertDialogTitle>
            <AlertDialogDescription>ข้อมูลจะหายถาวร ไม่สามารถย้อนกลับได้</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:opacity-90"
            >
              ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
