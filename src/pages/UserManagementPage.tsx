import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
import { toast } from 'sonner';
import { UserPlus, Shield, User, Trash2, Plus, KeyRound, Pencil } from 'lucide-react';
import {
  getAllProfiles, getUserRoles, assignRole, removeRole, createUserByAdmin,
  deleteUserByAdmin, getRoles, updateUserByAdmin,
} from '@/services/adminService';
import type { Profile, UserRole, Role } from '@/types/types';

// =============================================
// Create User Dialog
// =============================================
function CreateUserDialog({ onCreated }: { onCreated: () => void }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sysRole, setSysRole] = useState('user');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!username.trim() || !password.trim()) {
      toast.error('กรุณากรอก Username และ Password');
      return;
    }
    setLoading(true);
    try {
      await createUserByAdmin(username.trim(), password, sysRole);
      toast.success('สร้างบัญชีสำเร็จ');
      setOpen(false);
      setUsername(''); setPassword(''); setSysRole('user');
      onCreated();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'สร้างบัญชีไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-primary text-primary-foreground hover:opacity-90">
          <UserPlus className="w-4 h-4 mr-1" /> สร้างผู้ใช้ใหม่
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
        <DialogHeader>
          <DialogTitle>สร้างบัญชีผู้ใช้ใหม่</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Username</Label>
            <Input value={username} onChange={e => setUsername(e.target.value)}
              placeholder="กรอก Username" className="bg-muted border-border" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Password</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="กรอก Password" className="bg-muted border-border" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">ระดับสิทธิ์</Label>
            <Select value={sysRole} onValueChange={setSysRole}>
              <SelectTrigger className="bg-muted border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                {profile?.system_role === 'super_admin' && (
                  <SelectItem value="admin">Admin</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button size="sm" onClick={handleCreate} disabled={loading}
              className="bg-primary text-primary-foreground hover:opacity-90">
              {loading ? 'กำลังสร้าง...' : 'สร้างบัญชี'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================
// Edit User Dialog
// =============================================
function EditUserDialog({ user, callerProfile, onUpdated }: {
  user: Profile;
  callerProfile: Profile | null;
  onUpdated: (updated: Profile) => void;
}) {
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState(user.nickname ?? '');
  const [icName, setIcName] = useState(user.ic_name ?? '');
  const [sysRole, setSysRole] = useState(user.system_role);
  const [loading, setLoading] = useState(false);

  // reset when dialog opens
  const handleOpen = (v: boolean) => {
    if (v) {
      setNickname(user.nickname ?? '');
      setIcName(user.ic_name ?? '');
      setSysRole(user.system_role);
    }
    setOpen(v);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateUserByAdmin(user.id, {
        nickname: nickname.trim() || null,
        ic_name: icName.trim() || null,
        system_role: sysRole,
      } as { nickname?: string; ic_name?: string; system_role?: string });
      toast.success(`อัปเดตข้อมูล "${user.username}" สำเร็จ`);
      onUpdated({ ...user, nickname: nickname.trim() || null, ic_name: icName.trim() || null, system_role: sysRole });
      setOpen(false);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'อัปเดตข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
        <DialogHeader>
          <DialogTitle>แก้ไขข้อมูล — {user.username}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">ชื่อเล่น (Nickname)</Label>
            <Input value={nickname} onChange={e => setNickname(e.target.value)}
              placeholder="ชื่อเล่น" className="bg-muted border-border" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">ชื่อในเกม (IC Name)</Label>
            <Input value={icName} onChange={e => setIcName(e.target.value)}
              placeholder="ชื่อตัวละครในเกม" className="bg-muted border-border" />
          </div>
          {callerProfile?.system_role === 'super_admin' && user.system_role !== 'super_admin' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">ระดับสิทธิ์</Label>
              <Select value={sysRole} onValueChange={v => setSysRole(v as Profile['system_role'])}>
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button size="sm" onClick={handleSave} disabled={loading}
              className="bg-primary text-primary-foreground hover:opacity-90">
              {loading ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================
// Reset Password Dialog
// =============================================
function ResetPasswordDialog({ user }: { user: Profile }) {
  const [open, setOpen] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (newPass.length < 6) { toast.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    setLoading(true);
    try {
      const { data, error } = await import('@/db/supabase').then(m => m.supabase.functions.invoke('change-password', {
        body: { user_id: user.id, new_password: newPass },
        method: 'POST',
      }));
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(`เปลี่ยนรหัสผ่านของ ${user.username} สำเร็จ`);
      setOpen(false);
      setNewPass('');
    } catch (err: unknown) {
      toast.error((err as Error).message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground">
          <KeyRound className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
        <DialogHeader>
          <DialogTitle>เปลี่ยนรหัสผ่าน — {user.username}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">รหัสผ่านใหม่</Label>
            <Input
              type="password"
              value={newPass}
              onChange={e => setNewPass(e.target.value)}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              className="bg-muted border-border"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button size="sm" onClick={handleReset} disabled={loading}
              className="bg-primary text-primary-foreground hover:opacity-90">
              {loading ? 'กำลังเปลี่ยน...' : 'เปลี่ยนรหัสผ่าน'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================
// User Role Assignment
// =============================================
function UserRolePanel({ user, allRoles, callerProfile }: { user: Profile; allRoles: Role[]; callerProfile: Profile | null }) {
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRoles = useCallback(async () => {
    const ur = await getUserRoles(user.id);
    setUserRoles(ur);
  }, [user.id]);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const handleAssign = async (roleId: string) => {
    if (!callerProfile) return;
    setLoading(true);
    try {
      await assignRole(user.id, roleId, callerProfile.id);
      await loadRoles();
      toast.success('มอบยศสำเร็จ');
    } catch {
      toast.error('มอบยศไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (roleId: string) => {
    setLoading(true);
    try {
      await removeRole(user.id, roleId);
      await loadRoles();
      toast.success('ถอดยศสำเร็จ');
    } catch {
      toast.error('ถอดยศไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const assignedIds = new Set(userRoles.map(ur => ur.role_id));
  const unassigned = allRoles.filter(r => !assignedIds.has(r.id));

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground mb-2">ยศปัจจุบัน</p>
        <div className="flex flex-wrap gap-2">
          {userRoles.length === 0 && <span className="text-xs text-muted-foreground">ยังไม่มียศ</span>}
          {userRoles.map(ur => ur.role && (
            <div key={ur.id} className="flex items-center gap-1.5 px-2 py-1 rounded-sm border"
              style={{ borderColor: ur.role.color + '55' }}>
              <span className="text-xs font-semibold" style={{ color: ur.role.color }}>{ur.role.name}</span>
              <button onClick={() => handleRemove(ur.role_id)}
                className="text-muted-foreground hover:text-destructive ml-1">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
      {unassigned.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">มอบยศเพิ่มเติม</p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map(r => (
              <button key={r.id} onClick={() => handleAssign(r.id)} disabled={loading}
                className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-dashed hover:border-solid transition-colors"
                style={{ borderColor: r.color + '55', color: r.color }}>
                <Plus className="w-3 h-3" />
                <span className="text-xs font-semibold">{r.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================
// Main User Management Page
// =============================================
export default function UserManagementPage() {
  const { profile, hasPermission } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, r] = await Promise.all([getAllProfiles(), getRoles()]);
      setUsers(p as Profile[]);
      setAllRoles(r);
    } catch {
      toast.error('โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    try {
      await deleteUserByAdmin(userToDelete.id);
      setUsers(prev => prev.filter(u => u.id !== userToDelete.id));
      toast.success(`ลบผู้ใช้ "${userToDelete.username}" สำเร็จ`);
      setUserToDelete(null);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'ลบผู้ใช้ไม่สำเร็จ');
    } finally {
      setDeleting(false);
    }
  };

  const handleUserUpdated = (updated: Profile) => {
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
  };

  const sysRoleLabel = (r: string) =>
    r === 'super_admin' ? 'Super Admin' : r === 'admin' ? 'Admin' : 'User';

  const sysRoleBadgeClass = (r: string) =>
    r === 'super_admin'
      ? 'border-primary/50 text-primary'
      : r === 'admin'
        ? 'border-warning/50 text-warning'
        : '';

  // A target user can be managed if caller has enough privilege
  const canManage = (target: Profile) => {
    if (!profile) return false;
    if (profile.system_role === 'super_admin') return true;
    if (profile.system_role === 'admin' && target.system_role === 'user') return true;
    return false;
  };

  const canCreate = hasPermission('create_users');
  const canEdit = hasPermission('edit_users');
  const canDelete = hasPermission('delete_users');
  const canChangePass = hasPermission('change_others_password');
  const canAssignRoles = hasPermission('assign_roles');

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">จัดการผู้ใช้งาน</h1>
          <p className="text-xs text-muted-foreground">{users.length} บัญชี</p>
        </div>
        {canCreate && <CreateUserDialog onCreated={loadData} />}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <Card key={u.id} className="border-border">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-sm bg-muted flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground truncate">{u.username}</p>
                        {u.nickname && <span className="text-xs text-muted-foreground">({u.nickname})</span>}
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${sysRoleBadgeClass(u.system_role)}`}>
                          {sysRoleLabel(u.system_role)}
                        </Badge>
                      </div>
                      {u.ic_name && (
                        <p className="text-xs text-muted-foreground">IC: {u.ic_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canManage(u) && (
                      <>
                        {canEdit && (
                          <EditUserDialog user={u} callerProfile={profile} onUpdated={handleUserUpdated} />
                        )}
                        {canChangePass && <ResetPasswordDialog user={u} />}
                        {canDelete && (
                          <Button
                            variant="ghost" size="icon"
                            className="w-7 h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setUserToDelete(u)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </>
                    )}
                    {canAssignRoles && (
                      <Button
                        variant="outline" size="sm"
                        className="text-xs h-7"
                        onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                      >
                        <Shield className="w-3 h-3 mr-1" />
                        {expandedUser === u.id ? 'ปิด' : 'ยศ'}
                      </Button>
                    )}
                  </div>
                </div>
                {expandedUser === u.id && canAssignRoles && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <UserRolePanel user={u} allRoles={allRoles} callerProfile={profile} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete user confirm */}
      <AlertDialog open={!!userToDelete} onOpenChange={open => !open && setUserToDelete(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>ลบผู้ใช้ "{userToDelete?.username}"?</AlertDialogTitle>
            <AlertDialogDescription>
              บัญชี <strong>{userToDelete?.username}</strong> จะถูกลบออกจากระบบถาวร
              ข้อมูลทุกอย่างรวมถึงสถิติชั่วโมงจะหายไป ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:opacity-90"
            >
              {deleting ? 'กำลังลบ...' : 'ลบผู้ใช้'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

