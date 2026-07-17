import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  CheckCircle, Clock, Star, Users, RefreshCw, Search, ExternalLink, History, Banknote, Trash2, UserX, Plus, Copy,
} from 'lucide-react';
import {
  getAllProfiles, getAllWeeklyStats, getUserRoles, getWeekStart, getRoleCriteria, getPresenceLogs, deleteUserTimeLogs,
} from '@/services/adminService';
import { createTeam } from '@/services/teamService';
import type { Profile, WeeklyStats, Role, PresenceLog, RoleCriteria } from '@/types/types';
import { toast } from 'sonner';

function fmtTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtBaht(amount: number): string {
  return amount.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface UserRow {
  profile: Profile;
  roles: Role[];
  stats: WeeklyStats | null;
  eligible: boolean;
  criteria: RoleCriteria | null;
  weeklySalary: number;
  isAbsent: boolean;
}

// =============================================
// Room change log dialog
// =============================================
function PresenceLogDialog() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<PresenceLog[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPresenceLogs(200);
      setLogs(data);
    } catch {
      toast.error('โหลดประวัติห้องไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const displayName = (p?: Profile) => p?.nickname || p?.ic_name || p?.username || '—';
  const channelName = (ch?: { display_name?: string }) => ch?.display_name || '—';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <History className="w-3.5 h-3.5 mr-1" /> ประวัติห้อง
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">ประวัติการย้ายห้อง</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 pr-1">
          {loading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">ไม่มีประวัติการย้ายห้อง</p>
          ) : (
            <div className="space-y-1.5">
              {logs.map(log => (
                <div key={log.id} className="flex items-center justify-between gap-3 py-2 px-2 rounded-sm border border-border/50 text-xs">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground">{displayName(log.profile)}</span>
                    <span className="text-muted-foreground mx-1">ย้ายจาก</span>
                    <span className="text-foreground">{channelName(log.from_channel)}</span>
                    <span className="text-muted-foreground mx-1">ไป</span>
                    <span className="text-foreground">{channelName(log.to_channel)}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0">
                    {new Date(log.changed_at).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================
// Team creation dialog
// =============================================
function CreateTeamDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('กรุณากรอกชื่อทีม'); return; }
    setLoading(true);
    try {
      const team = await createTeam(name.trim());
      toast.success(`สร้างทีม "${team.name}" สำเร็จ`);
      setOpen(false);
      setName('');
      onCreated();
    } catch {
      toast.error('สร้างทีมไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 bg-primary text-primary-foreground hover:opacity-90">
          <Plus className="w-3.5 h-3.5 mr-1" /> สร้างทีม
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
        <DialogHeader>
          <DialogTitle>สร้างทีมใหม่</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อทีม..." className="bg-muted border-border"
            onKeyDown={e => e.key === 'Enter' && handleCreate()} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button size="sm" onClick={handleCreate} disabled={loading} className="bg-primary text-primary-foreground hover:opacity-90">
              {loading ? 'กำลังสร้าง...' : 'สร้างทีม'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminDashboardPage() {
  const { currentTeam, teams, switchTeam } = useTeam();
  const { hasPermission } = useAuth();
  const teamId = currentTeam?.id;
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'absent'>('all');
  const navigate = useNavigate();
  const weekStart = getWeekStart();
  const [deleteTimeLogsUser, setDeleteTimeLogsUser] = useState<Profile | null>(null);
  const [deletingLogs, setDeletingLogs] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [profiles, statsArr] = await Promise.all([
        getAllProfiles(teamId),
        getAllWeeklyStats(weekStart, teamId),
      ]);

      const statsMap = Object.fromEntries((statsArr as WeeklyStats[]).map(s => [s.user_id, s]));

      // Get online user IDs from user_presence
      const { supabase } = await import('@/db/supabase');
      const { data: presenceData } = await supabase.from('user_presence').select('user_id');
      const onlineIds = new Set((presenceData ?? []).map((p: { user_id: string }) => p.user_id));
      setOnlineUserIds(onlineIds);

      const rowData: UserRow[] = await Promise.all(
        (profiles as Profile[]).map(async (p) => {
          const userRoles = await getUserRoles(p.id);
          const roles = userRoles.map(ur => ur.role!).filter(Boolean) as Role[];
          const stats = statsMap[p.id] ?? null;

          let eligible = false;
          let criteria: RoleCriteria | null = null;
          let weeklySalary = 0;
          if (roles.length > 0) {
            const topRole = roles[roles.length - 1];
            criteria = await getRoleCriteria(topRole.id);
            if (criteria && stats && (criteria.work_hours_enabled || criteria.op_hours_enabled)) {
              const workH = (stats.total_work_seconds ?? 0) / 3600;
              const opH = (stats.total_op_seconds ?? 0) / 3600;
              const workOk = !criteria.work_hours_enabled || workH >= (criteria.min_work_hours_per_week ?? 0);
              const opOk = !criteria.op_hours_enabled || opH >= (criteria.min_op_hours_per_week ?? 0);
              eligible = workOk && opOk;
            }
            if (criteria?.hourly_salary != null && stats) {
              weeklySalary = criteria.hourly_salary * ((stats.total_work_seconds ?? 0) / 3600);
            }
          }

          return { profile: p, roles, stats, eligible, criteria, weeklySalary, isAbsent: !onlineIds.has(p.id) };
        })
      );

      setRows(rowData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [weekStart, teamId]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.profile.username.toLowerCase().includes(q) ||
      (r.profile.nickname?.toLowerCase() ?? '').includes(q) ||
      (r.profile.ic_name?.toLowerCase() ?? '').includes(q);
    if (filter === 'absent') return matchSearch && r.isAbsent;
    return matchSearch;
  });

  const totalSalary = rows.reduce((s, r) => s + r.weeklySalary, 0);
  const absentCount = rows.filter(r => r.isAbsent).length;

  const handleDeleteTimeLogs = async () => {
    if (!deleteTimeLogsUser) return;
    setDeletingLogs(true);
    try {
      await deleteUserTimeLogs(deleteTimeLogsUser.id);
      toast.success(`ลบข้อมูลเวลาของ "${deleteTimeLogsUser.username}" สำเร็จ`);
      setDeleteTimeLogsUser(null);
      loadData();
    } catch {
      toast.error('ลบข้อมูลเวลาไม่สำเร็จ');
    } finally {
      setDeletingLogs(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">ภาพรวมหน่วยงาน</h1>
          <p className="text-xs text-muted-foreground">สัปดาห์เริ่ม {weekStart}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ค้นหาชื่อ..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm w-48 bg-muted border-border"
            />
          </div>
          <Button variant="outline" size="sm" onClick={loadData} className="h-8">
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> รีเฟรช
          </Button>
          {hasPermission('view_presence_history') && <PresenceLogDialog />}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <p className="text-xl font-bold">{rows.length}</p>
              <p className="text-xs text-muted-foreground">ผู้ใช้ทั้งหมด</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-success" />
            <div>
              <p className="text-xl font-bold">{rows.filter(r => r.eligible).length}</p>
              <p className="text-xs text-muted-foreground">ผ่านเกณฑ์เลื่อนยศ</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <UserX className="w-8 h-8 text-destructive" />
            <div>
              <p className="text-xl font-bold">{absentCount}</p>
              <p className="text-xs text-muted-foreground">ไม่ออนไลน์ (absent)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <Clock className="w-8 h-8 text-accent" />
            <div>
              <p className="text-xl font-bold">
                {fmtTime(rows.reduce((s, r) => s + (r.stats?.total_work_seconds ?? 0), 0))}
              </p>
              <p className="text-xs text-muted-foreground">รวมชั่วโมงทำงาน</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Total salary card */}
      {totalSalary > 0 && (
        <Card className="border-border border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex items-center gap-3">
            <Banknote className="w-8 h-8 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">ยอดจ่ายเงินเดือนรวม (อาทิตย์นี้)</p>
              <p className="text-xl font-bold text-primary">{fmtBaht(totalSalary)} ฿</p>
              <p className="text-[11px] text-muted-foreground">
                จาก {rows.filter(r => r.weeklySalary > 0).length} คนที่มีค่าตอบแทนต่อชั่วโมง
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team management */}
      {hasPermission('manage_teams') && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>จัดการทีม</span>
              <CreateTeamDialog onCreated={loadData} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {teams.length === 0 ? (
              <p className="text-xs text-muted-foreground">ยังไม่มีทีม</p>
            ) : (
              teams.map(t => (
                <div key={t.id} className={`flex items-center justify-between gap-3 py-2 px-3 rounded-sm border transition-colors ${t.id === teamId ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/30'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-sm bg-primary/20 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">{t.name[0]?.toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground">#{t.invite_code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                      navigator.clipboard.writeText(t.invite_code);
                      toast.success(`คัดลอก "${t.invite_code}" แล้ว`);
                    }}>
                      <Copy className="w-3 h-3 mr-1" /> คัดลอก
                    </Button>
                    {t.id !== teamId && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => switchTeam(t.id)}>
                        สลับ
                      </Button>
                    )}
                    {t.id === teamId && (
                      <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">ปัจจุบัน</Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted rounded-sm p-0.5 w-fit">
        {([['all', `ทั้งหมด (${rows.length})`], ['absent', `ไม่ออนไลน์ (${absentCount})`]] as const).map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f as 'all' | 'absent')}
            className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
              filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card className="border-border min-w-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">รายชื่อสมาชิก</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium whitespace-nowrap">ชื่อ</th>
                  <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium whitespace-nowrap">ชื่อในเกม</th>
                  <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium whitespace-nowrap">ยศ</th>
                  <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium whitespace-nowrap">
                    <Clock className="w-3 h-3 inline mr-1" />อาทิตย์นี้
                  </th>
                  <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium whitespace-nowrap">
                    <Star className="w-3 h-3 inline mr-1" />OP
                  </th>
                  <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium whitespace-nowrap">
                    <Banknote className="w-3 h-3 inline mr-1" />เงิน
                  </th>
                  <th className="text-center px-4 py-2 text-xs text-muted-foreground font-medium whitespace-nowrap">สถานะ</th>
                  <th className="text-center px-4 py-2 text-xs text-muted-foreground font-medium whitespace-nowrap">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-2"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">ไม่พบข้อมูล</td>
                  </tr>
                ) : (
                  filtered.map(row => (
                    <tr key={row.profile.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${row.isAbsent ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-2.5 whitespace-nowrap font-medium">
                        <button
                          onClick={() => navigate(`/dashboard?userId=${row.profile.id}`)}
                          className="flex items-center gap-1.5 hover:text-primary transition-colors group"
                        >
                          <span className="font-medium">{row.profile.nickname || row.profile.username}</span>
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-70 transition-opacity shrink-0" />
                        </button>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-xs">
                        {row.profile.ic_name || '-'}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {row.roles.slice(0, 3).map(r => (
                            <span key={r.id} className="role-badge" style={{ color: r.color, borderColor: r.color + '44' }}>
                              {r.name}
                            </span>
                          ))}
                          {!row.roles.length && <span className="text-xs text-muted-foreground">-</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap font-mono text-xs">
                        {fmtTime(row.stats?.total_work_seconds ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap font-mono text-xs text-warning">
                        {fmtTime(row.stats?.total_op_seconds ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap font-mono text-xs text-primary">
                        {row.weeklySalary > 0 ? `${fmtBaht(row.weeklySalary)} ฿` : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        {row.isAbsent ? (
                          <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">ไม่ออนไลน์</Badge>
                        ) : row.eligible ? (
                          <Badge className="bg-success/20 text-success border-success/30 text-xs">
                            ✓ ผ่านเกณฑ์
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-xs">
                            ยังไม่ผ่าน
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        {hasPermission('delete_time_logs') && (
                          <button
                            onClick={() => setDeleteTimeLogsUser(row.profile)}
                            className="text-destructive/70 hover:text-destructive transition-colors p-1 rounded hover:bg-destructive/10"
                            title="ลบข้อมูลเวลา"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Delete time logs confirmation */}
      <AlertDialog open={!!deleteTimeLogsUser} onOpenChange={open => !open && setDeleteTimeLogsUser(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>ลบข้อมูลเวลา "{deleteTimeLogsUser?.username}"?</AlertDialogTitle>
            <AlertDialogDescription>
              จะลบ time_logs ทั้งหมดของผู้ใช้นี้ออก และรีเซ็ต weekly_stats เป็น 0 ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTimeLogs}
              disabled={deletingLogs}
              className="bg-destructive text-destructive-foreground hover:opacity-90"
            >
              {deletingLogs ? 'กำลังลบ...' : 'ลบข้อมูลเวลา'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
