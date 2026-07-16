import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Trash2, ChevronDown, ChevronUp, Settings, Shield } from 'lucide-react';
import {
  getRoles, createRole, updateRole, deleteRole, reorderRoles,
  upsertRoleCriteria, getRoleCriteria, getRolePermissions, setRolePermissions,
} from '@/services/adminService';
import { getChannels, addChannel, updateChannelTrackTime, deleteChannel } from '@/services/presenceService';
import type { Role, RoleCriteria, Channel, RolePermission } from '@/types/types';
import { PERMISSION_CATEGORIES } from '@/types/types';

// =============================================
// Role Criteria Editor
// =============================================
function RoleCriteriaEditor({ role, allRoles }: { role: Role; allRoles: Role[] }) {
  const [criteria, setCriteria] = useState<Partial<RoleCriteria>>({
    role_id: role.id,
    work_hours_enabled: false,
    op_hours_enabled: false,
    min_work_hours_per_week: 0,
    min_op_hours_per_week: 0,
    hourly_salary: null,
    next_role_id: null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getRoleCriteria(role.id).then(c => {
      if (c) setCriteria(c);
    });
  }, [role.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertRoleCriteria({
        role_id: role.id,
        next_role_id: criteria.next_role_id ?? null,
        work_hours_enabled: criteria.work_hours_enabled ?? false,
        op_hours_enabled: criteria.op_hours_enabled ?? false,
        min_work_hours_per_week: criteria.work_hours_enabled ? (criteria.min_work_hours_per_week ?? 0) : null,
        min_op_hours_per_week: criteria.op_hours_enabled ? (criteria.min_op_hours_per_week ?? 0) : null,
        hourly_salary: criteria.hourly_salary ?? null,
      });
      toast.success('บันทึกเกณฑ์สำเร็จ');
    } catch {
      toast.error('บันทึกเกณฑ์ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 pt-2">
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
        เกณฑ์เลื่อนยศต่อสัปดาห์
      </p>
      <div className="space-y-2.5">
        {/* Promotion target role */}
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-border/50">
          <Label className="text-sm shrink-0">เลื่อนขึ้นเป็นยศ</Label>
          <Select
            value={criteria.next_role_id ?? 'none'}
            onValueChange={v => setCriteria(c => ({ ...c, next_role_id: v === 'none' ? null : v }))}
          >
            <SelectTrigger className="h-7 text-xs bg-muted border-border w-40">
              <SelectValue placeholder="ไม่กำหนด" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">ไม่กำหนด</SelectItem>
              {allRoles.filter(r => r.id !== role.id).map(r => (
                <SelectItem key={r.id} value={r.id}>
                  <span style={{ color: r.color }}>{r.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Switch
              checked={criteria.work_hours_enabled ?? false}
              onCheckedChange={v => setCriteria(c => ({ ...c, work_hours_enabled: v }))}
            />
            <Label className="text-sm cursor-pointer">ชั่วโมงทำงานขั้นต่ำ</Label>
          </div>
          {criteria.work_hours_enabled && (
            <div className="flex items-center gap-2 shrink-0">
              <Input
                type="number" min={0} step={0.5}
                value={criteria.min_work_hours_per_week ?? 0}
                onChange={e => setCriteria(c => ({ ...c, min_work_hours_per_week: parseFloat(e.target.value) || 0 }))}
                className="w-20 h-7 text-sm bg-muted border-border text-right px-2"
              />
              <span className="text-xs text-muted-foreground">ชม.</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Switch
              checked={criteria.op_hours_enabled ?? false}
              onCheckedChange={v => setCriteria(c => ({ ...c, op_hours_enabled: v }))}
            />
            <Label className="text-sm cursor-pointer">ชั่วโมง OP ขั้นต่ำ</Label>
          </div>
          {criteria.op_hours_enabled && (
            <div className="flex items-center gap-2 shrink-0">
              <Input
                type="number" min={0} step={0.5}
                value={criteria.min_op_hours_per_week ?? 0}
                onChange={e => setCriteria(c => ({ ...c, min_op_hours_per_week: parseFloat(e.target.value) || 0 }))}
                className="w-20 h-7 text-sm bg-muted border-border text-right px-2"
              />
              <span className="text-xs text-muted-foreground">ชม.</span>
            </div>
          )}
        </div>
        {/* Hourly salary */}
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/50">
          <div className="flex items-center gap-2 flex-1">
            <Switch
              checked={criteria.hourly_salary !== null && criteria.hourly_salary !== undefined}
              onCheckedChange={v => setCriteria(c => ({ ...c, hourly_salary: v ? 0 : null }))}
            />
            <Label className="text-sm cursor-pointer">ค่าตอบแทนต่อชั่วโมง</Label>
          </div>
          {criteria.hourly_salary !== null && criteria.hourly_salary !== undefined && (
            <div className="flex items-center gap-2 shrink-0">
              <Input
                type="number" min={0} step={1}
                value={criteria.hourly_salary ?? 0}
                onChange={e => setCriteria(c => ({ ...c, hourly_salary: parseFloat(e.target.value) || 0 }))}
                className="w-24 h-7 text-sm bg-muted border-border text-right px-2"
              />
              <span className="text-xs text-muted-foreground">บาท/ชม.</span>
            </div>
          )}
        </div>
      </div>
      <Button size="sm" onClick={handleSave} disabled={saving}
        className="bg-primary text-primary-foreground hover:opacity-90 text-xs h-7">
        {saving ? 'กำลังบันทึก...' : 'บันทึกเกณฑ์'}
      </Button>
    </div>
  );
}

// =============================================
// Role Permissions Editor (checkbox grid)
// =============================================
function PermissionsEditor({ roleId }: { roleId: string }) {
  const [permMap, setPermMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    getRolePermissions(roleId).then((perms: RolePermission[]) => {
      const map: Record<string, boolean> = {};
      perms.forEach(p => { map[p.permission] = p.enabled; });
      setPermMap(map);
    }).finally(() => setLoading(false));
  }, [roleId]);

  const toggle = (key: string) => {
    setPermMap(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setRolePermissions(roleId, permMap);
      toast.success('บันทึกสิทธิ์สำเร็จ');
    } catch {
      toast.error('บันทึกสิทธิ์ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-3"><Skeleton className="h-32 w-full" /></div>;

  return (
    <div className="space-y-4 pt-2">
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
        <Shield className="w-3.5 h-3.5 text-primary" /> สิทธิ์การเข้าถึง
      </p>
      {PERMISSION_CATEGORIES.map(cat => (
        <div key={cat.category} className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">
            {cat.icon} {cat.category}
          </p>
          <div className="grid grid-cols-1 gap-1.5 pl-2">
            {cat.permissions.map(perm => (
              <label
                key={perm.key}
                className="flex items-start gap-2.5 cursor-pointer group rounded-sm p-1.5 hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={permMap[perm.key] === true}
                  onCheckedChange={() => toggle(perm.key)}
                  className="mt-0.5 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground leading-tight">{perm.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{perm.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}
      <Button size="sm" onClick={handleSave} disabled={saving}
        className="bg-primary text-primary-foreground hover:opacity-90 text-xs h-7 w-full">
        {saving ? 'กำลังบันทึก...' : 'บันทึกสิทธิ์ทั้งหมด'}
      </Button>
    </div>
  );
}

// =============================================
// Role Card (draggable row)
// =============================================
interface RoleCardProps {
  role: Role;
  index: number;
  total: number;
  allRoles: Role[];
  onDelete: (id: string) => void;
  onMove: (id: string, dir: 'up' | 'down') => void;
  onUpdate: (id: string, updates: Partial<Role>) => void;
}

type RoleTab = 'info' | 'criteria' | 'permissions';

function RoleCard({ role, index, total, allRoles, onDelete, onMove, onUpdate }: RoleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<RoleTab>('info');
  const [editName, setEditName] = useState(role.name);
  const [editColor, setEditColor] = useState(role.color);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await updateRole(role.id, { name: editName.trim(), color: editColor });
      onUpdate(role.id, { name: editName.trim(), color: editColor });
      toast.success('อัปเดตยศสำเร็จ');
    } catch {
      toast.error('อัปเดตยศไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { key: RoleTab; label: string }[] = [
    { key: 'info', label: 'ข้อมูล' },
    { key: 'criteria', label: 'เกณฑ์' },
    { key: 'permissions', label: 'สิทธิ์' },
  ];

  return (
    <>
      <div className="rounded-sm border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* Reorder */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <button onClick={() => onMove(role.id, 'up')} disabled={index === 0}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30">
              <ChevronUp className="w-3 h-3" />
            </button>
            <button onClick={() => onMove(role.id, 'down')} disabled={index === total - 1}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30">
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* Color dot */}
          <div className="w-3 h-3 rounded-full shrink-0 border"
            style={{ backgroundColor: editColor, borderColor: editColor + '88' }} />

          {/* Name */}
          <span className="flex-1 min-w-0 text-sm font-semibold truncate" style={{ color: editColor }}>
            {role.name}
          </span>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => setExpanded(v => !v)}>
              <Settings className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive"
              onClick={() => setDeleteConfirm(true)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-border">
            {/* Tab bar */}
            <div className="flex border-b border-border">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    activeTab === t.key
                      ? 'text-primary border-b-2 border-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="px-3 pb-4 pt-3">
              {activeTab === 'info' && (
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="flex-1 min-w-28 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">ชื่อยศ</Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)}
                      className="h-7 text-sm bg-muted border-border" />
                  </div>
                  <div className="space-y-1.5 shrink-0">
                    <Label className="text-xs text-muted-foreground">สีประจำยศ</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={editColor}
                        onChange={e => setEditColor(e.target.value)}
                        className="w-8 h-7 rounded border border-border cursor-pointer bg-transparent" />
                      <Input value={editColor} onChange={e => setEditColor(e.target.value)}
                        className="h-7 text-xs bg-muted border-border w-24" />
                    </div>
                  </div>
                  <Button size="sm" onClick={handleSaveName} disabled={saving}
                    className="self-end h-7 text-xs bg-primary text-primary-foreground hover:opacity-90 shrink-0">
                    {saving ? '...' : 'บันทึก'}
                  </Button>
                </div>
              )}
              {activeTab === 'criteria' && (
                <RoleCriteriaEditor role={{ ...role, name: editName, color: editColor }} allRoles={allRoles} />
              )}
              {activeTab === 'permissions' && (
                <PermissionsEditor roleId={role.id} />
              )}
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>ลบยศ "{role.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              การลบยศจะถอดยศนี้ออกจากทุกคนที่ถืออยู่ ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(role.id)}
              className="bg-destructive text-destructive-foreground hover:opacity-90">
              ลบยศ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =============================================
// Main Role Management Page
// =============================================
export default function RoleManagementPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#22c55e');
  const [creating, setCreating] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);
  const [deletingChannel, setDeletingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [creatingChannel, setCreatingChannel] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [r, ch] = await Promise.all([getRoles(), getChannels()]);
      setRoles(r);
      setChannels(ch);
    } catch { toast.error('โหลดข้อมูลไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async () => {
    if (!newRoleName.trim()) { toast.error('กรุณากรอกชื่อยศ'); return; }
    setCreating(true);
    try {
      const r = await createRole(newRoleName.trim(), newRoleColor);
      setRoles(prev => [...prev, r]);
      setNewRoleName(''); setNewRoleColor('#22c55e');
      toast.success('สร้างยศสำเร็จ');
    } catch { toast.error('สร้างยศไม่สำเร็จ'); }
    finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRole(id);
      setRoles(prev => prev.filter(r => r.id !== id));
      toast.success('ลบยศสำเร็จ');
    } catch { toast.error('ลบยศไม่สำเร็จ'); }
  };

  const handleMove = async (id: string, dir: 'up' | 'down') => {
    const idx = roles.findIndex(r => r.id === id);
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === roles.length - 1) return;
    const newRoles = [...roles];
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    [newRoles[idx], newRoles[swapIdx]] = [newRoles[swapIdx], newRoles[idx]];
    setRoles(newRoles);
    await reorderRoles(newRoles.map(r => r.id));
  };

  const handleUpdateLocal = (id: string, updates: Partial<Role>) => {
    setRoles(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const handleChannelTrackTime = async (channelId: string, track: boolean) => {
    try {
      await updateChannelTrackTime(channelId, track);
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, track_time: track } : c));
      toast.success('อัปเดตการตั้งค่าห้องสำเร็จ');
    } catch { toast.error('อัปเดตการตั้งค่าห้องไม่สำเร็จ'); }
  };

  const handleDeleteChannel = async () => {
    if (!channelToDelete) return;
    setDeletingChannel(true);
    try {
      await deleteChannel(channelToDelete.id);
      setChannels(prev => prev.filter(c => c.id !== channelToDelete.id));
      toast.success(`ลบห้อง "${channelToDelete.display_name}" สำเร็จ`);
      setChannelToDelete(null);
    } catch { toast.error('ลบห้องไม่สำเร็จ'); }
    finally { setDeletingChannel(false); }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) { toast.error('กรุณากรอกชื่อห้อง'); return; }
    setCreatingChannel(true);
    try {
      const ch = await addChannel(newChannelName.trim());
      setChannels(prev => [...prev, ch]);
      setNewChannelName('');
      toast.success(`สร้างห้อง "${ch.display_name}" สำเร็จ`);
    } catch { toast.error('สร้างห้องไม่สำเร็จ'); }
    finally { setCreatingChannel(false); }
  };

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-lg font-bold text-foreground">จัดการยศ</h1>
        <p className="text-xs text-muted-foreground">สร้าง กำหนดเกณฑ์ และสิทธิ์ของแต่ละยศ</p>
      </div>

      {/* Channel time settings */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" /> ตั้งค่าห้องคาเฟ่
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Create channel form */}
          <div className="flex items-center gap-2">
            <Input
              value={newChannelName}
              onChange={e => setNewChannelName(e.target.value)}
              placeholder="ชื่อห้องใหม่..."
              className="bg-muted border-border h-8 text-sm flex-1"
              onKeyDown={e => e.key === 'Enter' && handleCreateChannel()}
            />
            <Button
              size="sm"
              onClick={handleCreateChannel}
              disabled={creatingChannel}
              className="h-8 bg-primary text-primary-foreground hover:opacity-90 shrink-0"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {creatingChannel ? 'กำลังสร้าง...' : 'เพิ่มห้อง'}
            </Button>
          </div>
          <div className="space-y-1">
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : channels.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">ยังไม่มีห้อง</p>
            ) : (
              channels.map(ch => (
                <div key={ch.id} className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{ch.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ch.track_time ? 'นับเวลาทำงาน ✓' : 'ไม่นับเวลา'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={ch.track_time}
                      onCheckedChange={v => handleChannelTrackTime(ch.id, v)}
                    />
                    <Button
                      variant="ghost" size="icon"
                      className="w-7 h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setChannelToDelete(ch)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create new role */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">สร้างยศใหม่</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-32 space-y-1.5">
              <Label className="text-xs text-muted-foreground">ชื่อยศ</Label>
              <Input
                value={newRoleName}
                onChange={e => setNewRoleName(e.target.value)}
                placeholder="เช่น เลขา, หัวหน้า..."
                className="bg-muted border-border h-8"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="space-y-1.5 shrink-0">
              <Label className="text-xs text-muted-foreground">สีประจำยศ</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={newRoleColor}
                  onChange={e => setNewRoleColor(e.target.value)}
                  className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent" />
                <Input value={newRoleColor} onChange={e => setNewRoleColor(e.target.value)}
                  className="h-8 text-xs bg-muted border-border w-24" />
              </div>
            </div>
            <Button onClick={handleCreate} disabled={creating}
              size="sm" className="h-8 bg-primary text-primary-foreground hover:opacity-90 shrink-0">
              <Plus className="w-4 h-4 mr-1" />
              {creating ? 'กำลังสร้าง...' : 'สร้างยศ'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Role list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">ลำดับยศ (สูง → ต่ำ)</p>
          <span className="text-xs text-muted-foreground">{roles.length} ยศ</span>
        </div>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
        ) : roles.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            ยังไม่มียศ กรุณาสร้างยศใหม่
          </div>
        ) : (
          roles.map((role, idx) => (
            <RoleCard
              key={role.id}
              role={role}
              index={idx}
              total={roles.length}
              allRoles={roles}
              onDelete={handleDelete}
              onMove={handleMove}
              onUpdate={handleUpdateLocal}
            />
          ))
        )}
      </div>

      {/* Delete channel confirm */}
      <AlertDialog open={!!channelToDelete} onOpenChange={open => !open && setChannelToDelete(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>ลบห้อง "{channelToDelete?.display_name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              ผู้ใช้ที่อยู่ในห้องนี้จะถูกเตะออก และข้อมูลห้องจะหายถาวร ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChannel}
              disabled={deletingChannel}
              className="bg-destructive text-destructive-foreground hover:opacity-90"
            >
              {deletingChannel ? 'กำลังลบ...' : 'ลบห้อง'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
