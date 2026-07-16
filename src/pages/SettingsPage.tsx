import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { User, Lock, Shield, Settings2, Trash2, Plus } from 'lucide-react';
import { updateProfile, changePassword } from '@/services/adminService';
import {
  getChannels, addChannel, updateChannelTrackTime, deleteChannel,
} from '@/services/presenceService';
import type { Channel } from '@/types/types';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const [nickname, setNickname] = useState('');
  const [icName, setIcName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Channel management (admin only)
  const isAdmin = profile?.system_role === 'super_admin' || profile?.system_role === 'admin';
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);
  const [deletingChannel, setDeletingChannel] = useState(false);

  const loadChannels = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingChannels(true);
    try {
      const ch = await getChannels();
      setChannels(ch);
    } catch {
      toast.error('โหลดห้องไม่สำเร็จ');
    } finally {
      setLoadingChannels(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const handleChannelTrackTime = async (channelId: string, track: boolean) => {
    try {
      await updateChannelTrackTime(channelId, track);
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, track_time: track } : c));
      toast.success('อัปเดตการตั้งค่าห้องสำเร็จ');
    } catch {
      toast.error('อัปเดตการตั้งค่าห้องไม่สำเร็จ');
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) { toast.error('กรุณากรอกชื่อห้อง'); return; }
    setCreatingChannel(true);
    try {
      const ch = await addChannel(newChannelName.trim());
      setChannels(prev => [...prev, ch]);
      setNewChannelName('');
      toast.success(`สร้างห้อง "${ch.display_name}" สำเร็จ`);
    } catch {
      toast.error('สร้างห้องไม่สำเร็จ');
    } finally {
      setCreatingChannel(false);
    }
  };

  const handleDeleteChannel = async () => {
    if (!channelToDelete) return;
    setDeletingChannel(true);
    try {
      await deleteChannel(channelToDelete.id);
      setChannels(prev => prev.filter(c => c.id !== channelToDelete.id));
      toast.success(`ลบห้อง "${channelToDelete.display_name}" สำเร็จ`);
      setChannelToDelete(null);
    } catch {
      toast.error('ลบห้องไม่สำเร็จ');
    } finally {
      setDeletingChannel(false);
    }
  };

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname ?? '');
      setIcName(profile.ic_name ?? '');
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSavingProfile(true);
    try {
      await updateProfile(profile.id, {
        nickname: nickname.trim() || undefined,
        ic_name: icName.trim() || undefined,
      });
      await refreshProfile();
      toast.success('บันทึกข้อมูลโปรไฟล์สำเร็จ');
    } catch (err) {
      toast.error('บันทึกโปรไฟล์ไม่สำเร็จ');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      toast.error('กรุณากรอกรหัสผ่านใหม่');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('รหัสผ่านใหม่ไม่ตรงกัน');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(newPassword);
      toast.success('เปลี่ยนรหัสผ่านสำเร็จ');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error('เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto space-y-4">
      <div>
        <h1 className="text-lg font-bold text-foreground">ตั้งค่าบัญชี</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          จัดการข้อมูลส่วนตัวและความปลอดภัย
        </p>
      </div>

      {/* Profile info (read-only) */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> ข้อมูลบัญชี
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3 p-3 rounded-sm bg-muted">
            <div className="w-10 h-10 rounded-sm bg-primary/20 flex items-center justify-center">
              <span className="text-base font-bold text-primary">
                {(profile?.nickname || profile?.username || '?')[0].toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{profile?.username}</p>
              <p className="text-xs text-muted-foreground">
                {profile?.system_role === 'super_admin' ? 'Super Admin' :
                  profile?.system_role === 'admin' ? 'Admin' : 'User'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit nickname & IC name */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-primary" /> ข้อมูลส่วนตัว
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Nickname (ชื่อแสดง)
            </Label>
            <Input
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="กรอก Nickname"
              className="bg-muted border-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              IC Name (ชื่อในเกม)
            </Label>
            <Input
              value={icName}
              onChange={e => setIcName(e.target.value)}
              placeholder="กรอกชื่อในเกม"
              className="bg-muted border-border"
            />
          </div>
          <Button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="bg-primary text-primary-foreground hover:opacity-90"
            size="sm"
          >
            {savingProfile ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
          </Button>
        </CardContent>
      </Card>

      {/* Channel management (admin only) */}
      {isAdmin && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" /> จัดการห้องคาเฟ่
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
              {loadingChannels ? (
                <p className="text-xs text-muted-foreground py-2">กำลังโหลด...</p>
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
      )}

      {/* Change password */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" /> เปลี่ยนรหัสผ่าน
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              รหัสผ่านใหม่
            </Label>
            <Input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)"
              className="bg-muted border-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              ยืนยันรหัสผ่านใหม่
            </Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="ยืนยันรหัสผ่านใหม่"
              className="bg-muted border-border"
            />
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={savingPassword}
            variant="outline"
            size="sm"
          >
            {savingPassword ? 'กำลังเปลี่ยน...' : 'เปลี่ยนรหัสผ่าน'}
          </Button>
        </CardContent>
      </Card>

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
