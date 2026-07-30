/**
 * At-Risk Policies Page
 *
 * 8-stage Kanban pipeline matching the Activity Tracker's Manager View.
 * Same pipeline for FYM admins, agency admins, and managers — scoped by role.
 *
 * Scoping:
 * - FYM admins: default to FYM data, can select another agency or All Agencies
 * - Agency admins: locked to their own agency
 * - Agents: see only their own at-risk policies (read-only coaching view)
 */
import { Header } from '@/components/layout/Header';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { DataFilters } from '@/components/filters/DataFilters';
import { AtRiskKanban } from '@/components/at-risk/AtRiskKanban';

export function AtRiskPage() {
  const { isAgent } = useEffectiveAuth();
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();

  return (
    <div>
      <Header title={isAgent ? 'Your At-Risk Policies' : 'At-Risk Pipeline'} />
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

        {/* Pipeline board */}
        <AtRiskKanban filterAgencyId={filterAgencyId} />

      </div>
    </div>
  );
}
