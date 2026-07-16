import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Menu, LogOut, Settings, LayoutDashboard, Users, Shield, Radio, ChevronDown, AlertTriangle, Sliders,
} from 'lucide-react';
import { leavePresence } from '@/services/presenceService';
import { toast } from 'sonner';

// nav item: either needs system_role OR a permission key
const navItems = [
  { label: 'คิวงาน',        path: '/queue',                icon: Radio,          permission: null,                     roles: ['super_admin', 'admin', 'user'] },
  { label: 'Dashboard',     path: '/dashboard',            icon: LayoutDashboard, permission: 'view_own_dashboard',    roles: ['super_admin', 'admin', 'user'] },
  { label: 'ภาพรวม',        path: '/admin/dashboard',      icon: LayoutDashboard, permission: 'view_admin_overview',   roles: ['super_admin', 'admin'] },
  { label: 'จัดการยศ',      path: '/admin/roles',          icon: Shield,          permission: 'manage_roles',          roles: ['super_admin', 'admin'] },
  { label: 'จัดการผู้ใช้',   path: '/admin/users',          icon: Users,           permission: 'create_users',          roles: ['super_admin', 'admin'] },
  { label: 'ใบเตือน',       path: '/admin/warnings',       icon: AlertTriangle,   permission: null,                     roles: ['super_admin', 'admin', 'user'] },
  { label: 'ตั้งค่าระบบ',    path: '/admin/web-settings',   icon: Sliders,         permission: 'manage_system_settings', roles: ['super_admin', 'admin'] },
];

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { profile, hasPermission, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    try { await leavePresence(); } catch (_) {}
    await signOut();
    navigate('/login', { replace: true });
    toast.success('ออกจากระบบแล้ว');
  };

  const role = profile?.system_role ?? 'user';
  const displayName = profile?.nickname || profile?.ic_name || profile?.username || 'ผู้ใช้';

  // Show nav item based on permission key first; fall back to role-only items (no permission key).
  // This ensures role_permissions toggles actually gate nav items for all system_roles.
  // admin/super_admin: hasPermission always returns true, so they see everything.
  // user: only sees items where their role_permissions grant the key, or items with no permission gate.
  const allowedNav = navItems.filter(n => {
    if (n.permission) return hasPermission(n.permission);
    return n.roles.includes(role);
  });

  const NavLinks = ({ onClose }: { onClose?: () => void }) => (
    <nav className="flex flex-col gap-1">
      {allowedNav.map(item => (
        <NavLink
          key={item.path}
          to={item.path}
          onClick={onClose}
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary/15 text-primary border-l-2 border-primary'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground border-l-2 border-transparent'
            }`
          }
        >
          <item.icon className="w-4 h-4 shrink-0" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-sidebar border-r border-sidebar-border">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
          <Shield className="w-5 h-5 text-primary" />
          <span className="font-bold text-sm tracking-widest uppercase text-foreground">MEDIC</span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider px-3 mb-2">เมนูหลัก</p>
          <NavLinks />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2 px-2 py-2 rounded-sm hover:bg-sidebar-accent text-left">
                <div className="w-7 h-7 rounded-sm bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">{displayName[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {role === 'super_admin' ? 'Super Admin' : role === 'admin' ? 'Admin' : 'User'}
                  </p>
                </div>
                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="w-4 h-4 mr-2" /> ตั้งค่าบัญชี
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> ออกจากระบบ
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-56 p-0 bg-sidebar border-sidebar-border">
              <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
                <Shield className="w-5 h-5 text-primary" />
                <span className="font-bold text-sm tracking-widest uppercase text-foreground">MEDIC</span>
              </div>
              <div className="px-2 py-3">
                <NavLinks onClose={() => setMobileOpen(false)} />
              </div>
              <div className="absolute bottom-0 left-0 right-0 border-t border-sidebar-border p-3">
                <button
                  onClick={() => { setMobileOpen(false); navigate('/settings'); }}
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm text-sidebar-foreground hover:text-foreground"
                >
                  <Settings className="w-4 h-4" /> ตั้งค่าบัญชี
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm text-destructive"
                >
                  <LogOut className="w-4 h-4" /> ออกจากระบบ
                </button>
              </div>
            </SheetContent>
          </Sheet>
          <Shield className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm tracking-widest uppercase">MEDIC</span>
          <div className="flex-1" />
          <div className="w-7 h-7 rounded-sm bg-primary/20 flex items-center justify-center">
            <span className="text-xs font-bold text-primary">{displayName[0]?.toUpperCase()}</span>
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}


