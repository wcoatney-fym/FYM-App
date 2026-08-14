import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useViewAsStore } from '@/store/view-as-store';
import { supabase } from '@/lib/supabase';
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
  /**
   * The writing_number for the effective agency, resolved from the agencies
   * table. Use this (not effectiveAgencyId) when calling prod DB edge functions
   * that key agencies by writing_number (e.g. '202NEW00').
   * Null when org-wide or agency has no writing_number mapped.
   */
  effectiveAgencyWritingNumber: string | null;
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
  const effectiveWritingNumber = isViewingAs && viewAs.writingNumber
    ? viewAs.writingNumber
    : auth.profile?.writing_number ?? null;
  const isOrgWide = auth.isFymAdmin && !viewAs.active;
  const isAgent = effectiveRole === 'agent';

  // Resolve the effective agency UUID to its writing_number for edge function calls
  const [effectiveAgencyWritingNumber, setEffectiveAgencyWritingNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveAgencyId || isOrgWide || !supabase) {
      setEffectiveAgencyWritingNumber(null);
      return;
    }
    supabase
      .from('agencies')
      .select('writing_number')
      .eq('id', effectiveAgencyId)
      .maybeSingle()
      .then(({ data }) => {
        setEffectiveAgencyWritingNumber(data?.writing_number ?? null);
      });
  }, [effectiveAgencyId, isOrgWide]);

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
    effectiveAgencyWritingNumber,
    isFymAdmin: auth.isFymAdmin,
    isViewingAs,
    isOrgWide,
    isAgent,
  };
}
