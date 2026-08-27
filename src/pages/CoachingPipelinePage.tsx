/**
 * CoachingPipelinePage — Agent-focused coaching pipeline
 *
 * Manager/Admin view: Kanban board with agent coaching cards
 * Agent view: Their own coaching plan(s) with progress
 *
 * Route: /quality/coaching-pipeline
 */
import { useState, useCallback } from 'react';
import { Header } from '@/components/layout/Header';

import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { CoachingKanban } from '@/components/coaching/CoachingKanban';
import { CoachingPlanDrawer } from '@/components/coaching/CoachingPlanDrawer';
import { AgentCoachingPlanView } from '@/components/coaching/AgentCoachingPlanView';
import { Link } from 'react-router-dom';
import {
  Zap, HeartPulse,
} from 'lucide-react';

interface CoachingPipelinePageProps {
  /** When true, suppresses Header and sub-nav (for embedding in Contracting tab) */
  embedded?: boolean;
}

export function CoachingPipelinePage({ embedded = false }: CoachingPipelinePageProps) {
  const { effectiveAgencyId, isOrgWide, isAgent } = useEffectiveAuth();
  const { filterAgencyId } = useAgencyFilter();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleStageChanged = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedPlanId(null);
  }, []);

  // Determine agency scope
  const scopedAgencyId = isOrgWide
    ? filterAgencyId || undefined
    : effectiveAgencyId || undefined;

  return (
    <>
      {!embedded && <Header title="Coaching Pipeline" />}
      <div className={embedded ? 'space-y-6' : 'p-6 space-y-6'}>

        {/* ── Sub-navigation tabs (standalone mode only) ── */}
        {!embedded && !isAgent && (
          <div className="flex gap-1 border-b border-border -mt-2 mb-2">
            <Link
              to="/quality/coaching"
              className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <HeartPulse size={13} />
              Policy Pipeline
            </Link>
            <Link
              to="/quality/coaching-pipeline"
              className="px-4 py-2 text-sm font-medium border-b-2 border-primary text-foreground flex items-center gap-1.5"
            >
              <Zap size={13} />
              Agent Coaching
            </Link>
          </div>
        )}

        {/* Description */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={18} className="text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Agent Coaching Pipeline</h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {isAgent
              ? 'Your active coaching plans. Complete the assigned requirements within the deadline to resolve each flag.'
              : 'Track agents through the coaching pipeline. Drag cards between stages, build action plans, and monitor progress toward resolution.'}
          </p>
        </div>

        {/* ── Agent view: show their own plans ── */}
        {isAgent ? (
          <AgentCoachingPlanView />
        ) : (
          /* ── Manager/Admin view: Kanban board ── */
          <CoachingKanban
            agencyId={scopedAgencyId}
            onSelectPlan={setSelectedPlanId}
            refreshKey={refreshKey}
          />
        )}
      </div>

      {/* Detail drawer */}
      <CoachingPlanDrawer
        planId={selectedPlanId}
        onClose={handleCloseDrawer}
        onStageChanged={handleStageChanged}
      />
    </>
  );
}
