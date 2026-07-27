import { Navigate } from 'react-router-dom';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import type { UserRole } from '@/contexts/AuthContext';

interface RoleGuardProps {
  /** Roles allowed to access the wrapped route */
  allow: UserRole[];
  /** Also allow FYM admins regardless of allow list */
  allowFymAdmin?: boolean;
  /** Where to redirect if access denied. Default: '/' for admin/manager, '/my-health' for agent */
  redirectTo?: string;
  children: React.ReactNode;
}

export function RoleGuard({ allow, allowFymAdmin = true, redirectTo, children }: RoleGuardProps) {
  const { effectiveRole, isFymAdmin, isViewingAs } = useEffectiveAuth();

  // FYM admins always pass (unless viewing as another role)
  if (isFymAdmin && !isViewingAs && allowFymAdmin) {
    return <>{children}</>;
  }

  if (effectiveRole && allow.includes(effectiveRole)) {
    return <>{children}</>;
  }

  const fallback = redirectTo ?? (effectiveRole === 'agent' ? '/my-health' : '/');
  return <Navigate to={fallback} replace />;
}
