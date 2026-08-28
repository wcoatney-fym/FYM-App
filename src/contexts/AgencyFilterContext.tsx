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
  const { isFymAdmin, isOrgWide, isViewingAs, effectiveRole, effectiveAgencyWritingNumber } = useEffectiveAuth();
  const isManager = effectiveRole === 'manager';

  // Single source of truth for the selected agency across all pages.
  // FYM admins default to org-wide view (null = all agencies).
  // Managers are auto-locked to their agency — no dropdown.
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

  // Managers: auto-lock to their agency writing number.
  // This runs after effectiveAgencyWritingNumber resolves from the profile lookup.
  useEffect(() => {
    if (!isManager || !effectiveAgencyWritingNumber) return;
    setFilterAgencyId(effectiveAgencyWritingNumber);
  }, [isManager, effectiveAgencyWritingNumber]);

  // View As: lock to the effective agency's writing number.
  // Without this, filterAgencyId stays set to FYM's WN from initialization,
  // causing pages that use filterAgencyId for client-side filtering to show
  // FYM data even though edge functions return agency-scoped data.
  useEffect(() => {
    if (!isViewingAs) return;
    // When viewing as a downline agency, lock the filter to that agency.
    // effectiveAgencyWritingNumber resolves async — set it once available.
    if (effectiveAgencyWritingNumber) {
      setFilterAgencyId(effectiveAgencyWritingNumber);
    }
  }, [isViewingAs, effectiveAgencyWritingNumber]);

  // When View As deactivates, reset to FYM default
  useEffect(() => {
    if (isFymAdmin && !isViewingAs && initialized) {
      // Re-default to FYM agency when returning to org-wide view
      if (!supabase) return;
      supabase
        .from('agencies')
        .select('writing_number')
        .eq('writing_number', FYM_AGENCY_WRITING_NUMBER)
        .single()
        .then(({ data }) => {
          if (data?.writing_number) {
            setFilterAgencyId(data.writing_number);
          }
        });
    }
  }, [isFymAdmin, isViewingAs, initialized]);

  // Only show the agency filter when the user is truly org-wide
  // (FYM admin NOT in View As mode). Managers, agents, and admins
  // using View As all get locked to their effective agency.
  const showAgencyFilter = isOrgWide;
  const isAllAgencies = isOrgWide && filterAgencyId === null;

  // Anyone who isn't org-wide gets a locked setter.
  // This covers real managers, agents, AND admins using View As.
  const safeSetFilterAgencyId = isOrgWide
    ? setFilterAgencyId
    : () => {}; // locked — ignore all set attempts

  return (
    <AgencyFilterContext.Provider
      value={{ filterAgencyId, setFilterAgencyId: safeSetFilterAgencyId, showAgencyFilter, isAllAgencies }}
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
