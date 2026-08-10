import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { supabase } from '@/lib/supabase';
import { FYM_AGENCY_WRITING_NUMBER } from '@/lib/constants';

interface AgencyFilterContextValue {
  /** Selected agency writing_number, or null for "All Agencies" */
  filterAgencyId: string | null;
  setFilterAgencyId: (id: string | null) => void;
  /** Whether the agency filter dropdown should be shown (FYM admins only) */
  showAgencyFilter: boolean;
  /** True when viewing all agencies (FYM admin + no specific agency selected) */
  isAllAgencies: boolean;
}

const AgencyFilterContext = createContext<AgencyFilterContextValue | null>(null);

export function AgencyFilterProvider({ children }: { children: ReactNode }) {
  const { isFymAdmin } = useEffectiveAuth();

  // Single source of truth for the selected agency across all pages.
  // FYM admins default to org-wide view (null = all agencies).
  // Note: FYM (202JVV00) is the MGA parent — it has no production data
  // under its own ga. All production rolls up under sub-agency WNs.
  const [filterAgencyId, setFilterAgencyId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // On mount, default FYM admins to the FYM agency filter.
  // Look up FYM's writing_number from the agencies table to confirm it exists.
  useEffect(() => {
    if (!isFymAdmin || initialized) return;
    if (!supabase) { setInitialized(true); return; }

    supabase
      .from('agencies')
      .select('writing_number')
      .eq('writing_number', FYM_AGENCY_WRITING_NUMBER)
      .single()
      .then(({ data }) => {
        if (data?.writing_number) {
          setFilterAgencyId(data.writing_number);
        }
        setInitialized(true);
      });
  }, [isFymAdmin, initialized]);

  const showAgencyFilter = isFymAdmin;
  const isAllAgencies = isFymAdmin && filterAgencyId === null;

  return (
    <AgencyFilterContext.Provider
      value={{ filterAgencyId, setFilterAgencyId, showAgencyFilter, isAllAgencies }}
    >
      {children}
    </AgencyFilterContext.Provider>
  );
}

export function useAgencyFilterContext() {
  const ctx = useContext(AgencyFilterContext);
  if (!ctx) {
    throw new Error('useAgencyFilterContext must be used within <AgencyFilterProvider>');
  }
  return ctx;
}
