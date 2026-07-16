import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Sliders, Clock, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useTeam } from '@/contexts/TeamContext';

// =============================================
// System settings helpers
// =============================================
async function getSystemSetting(key: string): Promise<string | null> {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  return data?.value ?? null;
}

async function setSystemSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

// =============================================
// Web Settings Page
// =============================================
export default function WebSettingsPage() {
  const { currentTeam } = useTeam();
  const [minHours, setMinHours] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'min_weekly_hours');
      if (currentTeam?.id) query = query.eq('team_id', currentTeam.id);
      const { data } = await query.maybeSingle();
      setMinHours(data?.value !== null && data?.value !== undefined ? parseFloat(data.value) : 0);
    } catch {
      toast.error('โหลดการตั้งค่าไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [currentTeam?.id]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const insertData: Record<string, unknown> = { key: 'min_weekly_hours', value: String(minHours), updated_at: new Date().toISOString() };
      if (currentTeam?.id) insertData.team_id = currentTeam.id;
      const { error } = await supabase
        .from('system_settings')
        .upsert(insertData, { onConflict: 'key' });
      if (error) throw error;
      toast.success('บันทึกการตั้งค่าสำเร็จ');
    } catch {
      toast.error('บันทึกการตั้งค่าไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-6 max-w-xl mx-auto">
      <div>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Sliders className="w-5 h-5 text-primary" />
          ตั้งค่าระบบ
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          กำหนดกฎและข้อกำหนดการใช้งานระบบ
        </p>
      </div>

      {/* Min weekly hours */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            ชั่วโมงออนไลน์ขั้นต่ำต่อสัปดาห์
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                กำหนดจำนวนชั่วโมงขั้นต่ำที่ผู้ใช้แต่ละคนต้องออนไลน์ในระบบต่อสัปดาห์
                ระบบจะใช้ข้อมูลนี้ในการประเมินและแจ้งเตือนสมาชิกที่ยังไม่ถึงเป้า
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-sm">จำนวนชั่วโมงขั้นต่ำ</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={minHours}
                      onChange={e => setMinHours(parseFloat(e.target.value) || 0)}
                      className="w-28 h-9 bg-muted border-border text-right px-3"
                    />
                    <span className="text-sm text-muted-foreground shrink-0">ชั่วโมง/สัปดาห์</span>
                  </div>
                </div>
              </div>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-primary text-primary-foreground hover:opacity-90"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly reset info */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-primary" />
            การรีเซ็ตสถิติรายสัปดาห์
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>ระบบจะรีเซ็ตสถิติเวลาออนไลน์ของสมาชิกทุกคนโดยอัตโนมัติ</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>รีเซ็ตทุกวัน<span className="text-foreground font-medium">จันทร์เที่ยงคืน (00:00 เวลไทย GMT+7)</span></li>
              <li>ระบบจะสำรองข้อมูลสถิติไว้<span className="text-foreground font-medium">ย้อนหลัง 2 สัปดาห์</span></li>
              <li>ข้อมูลเก่ากว่า 2 สัปดาห์จะถูกลบออกจากระบบโดยอัตโนมัติ</li>
            </ul>
            <div className="mt-3 px-3 py-2 rounded-sm bg-muted/60 border border-border text-muted-foreground">
              กระบวนการรีเซ็ตทำงานโดยอัตโนมัติผ่าน Scheduled Function — ไม่ต้องดำเนินการใดๆ
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
