import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import LoginPage from './pages/LoginPage';
import QueuePage from './pages/QueuePage';
import DashboardPage from './pages/DashboardPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import RoleManagementPage from './pages/RoleManagementPage';
import UserManagementPage from './pages/UserManagementPage';
import WarningsPage from './pages/WarningsPage';
import SettingsPage from './pages/SettingsPage';
import ProtectedRoute from './components/common/ProtectedRoute';
import MainLayout from './components/layouts/MainLayout';
import type { SystemRole } from './types/types';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  public?: boolean;
}

function Protected({ children, roles, permission, permissions }: { children: ReactNode; roles?: SystemRole[]; permission?: string; permissions?: string[] }) {
  return (
    <ProtectedRoute requiredRoles={roles} requiredPermission={permission} requiredPermissions={permissions}>
      <MainLayout>{children}</MainLayout>
    </ProtectedRoute>
  );
}

import WebSettingsPage from './pages/WebSettingsPage';

export const routes: RouteConfig[] = [
  {
    name: 'Home',
    path: '/',
    element: <Navigate to="/queue" replace />,
    public: true,
  },
  {
    name: 'Login',
    path: '/login',
    element: <LoginPage />,
    public: true,
  },
  {
    name: 'Queue',
    path: '/queue',
    element: <Protected><QueuePage /></Protected>,
  },
  {
    name: 'Dashboard',
    path: '/dashboard',
    element: <Protected><DashboardPage /></Protected>,
  },
  {
    name: 'Admin Dashboard',
    path: '/admin/dashboard',
    element: <Protected roles={['super_admin', 'admin']} permission="view_admin_overview"><AdminDashboardPage /></Protected>,
  },
  {
    name: 'Role Management',
    path: '/admin/roles',
    element: <Protected roles={['super_admin', 'admin']} permission="manage_roles"><RoleManagementPage /></Protected>,
  },
  {
    name: 'User Management',
    path: '/admin/users',
    element: <Protected roles={['super_admin', 'admin']} permissions={['create_users', 'edit_users', 'delete_users', 'change_others_password', 'assign_roles']}><UserManagementPage /></Protected>,
  },
  {
    name: 'Warnings',
    path: '/admin/warnings',
    element: <Protected><WarningsPage /></Protected>,
  },
  {
    name: 'Web Settings',
    path: '/admin/web-settings',
    element: <Protected roles={['super_admin', 'admin']} permission="manage_system_settings"><WebSettingsPage /></Protected>,
  },
  {
    name: 'Settings',
    path: '/settings',
    element: <Protected><SettingsPage /></Protected>,
  },
];
