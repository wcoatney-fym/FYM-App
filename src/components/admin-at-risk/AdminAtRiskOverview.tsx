/**
 * AdminAtRiskOverview — The admin oversight surface for the at-risk pipeline.
 *
 * Three sections:
 * 1. PipelineHealth — KPI strip + stage distribution bar
 * 2. ManagerScorecard — who's working the pipeline, expand to see their cases
 * 3. AgentFollowUpTracker — cases handed off to agents needing action
 * 4. ActivityFeed — recent stage changes, notes, resolutions
 *
 * Data source: manager_at_risk_board view in FYM App DB (rcbzag),
 * which joins policy_cache with atrisk_tasks.
 */
import { useState, useCallback, useEffect } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { PipelineHealth } from './PipelineHealth';
import { ManagerScorecard } from './ManagerScorecard';
import { AgentFollowUpTracker } from './AgentFollowUpTracker';
import { ActivityFeed } from './ActivityFeed';
import type { PipelinePolicy } from './types';

interface AdminAtRiskOverviewProps {
  filterAgencyId: string | null;
}

export function AdminAtRiskOverview({ filterAgencyId }: AdminAtRiskOverviewProps) {
  const { effectiveAgencyId, isOrgWide, isAgent, effectiveWritingNumber } = useEffectiveAuth();
  const [policies, setPolicies] = useState<PipelinePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!supabase) return;
    isRefresh ? setRefreshing(true) : setLoading(true);

    try {
      const PAGE_SIZE = 1000;
      const allRows: PipelinePolicy[] = [];
      let offset = 0;

      while (true) {
        let q = supabase
          .from('manager_at_risk_board')
          .select('*')
          .order('days_since_draft', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        // Scope by auth role
        if (isAgent && effectiveWritingNumber) {
          q = q.eq('writing_number', effectiveWritingNumber);
        } else if (!isOrgWide && effectiveAgencyId) {
          q = q.eq('agency_id', effectiveAgencyId);
        }

        const { data, error } = await q;
        if (error) { console.error('Admin at-risk fetch error:', error.message); break; }
        if (!data || data.length === 0) break;

        allRows.push(...(data as unknown as PipelinePolicy[]));
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      // Apply UI-level agency filter
      let filtered = allRows;
      if (filterAgencyId) {
        filtered = allRows.filter(p => p.agency_id === filterAgencyId);
      }

      filtered.sort((a, b) => b.days_since_draft - a.days_since_draft);
      setPolicies(filtered);
    } catch (err) {
      console.error('Admin at-risk fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [effectiveAgencyId, isOrgWide, isAgent, effectiveWritingNumber, filterAgencyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-8">
      {/* Refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">At-Risk Pipeline Overview</h2>
          <p className="text-xs text-muted-foreground">
            Admin view — pipeline health, manager performance, agent follow-up
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Refresh
        </button>
      </div>

      {/* 1. Pipeline Health — KPIs + stage distribution */}
      <PipelineHealth policies={policies} loading={loading} />

      {/* 2. Manager Scorecard */}
      <ManagerScorecard policies={policies} loading={loading} />

      {/* 3. Agent Follow-Up Tracker */}
      <AgentFollowUpTracker policies={policies} loading={loading} />

      {/* 4. Activity Feed */}
      <ActivityFeed policies={policies} loading={loading} />
    </div>
  );
}
