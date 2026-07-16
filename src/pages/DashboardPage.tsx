import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Clock, Star, Calendar, TrendingUp, CheckCircle, XCircle, ArrowLeft, AlertTriangle, Banknote, Target, Timer } from 'lucide-react';
import {
  getWeeklyStats, getDailyStats, getWeekStart,
  getUserRoles, refreshWeeklyStats, getProfile, getRoleCriteria, getWarnings, getRoles,
} from '@/services/adminService';
import type { WeeklyStats, UserRole, RoleCriteria, Role, Profile } from '@/types/types';
import { toast } from 'sonner';

// ── helpers ─────────────────────────────────────────────────────
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  let cur = from;
  while (cur <= to) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return days;
}

function fmtTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtBaht(amount: number): string {
  return amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtBahtText(amount: number): string {
  const rounded = Math.round(amount);
  if (rounded === 0) return 'ศูนย์บาท';
  const thaiDigits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const thaiUnits = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
  
  function convertGroup(n: number): string {
    if (n === 0) return '';
    let result = '';
    const digits = String(n).split('').reverse();
    for (let i = digits.length - 1; i >= 0; i--) {
      const d = parseInt(digits[i]);
      if (d === 0) continue;
      if (d === 1 && i === 1) result += 'สิบ';
      else if (d === 2 && i === 1) result += 'ยี่สิบ';
      else if (d === 1 && i === 0) result += 'เอ็ด';
      else result += thaiDigits[d] + thaiUnits[i];
    }
    return result;
  }
  
  if (rounded >= 1000000) {
    const millions = Math.floor(rounded / 1000000);
    const remainder = rounded % 1000000;
    return convertGroup(millions) + 'ล้าน' + convertGroup(remainder) + 'บาท';
  }
  return convertGroup(rounded) + 'บาท';
}

function getWeekDates(weekStart: string): string[] {
  const start = new Date(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

export default function DashboardPage() {
  const { user, profile: myProfile, hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const targetUserId = searchParams.get('userId') || user?.id || '';
  const isViewingOther = !!searchParams.get('userId') && searchParams.get('userId') !== user?.id;
  const canViewOthers = hasPermission('view_member_dashboard');

  const [targetProfile, setTargetProfile] = useState<Profile | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null);
  const [todayStats, setTodayStats] = useState<{ total_work_seconds: number; total_op_seconds: number } | null>(null);
  const [weekDayStats, setWeekDayStats] = useState<{ date: string; work: number; op: number }[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [criteria, setCriteria] = useState<RoleCriteria | null>(null);
  const [promotionEligible, setPromotionEligible] = useState(false);
  const [warnings, setWarnings] = useState<{ id: string; reason: string; issued_at: string; is_active: boolean; severity: string; expires_at: string | null; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextRole, setNextRole] = useState<Role | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const weekStart = getWeekStart();

  // ── Date range state ──────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0];
  const [rangeFrom, setRangeFrom] = useState<string>(addDays(todayStr, -6));
  const [rangeTo, setRangeTo] = useState<string>(todayStr);
  const [rangeStats, setRangeStats] = useState<{
    work: number; op: number; days: { date: string; work: number; op: number }[];
  } | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);

  // Redirect if trying to view other without permission
  useEffect(() => {
    if (isViewingOther && !canViewOthers) {
      navigate('/dashboard', { replace: true });
    }
  }, [isViewingOther, canViewOthers, navigate]);

  // Session timer — ticks every second to show live "hours online now"
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      setSessionSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);
    try {
      await refreshWeeklyStats(targetUserId);
      const [ws, td, ur, tp] = await Promise.all([
        getWeeklyStats(targetUserId, weekStart),
        getDailyStats(targetUserId, todayStr),
        getUserRoles(targetUserId),
        isViewingOther ? getProfile(targetUserId) : Promise.resolve(myProfile),
      ]);
      setWeeklyStats(ws);
      setTodayStats(td);
      setUserRoles(ur);
      setTargetProfile(tp as Profile | null);

      const dates = getWeekDates(weekStart);
      const dayStats = await Promise.all(dates.map(d => getDailyStats(targetUserId, d)));
      setWeekDayStats(dates.map((d, i) => ({
        date: d,
        work: dayStats[i]?.total_work_seconds ?? 0,
        op: dayStats[i]?.total_op_seconds ?? 0,
      })));

      try {
        const w = await getWarnings(targetUserId);
        setWarnings(w.filter(x => x.is_active && (!x.expires_at || new Date(x.expires_at) >= new Date())));
      } catch { setWarnings([]); }

      if (ur.length > 0) {
        const topRole = ur[ur.length - 1]?.role as Role | undefined;
        if (topRole) {
          const c = await getRoleCriteria(topRole.id);
          setCriteria(c);
          if (c) {
            // Load next role info
            if (c.next_role_id) {
              try {
                const allRoles = await getRoles();
                const nr = allRoles.find(r => r.id === c.next_role_id);
                setNextRole(nr ?? null);
              } catch { setNextRole(null); }
            }
            if (ws) {
              const workH = (ws.total_work_seconds ?? 0) / 3600;
              const opH = (ws.total_op_seconds ?? 0) / 3600;
              const workOk = !c.work_hours_enabled || workH >= (c.min_work_hours_per_week ?? 0);
              const opOk = !c.op_hours_enabled || opH >= (c.min_op_hours_per_week ?? 0);
              setPromotionEligible(workOk && opOk && (c.work_hours_enabled || c.op_hours_enabled));
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [targetUserId, weekStart, todayStr, isViewingOther, myProfile]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load date-range stats whenever from/to changes
  const loadRangeStats = useCallback(async () => {
    if (!targetUserId || !rangeFrom || !rangeTo || rangeFrom > rangeTo) return;
    setRangeLoading(true);
    try {
      const days = daysBetween(rangeFrom, rangeTo);
      if (days.length > 90) { toast.error('ช่วงวันที่ไม่เกิน 90 วัน'); setRangeLoading(false); return; }
      const stats = await Promise.all(days.map(d => getDailyStats(targetUserId, d)));
      const perDay = days.map((d, i) => ({
        date: d,
        work: stats[i]?.total_work_seconds ?? 0,
        op: stats[i]?.total_op_seconds ?? 0,
      }));
      setRangeStats({
        work: perDay.reduce((s, d) => s + d.work, 0),
        op: perDay.reduce((s, d) => s + d.op, 0),
        days: perDay,
      });
    } catch { toast.error('โหลดสถิติช่วงวันที่ไม่สำเร็จ'); }
    finally { setRangeLoading(false); }
  }, [targetUserId, rangeFrom, rangeTo]);

  useEffect(() => { loadRangeStats(); }, [loadRangeStats]);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  const dayNames = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
  const maxDayWork = Math.max(...weekDayStats.map(d => d.work), 3600);
  const displayProfile = isViewingOther ? targetProfile : myProfile;
  const displayName = displayProfile?.nickname || displayProfile?.ic_name || displayProfile?.username || '...';

  const weeklyWorkHours = (weeklyStats?.total_work_seconds ?? 0) / 3600;
  const estimatedSalary = criteria?.hourly_salary != null ? criteria.hourly_salary * weeklyWorkHours : null;
  const rangeWorkHours = (rangeStats?.work ?? 0) / 3600;
  const rangeSalary = criteria?.hourly_salary != null ? criteria.hourly_salary * rangeWorkHours : null;
  const currentRole = userRoles.length > 0 ? userRoles[userRoles.length - 1]?.role : null;

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {isViewingOther && (
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/admin/dashboard')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">
              {isViewingOther ? `Dashboard — ${displayName}` : 'Dashboard ของฉัน'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isViewingOther
                ? `ดูโดย ${myProfile?.username} · สัปดาห์เริ่ม ${weekStart}`
                : displayName
              }
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} className="text-xs shrink-0">รีเฟรช</Button>
      </div>

      {/* Active warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1.5">
          {warnings.map(w => (
            <div key={w.id} className="flex items-start gap-2.5 p-3 rounded-sm border border-destructive/40 bg-destructive/10">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-destructive">ใบเตือนที่ยังมีผล</p>
                <p className="text-xs text-destructive/80 mt-0.5">{w.reason}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {new Date(w.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Roles */}
      {userRoles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {userRoles.map(ur => ur.role && (
            <span key={ur.id} className="role-badge" style={{ color: ur.role.color, borderColor: ur.role.color + '55' }}>
              {ur.role.name}
            </span>
          ))}
        </div>
      )}

      {/* Live Session Card — hours online now + estimated current earnings */}
      <Card className="border-border border-accent/30 bg-accent/5">
        <CardContent className="p-3 flex items-center gap-3">
          <Timer className="w-8 h-8 text-accent shrink-0 animate-pulse" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">กำลังออนไลน์ — เซสชันนี้</p>
            <p className="text-xl font-bold text-accent">{fmtTime(sessionSeconds)}</p>
            {criteria?.hourly_salary != null && (
              <p className="text-[11px] text-muted-foreground">
                ≈ {fmtBaht((sessionSeconds / 3600) * criteria.hourly_salary)} บาท (คิดจาก {fmtBaht(criteria.hourly_salary)} บาท/ชม.)
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* This-week stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">วันนี้</span>
            </div>
            <p className="text-xl font-bold text-foreground">{fmtTime(todayStats?.total_work_seconds ?? 0)}</p>
            <p className="text-xs text-muted-foreground">ชั่วโมงทำงาน</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-warning" />
              <span className="text-xs text-muted-foreground">OP วันนี้</span>
            </div>
            <p className="text-xl font-bold text-foreground">{fmtTime(todayStats?.total_op_seconds ?? 0)}</p>
            <p className="text-xs text-muted-foreground">ชั่วโมง OP</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-accent" />
              <span className="text-xs text-muted-foreground">อาทิตย์นี้</span>
            </div>
            <p className="text-xl font-bold text-foreground">{fmtTime(weeklyStats?.total_work_seconds ?? 0)}</p>
            <p className="text-xs text-muted-foreground">ชั่วโมงรวม</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-warning" />
              <span className="text-xs text-muted-foreground">OP สัปดาห์</span>
            </div>
            <p className="text-xl font-bold text-foreground">{fmtTime(weeklyStats?.total_op_seconds ?? 0)}</p>
            <p className="text-xs text-muted-foreground">ชั่วโมง OP</p>
          </CardContent>
        </Card>
      </div>

      {/* Salary estimate (this week) */}
      {estimatedSalary !== null && (
        <Card className="border-border border-primary/30 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-3 mb-3">
              <Banknote className="w-8 h-8 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">รายได้ประมาณการ (สัปดาห์นี้)</p>
                <p className="text-xl font-bold text-primary">{fmtBaht(estimatedSalary)} ฿</p>
                <p className="text-[11px] text-muted-foreground">
                  ({fmtBahtText(estimatedSalary)})
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {fmtTime(weeklyStats?.total_work_seconds ?? 0)} × {fmtBaht(criteria!.hourly_salary!)} บาท/ชม.
                </p>
              </div>
            </div>
            {/* Hourly rate info */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-sm px-2.5 py-1.5">
              <span className="font-semibold text-primary">{fmtBaht(criteria!.hourly_salary!)} บาท/ชม.</span>
              <span>•</span>
              <span>ยศปัจจุบัน: <span style={{ color: currentRole?.color }}>{currentRole?.name || '—'}</span></span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Promotion Eligibility Section */}
      {criteria && (criteria.work_hours_enabled || criteria.op_hours_enabled) && (
        <Card className={`border-border ${promotionEligible ? 'border-success/40 bg-success/5' : ''}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" /> สิทธิ์การเลื่อนยศ
              {nextRole && (
                <Badge variant="outline" className="text-[10px] ml-auto" style={{ color: nextRole.color, borderColor: nextRole.color + '55' }}>
                  → {nextRole.name}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {promotionEligible ? (
              <div className="flex items-start gap-3 p-3 rounded-sm border border-success/40 bg-success/10">
                <CheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-success">
                    {isViewingOther
                      ? `${displayName} ผ่านเกณฑ์เลื่อนยศแล้ว!`
                      : 'ยินดีด้วย! คุณผ่านเกณฑ์แล้ว'}
                  </p>
                  <p className="text-xs text-success/80 mt-0.5">
                    กรุณาติดต่อยศใหญ่เพื่อขอสอบ
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3 rounded-sm border border-muted/40 bg-muted/10">
                <XCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  {isViewingOther
                    ? `${displayName} ยังไม่ผ่านเกณฑ์เลื่อนยศ`
                    : 'ยังไม่ผ่านเกณฑ์เลื่อนยศ — ดูรายละเอียดด้านล่าง'}
                </p>
              </div>
            )}

            {/* Progress bars for each criterion */}
            {criteria.work_hours_enabled && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">ชั่วโมงทำงาน</span>
                  <span className={`font-mono font-semibold ${weeklyWorkHours >= (criteria.min_work_hours_per_week ?? 0) ? 'text-success' : 'text-foreground'}`}>
                    {fmtTime(weeklyStats?.total_work_seconds ?? 0)} / {criteria.min_work_hours_per_week ?? 0} ชม.
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, ((weeklyStats?.total_work_seconds ?? 0) / 3600 / (criteria.min_work_hours_per_week ?? 1)) * 100)}%`,
                      backgroundColor: weeklyWorkHours >= (criteria.min_work_hours_per_week ?? 0) ? 'hsl(var(--success))' : 'hsl(var(--primary))',
                    }}
                  />
                </div>
              </div>
            )}

            {criteria.op_hours_enabled && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">ชั่วโมง OP</span>
                  <span className={`font-mono font-semibold ${((weeklyStats?.total_op_seconds ?? 0) / 3600) >= (criteria.min_op_hours_per_week ?? 0) ? 'text-success' : 'text-foreground'}`}>
                    {fmtTime(weeklyStats?.total_op_seconds ?? 0)} / {criteria.min_op_hours_per_week ?? 0} ชม.
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, ((weeklyStats?.total_op_seconds ?? 0) / 3600 / (criteria.min_op_hours_per_week ?? 1)) * 100)}%`,
                      backgroundColor: ((weeklyStats?.total_op_seconds ?? 0) / 3600) >= (criteria.min_op_hours_per_week ?? 0) ? 'hsl(var(--success))' : 'hsl(var(--warning))',
                    }}
                  />
                </div>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground italic">
              * รีเซ็ตทุกวันจันทร์ เวลา 00:00 (เวลาไทย GMT+7)
            </p>
          </CardContent>
        </Card>
      )}

      {/* Weekly bar chart */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">สรุปรายวัน (สัปดาห์นี้)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-24">
            {weekDayStats.map((d, i) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col gap-0.5 justify-end" style={{ height: '72px' }}>
                  <div
                    className="w-full rounded-sm bg-primary/70 transition-all"
                    style={{ height: `${(d.work / maxDayWork) * 64}px`, minHeight: d.work > 0 ? '4px' : '0' }}
                    title={`งาน: ${fmtTime(d.work)}`}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{dayNames[i]}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Date range picker ── */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4" /> ดูสถิติช่วงวันที่
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">จาก</span>
              <input
                type="date"
                value={rangeFrom}
                max={rangeTo}
                onChange={e => setRangeFrom(e.target.value)}
                className="bg-muted border border-border rounded-sm px-3 py-1.5 text-sm text-foreground"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">ถึง</span>
              <input
                type="date"
                value={rangeTo}
                min={rangeFrom}
                max={todayStr}
                onChange={e => setRangeTo(e.target.value)}
                className="bg-muted border border-border rounded-sm px-3 py-1.5 text-sm text-foreground"
              />
            </div>
            <Button size="sm" variant="outline" onClick={loadRangeStats} disabled={rangeLoading} className="text-xs h-8 shrink-0">
              {rangeLoading ? 'กำลังโหลด...' : 'ดูข้อมูล'}
            </Button>
          </div>

          {rangeStats && !rangeLoading && (
            <div className="space-y-3">
              {/* Aggregate */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-sm bg-muted">
                  <p className="text-xs text-muted-foreground mb-1">ชั่วโมงทำงานรวม</p>
                  <p className="text-lg font-bold text-foreground">{fmtTime(rangeStats.work)}</p>
                  {rangeSalary !== null && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      ≈ {fmtBaht(rangeSalary)} ฿
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-sm bg-muted">
                  <p className="text-xs text-muted-foreground mb-1">ชั่วโมง OP รวม</p>
                  <p className="text-lg font-bold text-foreground">{fmtTime(rangeStats.op)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{rangeStats.days.length} วัน</p>
                </div>
              </div>

              {/* Per-day breakdown (compact) */}
              {rangeStats.days.some(d => d.work > 0 || d.op > 0) && (
                <div className="rounded-sm border border-border overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-border bg-muted/40">
                    <p className="text-xs font-semibold text-muted-foreground">รายละเอียดรายวัน</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {rangeStats.days.filter(d => d.work > 0 || d.op > 0).map(d => (
                      <div key={d.date} className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 last:border-0 text-xs">
                        <span className="text-muted-foreground shrink-0">
                          {new Date(d.date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-foreground font-mono">{fmtTime(d.work)}</span>
                          {d.op > 0 && (
                            <span className="text-warning font-mono">OP {fmtTime(d.op)}</span>
                          )}
                          {criteria?.hourly_salary != null && d.work > 0 && (
                            <span className="text-primary font-mono">{fmtBaht((d.work / 3600) * criteria.hourly_salary)} ฿</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {rangeLoading && (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
