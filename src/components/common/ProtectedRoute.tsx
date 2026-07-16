import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { SystemRole } from '@/types/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: SystemRole[];
  requiredPermission?: string;
}

export default function ProtectedRoute({ children, requiredRoles, requiredPermission }: ProtectedRouteProps) {
  const { user, profile, loading, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check system_role if required
  if (requiredRoles && profile && !requiredRoles.includes(profile.system_role)) {
    // Role doesn't match — but check if user has the required permission instead
    if (requiredPermission && hasPermission(requiredPermission)) {
      // User has the permission, allow access
      return <>{children}</>;
    }
    return <Navigate to="/queue" replace />;
  }

  // Check permission if required (and no role check was needed or role check passed)
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/queue" replace />;
  }

  return <>{children}</>;
}
