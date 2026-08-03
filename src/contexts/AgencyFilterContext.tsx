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
  // FYM admins default to org-wide view (null = all agencies).
  const [filterAgencyId, setFilterAgencyId] = useState<string | null>(null);

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
