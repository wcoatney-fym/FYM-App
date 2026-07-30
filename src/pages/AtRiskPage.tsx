/**
 * At-Risk Policies Page (Quality → At-Risk tab)
 *
 * Read-only insight view for admins to monitor how managers are working
 * the at-risk book. Shows bucket counts per pipeline stage with drill-down
 * into individual client cards.
 *
 * NOT a pipeline — no drag-and-drop, no stage transitions.
 * The interactive pipeline lives on ManagerWorkboardPage (Workboard nav item).
 *
 * Scoping:
 * - FYM admins: default to FYM data, can select another agency or All Agencies
 * - Agency admins: locked to their own agency
 * - Agents: see only their own at-risk policies
 */
import { Header } from '@/components/layout/Header';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { DataFilters } from '@/components/filters/DataFilters';
import { AtRiskInsight } from '@/components/at-risk/AtRiskInsight';

export function AtRiskPage() {
  const { isAgent } = useEffectiveAuth();
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();

  return (
    <div>
      <Header title={isAgent ? 'Your At-Risk Policies' : 'At-Risk Overview'} />
      <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">

        {/* Filters — agency filter for FYM admins only */}
        {!isAgent && (
          <DataFilters
            showAgencyFilter={showAgencyFilter}
            showTimePeriod={false}
            selectedAgencyId={filterAgencyId}
            onAgencyChange={setFilterAgencyId}
          />
        )}

        {/* Read-only insight view — bucket counts with drill-down */}
        <AtRiskInsight filterAgencyId={filterAgencyId} />

      </div>
    </div>
  );
}
