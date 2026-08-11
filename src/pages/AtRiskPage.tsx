/**
 * At-Risk Page — Role-based rendering
 *
 * - FYM admins + agency admins: Admin oversight view (Pipeline Health,
 *   Manager Scorecard, Agent Follow-Up Tracker, Activity Feed)
 * - Managers: NeedsAttentionList (Got it / Working / Done action cards)
 *   → managers also have the Workboard Kanban for pipeline execution
 * - Agents: their own filtered NeedsAttentionList
 */
import { Header } from '@/components/layout/Header';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { DataFilters } from '@/components/filters/DataFilters';
import { AdminAtRiskOverview } from '@/components/admin-at-risk/AdminAtRiskOverview';
import { NeedsAttentionList } from '@/components/needs-attention/NeedsAttentionList';

export function AtRiskPage() {
  const { isAgent, effectiveRole, isOrgWide } = useEffectiveAuth();
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();

  // Admins (FYM admin + agency admin) see the oversight view
  const isAdmin = effectiveRole === 'admin' || (isOrgWide && effectiveRole !== 'agent');

  return (
    <>
      <Header title={isAdmin ? 'At-Risk Overview' : 'Needs Attention'} />
      <div className="p-6 space-y-6 max-w-screen-xl mx-auto">

        {/* Agency filter — admins only */}
        {!isAgent && (
          <DataFilters
            showAgencyFilter={showAgencyFilter}
            showTimePeriod={false}
            selectedAgencyId={filterAgencyId}
            onAgencyChange={setFilterAgencyId}
          />
        )}

        {/* Admin oversight view */}
        {isAdmin ? (
          <AdminAtRiskOverview filterAgencyId={filterAgencyId} />
        ) : (
          /* Manager / Agent card list */
          <NeedsAttentionList filterAgencyId={filterAgencyId} />
        )}

      </div>
    </>
  );
}
