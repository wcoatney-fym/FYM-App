import { useAuth } from '@/contexts/AuthContext';
import { useViewAsStore } from '@/store/view-as-store';
import type { UserRole } from '@/contexts/AuthContext';

interface EffectiveAuth {
  // Real auth
  session: ReturnType<typeof useAuth>['session'];
  user: ReturnType<typeof useAuth>['user'];
  profile: ReturnType<typeof useAuth>['profile'];
  loading: boolean;
  signIn: ReturnType<typeof useAuth>['signIn'];
  signOut: ReturnType<typeof useAuth>['signOut'];

  // Effective values (may be overridden by View As)
  effectiveRole: UserRole | null;
  effectiveAgencyId: string | null;
  effectiveWritingNumber: string | null;
  isFymAdmin: boolean;
  isViewingAs: boolean;

  // Convenience booleans
  isOrgWide: boolean; // true if FYM admin NOT in View As mode
  isAgent: boolean; // true if effective role is 'agent'
}

export function useEffectiveAuth(): EffectiveAuth {
  const auth = useAuth();
  const viewAs = useViewAsStore();

  const isViewingAs = auth.isFymAdmin && viewAs.active;

  const effectiveRole = isViewingAs ? viewAs.role : auth.role;
  const effectiveAgencyId = isViewingAs ? viewAs.agencyId : auth.agencyId;
  const effectiveWritingNumber = auth.profile?.writing_number ?? null;
  const isOrgWide = auth.isFymAdmin && !viewAs.active;
  const isAgent = effectiveRole === 'agent';

  return {
    session: auth.session,
    user: auth.user,
    profile: auth.profile,
    loading: auth.loading,
    signIn: auth.signIn,
    signOut: auth.signOut,
    effectiveRole,
    effectiveAgencyId,
    effectiveWritingNumber,
    isFymAdmin: auth.isFymAdmin,
    isViewingAs,
    isOrgWide,
    isAgent,
  };
}
