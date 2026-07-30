import { useState } from 'react';
import { useEffectiveAuth } from './useEffectiveAuth';
import { FYM_AGENCY_TRACKER_ID } from '@/lib/constants';

/**
 * Encapsulates the agency filter default logic:
 * - FYM admins → default to FYM's own agency data (tracker_id)
 * - Agency admins → locked to their own agency (no filter needed)
 * - Agents → locked to their own data (no filter needed)
 *
 * Returns the filter state, setter, and whether the filter dropdown should show.
 */
export function useAgencyFilter() {
  const { isFymAdmin } = useEffectiveAuth();

  // FYM admins default to FYM's own tracker_id; everyone else gets null
  // (their data is already scoped by effectiveAgencyId via RLS/query)
  const [filterAgencyId, setFilterAgencyId] = useState<string | null>(
    isFymAdmin ? FYM_AGENCY_TRACKER_ID : null
  );

  // Only FYM admins get the agency filter dropdown
  const showAgencyFilter = isFymAdmin;

  // "All Agencies" = filterAgencyId is null AND user is FYM admin
  const isAllAgencies = isFymAdmin && filterAgencyId === null;

  return {
    filterAgencyId,
    setFilterAgencyId,
    showAgencyFilter,
    isAllAgencies,
  };
}
