/**
 * AdminAtRiskOverview — The admin oversight surface for the at-risk pipeline.
 *
 * Data flow (same pattern as NeedsAttentionList):
 * 1. Fetch all at-risk policies from retention-data edge function (prod DB)
 * 2. Fetch atrisk_tasks from FYM App Supabase (pipeline stage/assignment)
 * 3. Merge: every at-risk policy gets its task data (or null if not in pipeline)
 * 4. Pass merged data to all admin sections
 *
 * Two metric layers per Charlie's direction:
 * - "All At-Risk" = every policy from prod DB where at_risk_policy = true
 * - "In Pipeline" = subset that has an atrisk_tasks row (being actively worked)
 */
import { useState, useCallback, useEffect } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { fetchAtRiskPolicies } from '@/lib/prod-api';
import { PipelineHealth } from './PipelineHealth';
import { ManagerScorecard } from './ManagerScorecard';
import { AgentFollowUpTracker } from './AgentFollowUpTracker';
import { ActivityFeed } from './ActivityFeed';
import type { AdminAtRiskPolicy, TaskRecord } from './types';

interface AdminAtRiskOverviewProps {
  filterAgencyId: string | null;
}

export function AdminAtRiskOverview({ filterAgencyId }: AdminAtRiskOverviewProps) {
  const { effectiveAgencyWritingNumber, isOrgWide, isAgent, effectiveWritingNumber } = useEffectiveAuth();
  const [policies, setPolicies] = useState<AdminAtRiskPolicy[]>([]);
  const [merging, setMerging] = useState(false);

  // Resolve agency filter
  const resolvedAgencyId = (filterAgencyId && !filterAgencyId.startsWith('no-data:'))
    ? filterAgencyId
    : (!isOrgWide && effectiveAgencyWritingNumber ? effectiveAgencyWritingNumber : undefined);

  // Fetch at-risk policies from prod DB via edge function
  const cacheKey = `admin-at-risk-${resolvedAgencyId || 'org'}`;
  const { data: atRiskData, loading, refresh: refreshAtRisk } = useCachedFetch(
    cacheKey,
    () => fetchAtRiskPolicies(resolvedAgencyId ? { agency_id: resolvedAgencyId } : undefined),
    { deps: [resolvedAgencyId] }
  );

  // Merge edge function data with atrisk_tasks from local Supabase
  useEffect(() => {
    if (!atRiskData) return;
    const edgePolicies = atRiskData.data.policies;

    (async () => {
      setMerging(true);
      try {
        // Paginate atrisk_tasks to avoid silent 1K cap
        const taskMap = new Map<string, TaskRecord>();
        if (supabase) {
          const PAGE = 1000;
          let offset = 0;
          while (true) {
            const { data: tasks } = await supabase
              .from('atrisk_tasks')
              .select('policy_number, stage, status, assigned_to, assigned_by, agency_id, flag_type, due_date, created_at, priority, resolution, escalated_at')
              .range(offset, offset + PAGE - 1);
            if (tasks) {
              for (const t of tasks as unknown as TaskRecord[]) {
                taskMap.set(t.policy_number, t);
              }
            }
            if (!tasks || tasks.length < PAGE) break;
            offset += PAGE;
          }
        }

        // Merge
        let merged: AdminAtRiskPolicy[] = edgePolicies.map((p) => {
          const task = taskMap.get(p.policy_number);
          return {
            ...p,
            task_stage: task?.stage ?? null,
            task_status: task?.status ?? null,
            task_assigned_to: task?.assigned_to ?? null,
            task_created_at: task?.created_at ?? null,
            task_priority: task?.priority ?? null,
            task_resolution: task?.resolution ?? null,
            task_escalated_at: task?.escalated_at ?? null,
          };
        });

        // Agent-level filter
        if (isAgent && effectiveWritingNumber) {
          merged = merged.filter(p => p.agent_writing_number === effectiveWritingNumber);
        }

        // Sort by urgency (days_idle descending)
        merged.sort((a, b) => b.days_idle - a.days_idle);
        setPolicies(merged);
      } catch (err) {
        console.error('AdminAtRiskOverview: merge error:', err);
      } finally {
        setMerging(false);
      }
    })();
  }, [atRiskData, isAgent, effectiveWritingNumber]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAtRisk();
    setRefreshing(false);
  }, [refreshAtRisk]);

  const isLoading = loading || merging;

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
          onClick={handleRefresh}
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
      <PipelineHealth policies={policies} loading={isLoading} />

      {/* 2. Manager Scorecard */}
      <ManagerScorecard policies={policies} loading={isLoading} />

      {/* 3. Agent Follow-Up Tracker */}
      <AgentFollowUpTracker policies={policies} loading={isLoading} />

      {/* 4. Activity Feed */}
      <ActivityFeed policies={policies} loading={isLoading} />
    </div>
  );
}
