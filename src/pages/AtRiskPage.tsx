/**
 * Needs Attention Page (formerly At-Risk)
 *
 * Urgency-ranked at-risk policy list with tri-state action buttons
 * (Got it / Working / Done). Replaces the old bucket-view insight panel.
 *
 * Scoping:
 * - FYM admins: default to FYM-wide, can filter by agency
 * - Agency admins/managers: locked to their agency
 * - Agents: see only their own at-risk policies
 */
import { Header } from '@/components/layout/Header';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { DataFilters } from '@/components/filters/DataFilters';
import { NeedsAttentionList } from '@/components/needs-attention/NeedsAttentionList';

export function AtRiskPage() {
  const { isAgent } = useEffectiveAuth();
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();

  return (
    <>
      <Header title="Needs Attention" />
      <div className="p-6 space-y-6 max-w-screen-xl mx-auto">

        {/* Filters — agency filter for FYM admins only */}
        {!isAgent && (
          <DataFilters
            showAgencyFilter={showAgencyFilter}
            showTimePeriod={false}
            selectedAgencyId={filterAgencyId}
            onAgencyChange={setFilterAgencyId}
          />
        )}

        {/* Urgency-ranked attention list with action buttons */}
        <NeedsAttentionList filterAgencyId={filterAgencyId} />

      </div>
    </>
  );
}
