import { Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import ProtectedRoute from './components/common/ProtectedRoute';
import MainLayout from './components/layouts/MainLayout';
import type { SystemRole } from './types/types';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const QueuePage = lazy(() => import('./pages/QueuePage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const RoleManagementPage = lazy(() => import('./pages/RoleManagementPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const WarningsPage = lazy(() => import('./pages/WarningsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const WebSettingsPage = lazy(() => import('./pages/WebSettingsPage'));

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

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

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
    element: <LazyPage><LoginPage /></LazyPage>,
    public: true,
  },
  {
    name: 'Queue',
    path: '/queue',
    element: <Protected><LazyPage><QueuePage /></LazyPage></Protected>,
  },
  {
    name: 'Dashboard',
    path: '/dashboard',
    element: <Protected><LazyPage><DashboardPage /></LazyPage></Protected>,
  },
  {
    name: 'Admin Dashboard',
    path: '/admin/dashboard',
    element: <Protected roles={['super_admin', 'admin']} permission="view_admin_overview"><LazyPage><AdminDashboardPage /></LazyPage></Protected>,
  },
  {
    name: 'Role Management',
    path: '/admin/roles',
    element: <Protected roles={['super_admin', 'admin']} permission="manage_roles"><LazyPage><RoleManagementPage /></LazyPage></Protected>,
  },
  {
    name: 'User Management',
    path: '/admin/users',
    element: <Protected roles={['super_admin', 'admin']} permissions={['create_users', 'edit_users', 'delete_users', 'change_others_password', 'assign_roles']}><LazyPage><UserManagementPage /></LazyPage></Protected>,
  },
  {
    name: 'Warnings',
    path: '/admin/warnings',
    element: <Protected><LazyPage><WarningsPage /></LazyPage></Protected>,
  },
  {
    name: 'Web Settings',
    path: '/admin/web-settings',
    element: <Protected roles={['super_admin', 'admin']} permission="manage_system_settings"><LazyPage><WebSettingsPage /></LazyPage></Protected>,
  },
  {
    name: 'Settings',
    path: '/settings',
    element: <Protected><LazyPage><SettingsPage /></LazyPage></Protected>,
  },
];
