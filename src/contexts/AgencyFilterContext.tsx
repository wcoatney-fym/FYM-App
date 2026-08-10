import { createContext, useContext, useState, type ReactNode } from 'react';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';

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
  // FYM admins default to FYM agency view — Charlie requested this
  // so the Agent Directory doesn't show "All Agencies" by default.
  // FYM agency UUID: 338230f2-2058-407c-9507-5aa88d6d5e14 (writing_number: 202JVV00)
  const FYM_AGENCY_ID = '338230f2-2058-407c-9507-5aa88d6d5e14';
  const [filterAgencyId, setFilterAgencyId] = useState<string | null>(
    isFymAdmin ? FYM_AGENCY_ID : null
  );

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
