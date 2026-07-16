// =============================================
// Database Types
// =============================================

export type SystemRole = 'super_admin' | 'admin' | 'user';

export interface Profile {
  id: string;
  username: string;
  nickname: string | null;
  ic_name: string | null;
  system_role: SystemRole;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: string;
  name: string;
  display_name: string;
  sort_order: number;
  track_time: boolean;
  created_at: string;
}

export interface UserPresence {
  id: string;
  user_id: string;
  channel_id: string;
  joined_channel_at: string;
  is_op: boolean;
  queue_position: number | null;
  session_started_at: string;
  last_heartbeat: string;
  created_at: string;
  // joined from profiles
  profile?: Profile;
  // joined from channels
  channel?: Channel;
}

export interface QueuePointer {
  id: string;
  pointed_user_id: string | null;
  updated_at: string;
}

export interface PresenceLog {
  id: string;
  user_id: string;
  from_channel_id: string | null;
  to_channel_id: string | null;
  changed_at: string;
  created_at: string;
  // joined
  profile?: Profile;
  from_channel?: Channel;
  to_channel?: Channel;
}

export interface Role {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface RoleCriteria {
  id: string;
  role_id: string;
  next_role_id: string | null;
  min_work_hours_per_week: number | null;
  min_op_hours_per_week: number | null;
  work_hours_enabled: boolean;
  op_hours_enabled: boolean;
  hourly_salary: number | null;
  created_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  assigned_at: string;
  assigned_by: string | null;
  // joined
  role?: Role;
  profile?: Profile;
}

export interface TimeLog {
  id: string;
  user_id: string;
  channel_id: string;
  started_at: string;
  ended_at: string | null;
  is_op_time: boolean;
  duration_seconds: number | null;
  created_at: string;
}

export interface WeeklyStats {
  id: string;
  user_id: string;
  week_start: string;
  total_work_seconds: number;
  total_op_seconds: number;
  updated_at: string;
  // joined
  profile?: Profile;
}

// =============================================
// App State Types
// =============================================

export interface PresenceWithProfile extends UserPresence {
  profile: Profile;
  channel: Channel;
}

export interface UserWithStats {
  profile: Profile;
  roles: Role[];
  weekly_work_seconds: number;
  weekly_op_seconds: number;
  today_work_seconds: number;
  today_op_seconds: number;
  promotion_eligible: boolean;
  current_role?: Role;
  next_role?: Role;
}

export interface DailyStats {
  date: string;
  total_work_seconds: number;
  total_op_seconds: number;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission: string;
  enabled: boolean;
}

// =============================================
// Permission Definitions
// =============================================
export interface PermissionDef {
  key: string;
  label: string;
  description: string;
}

export interface PermissionCategory {
  category: string;
  icon: string;
  permissions: PermissionDef[];
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    category: 'คิว (Queue)',
    icon: '📋',
    permissions: [
      { key: 'view_queue', label: 'ดูคิว', description: 'เห็นคิวและสมาชิกในห้อง' },
      { key: 'manage_queue_pointer', label: 'ขยับตัวชี้คิว', description: 'ขยับลูกศรชี้คิวไปยังคนถัดไป' },
      { key: 'move_player', label: 'ย้ายผู้เล่น', description: 'ย้ายผู้เล่นระหว่างห้อง' },
      { key: 'set_op_others', label: 'เปิด/ปิด OP ให้ผู้อื่น', description: 'สลับสถานะ OP ให้สมาชิกคนอื่น' },
    ],
  },
  {
    category: 'ข้อมูลและสถิติ (Stats)',
    icon: '📊',
    permissions: [
      { key: 'view_own_dashboard', label: 'ดู Dashboard ตัวเอง', description: 'เข้าถึงสถิติชั่วโมงทำงานของตัวเอง' },
      { key: 'view_member_dashboard', label: 'ดู Dashboard สมาชิก', description: 'กดดู Dashboard ของสมาชิกคนอื่นได้' },
      { key: 'view_admin_overview', label: 'ดูภาพรวมหน่วย', description: 'เข้าหน้าสรุปชั่วโมงของทุกคน' },
      { key: 'view_all_stats', label: 'ดูสถิติทุกคน', description: 'เห็นข้อมูลชั่วโมงทำงานของสมาชิกทั้งหมด' },
    ],
  },
  {
    category: 'จัดการผู้ใช้ (Users)',
    icon: '👤',
    permissions: [
      { key: 'create_users', label: 'สร้างผู้ใช้ใหม่', description: 'สร้างบัญชีผู้ใช้งานใหม่ในระบบ' },
      { key: 'edit_users', label: 'แก้ไขข้อมูลผู้ใช้', description: 'เปลี่ยนชื่อ, ชื่อในเกม ของสมาชิก' },
      { key: 'delete_users', label: 'ลบผู้ใช้', description: 'ลบบัญชีสมาชิกออกจากระบบ' },
      { key: 'change_others_password', label: 'เปลี่ยนรหัสผ่านผู้อื่น', description: 'รีเซ็ตรหัสผ่านให้สมาชิก' },
      { key: 'assign_roles', label: 'มอบ/ถอดยศ', description: 'กำหนดยศให้สมาชิกในทีม' },
    ],
  },
  {
    category: 'ตั้งค่าระบบ (System)',
    icon: '⚙️',
    permissions: [
      { key: 'manage_roles', label: 'จัดการยศ', description: 'สร้าง แก้ไข ลบ ยศในระบบ' },
      { key: 'manage_channels', label: 'จัดการห้อง', description: 'เพิ่ม แก้ไข ลบ ห้องคาเฟ่' },
      { key: 'manage_system_settings', label: 'ตั้งค่าระบบ', description: 'แก้ไขการตั้งค่าทั่วไปของระบบ' },
    ],
  },
];
