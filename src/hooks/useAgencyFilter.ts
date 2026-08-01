import { useState } from 'react';
import { useEffectiveAuth } from './useEffectiveAuth';

/**
 * Encapsulates the agency filter default logic:
 * - FYM admins → default to ALL agencies (null = org-wide view)
 * - Agency admins → locked to their own agency (no filter needed)
 * - Agents → locked to their own data (no filter needed)
 *
 * Filter values are writing_number strings (e.g. '202NEW00') that match
 * the agency_id returned by prod DB edge functions.
 *
 * Returns the filter state, setter, and whether the filter dropdown should show.
 */
export function useAgencyFilter() {
  const { isFymAdmin } = useEffectiveAuth();

  // FYM admins default to org-wide view (null = all agencies);
  // FYM is the organization, not an individual agency with a writing number.
  // Users can select a specific agency from the dropdown to filter.
  const [filterAgencyId, setFilterAgencyId] = useState<string | null>(null);

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
