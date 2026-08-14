/**
 * NeedsAttentionList — Urgency-ranked at-risk policy list with tri-state action buttons.
 *
 * Replaces the old AtRiskInsight bucket view. Fetches at-risk policies from the
 * retention-data edge function and joins with atrisk_tasks in the FYM App DB
 * for action state.
 *
 * Features:
 * - Urgency-ranked (Final 7d → Future Term → Pended → Suspended → At Risk)
 * - Tri-state action buttons (Got it / Working / Done)
 * - Filter chips by flag type and action state
 * - Save Rate badge in header (from OrgDataCache)
 * - Respects agency filter and role-based scoping
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Bell, Award, RefreshCw, Loader2, Search, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchAtRiskPolicies } from '@/lib/prod-api';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { fetchNotesForPolicies, type ManagerNote } from '@/lib/notes-api';
import { fmt$ } from '@/lib/formatUtils';
import { toast } from 'sonner';
import { AttentionCard, type AttentionPolicy, type ActionState } from './AttentionCard';
import { AttentionFilters, type FlagFilter, type ActionFilter } from './AttentionFilters';
import { pushStageToGhl } from '@/lib/ghl-push';

// ── Types ──────────────────────────────────────────────────────────────────

interface TaskRecord {
  policy_number: string;
  stage: string;
}

// Map atrisk_tasks stages to our tri-state
function stageToAction(stage: string | null): ActionState {
  if (!stage) return 'none';
  switch (stage) {
    case 'responded':
    case 'manager_outreach':
      return 'got_it';
    case 'agent_outreach':
    case 'code_red':
    case 'agent_saved_pending':
      return 'working';
    case 'saved':
      return 'done';
    case 'lost':
      return 'done'; // lost is also a terminal state
    default:
      return 'none';
  }
}

// Map our tri-state back to atrisk_tasks stage
function actionToStage(action: ActionState): string {
  switch (action) {
    case 'got_it': return 'responded';
    case 'working': return 'agent_outreach';
    case 'done': return 'saved';
    default: return 'new';
  }
}

// Urgency sort: higher days_idle = more urgent, then by premium descending
function urgencySort(a: AttentionPolicy, b: AttentionPolicy): number {
  // Final 7 days first (days_idle >= 38)
  const aFinal = a.days_idle >= 38 ? 1 : 0;
  const bFinal = b.days_idle >= 38 ? 1 : 0;
  if (aFinal !== bFinal) return bFinal - aFinal;

  // Then by days idle descending
  if (a.days_idle !== b.days_idle) return b.days_idle - a.days_idle;

  // Then by premium descending
  return b.plan_premium - a.plan_premium;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

// ── Props ──────────────────────────────────────────────────────────────────

interface NeedsAttentionListProps {
  filterAgencyId: string | null;
}

// ── Component ──────────────────────────────────────────────────────────────

export function NeedsAttentionList({ filterAgencyId }: NeedsAttentionListProps) {
  const { effectiveAgencyWritingNumber, isOrgWide, isAgent, effectiveWritingNumber } = useEffectiveAuth();

  const [policies, setPolicies] = useState<AttentionPolicy[]>([]);
  const [notesMap, setNotesMap] = useState<Map<string, ManagerNote[]>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [flagFilter, setFlagFilter] = useState<FlagFilter>('all');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // ── Resolve agency param ─────────────────────────────────────────────
  const resolvedAgencyId = (filterAgencyId && !filterAgencyId.startsWith('no-data:'))
    ? filterAgencyId
    : (!isOrgWide && effectiveAgencyWritingNumber ? effectiveAgencyWritingNumber : undefined);

  // Cached at-risk fetch — instant render from localStorage
  const cacheKey = `needs-attention-${resolvedAgencyId || 'org'}`;
  const { data: atRiskCached, loading, refresh: refreshAtRisk } = useCachedFetch(
    cacheKey,
    () => fetchAtRiskPolicies(resolvedAgencyId ? { agency_id: resolvedAgencyId } : undefined),
    { deps: [resolvedAgencyId] }
  );

  // Merge at-risk data with action states from local Supabase
  useEffect(() => {
    if (!atRiskCached) return;
    const edgePolicies = atRiskCached.data.policies;

    (async () => {
      try {
      let taskMap = new Map<string, string>();
      if (supabase) {
        // Paginate atrisk_tasks to avoid silent 1K cap
        const PAGE = 1000;
        let offset = 0;
        while (true) {
          const { data: tasks } = await supabase
            .from('atrisk_tasks')
            .select('policy_number, stage')
            .range(offset, offset + PAGE - 1);
          if (tasks) {
            for (const t of tasks as TaskRecord[]) {
              taskMap.set(t.policy_number, t.stage);
            }
          }
          if (!tasks || tasks.length < PAGE) break;
          offset += PAGE;
        }
      }

      let merged: AttentionPolicy[] = edgePolicies.map((p) => ({
        policy_number: p.policy_number,
        client_name: p.client_name,
        product_type: p.product_type,
        plan_premium: p.plan_premium,
        flag_type: p.flag_type,
        days_idle: p.days_idle,
        status: p.status,
        paid_to_date: p.paid_to_date,
        policy_effective_date: p.policy_effective_date,
        draft_count: p.draft_count,
        agent_writing_number: p.agent_writing_number,
        agency_id: p.agency_id,
        action_state: stageToAction(taskMap.get(p.policy_number) ?? null),
      }));

      if (isAgent && effectiveWritingNumber) {
        merged = merged.filter((p) => p.agent_writing_number === effectiveWritingNumber);
      }

      merged.sort(urgencySort);
      setPolicies(merged);

      // Batch-fetch notes for visible policies (first PAGE_SIZE)
      const topPolicies = merged.slice(0, PAGE_SIZE).map((p) => p.policy_number);
      if (topPolicies.length > 0) {
        fetchNotesForPolicies(topPolicies).then(setNotesMap);
      }
      } catch (err) {
        console.error('NeedsAttentionList: merge error:', err);
      }
    })();
  }, [atRiskCached, isAgent, effectiveWritingNumber]);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
      await refreshAtRisk();
      setRefreshing(false);
    }
  }, [refreshAtRisk]);

  // ── Action handler ─────────────────────────────────────────────────────

  const handleActionChange = useCallback(async (policyNumber: string, state: ActionState) => {
    // Optimistic update
    setPolicies((prev) =>
      prev.map((p) =>
        p.policy_number === policyNumber ? { ...p, action_state: state } : p
      )
    );

    if (!supabase) return;

    try {
      if (state === 'none') {
        // Remove the task record
        await supabase
          .from('atrisk_tasks')
          .delete()
          .eq('policy_number', policyNumber);
      } else {
        const stage = actionToStage(state);
        const policy = policies.find((p) => p.policy_number === policyNumber);

        // Guard: don't upsert if we can't resolve the policy's agency_id
        if (!policy?.agency_id) {
          console.warn('NeedsAttentionList: skipping upsert — no agency_id for', policyNumber);
          return;
        }

        // Upsert: create or update the task
        // Map stage to valid AtRiskStatus enum: 'new' | 'assigned' | 'contacted' | 'saved' | 'lost'
        const statusMap: Record<string, 'new' | 'assigned' | 'contacted' | 'saved' | 'lost'> = {
          new: 'new',
          responded: 'contacted',
          agent_outreach: 'assigned',
          saved: 'saved',
        };
        const mappedStatus = statusMap[stage] || 'assigned';

        // Cast to bypass generated types missing stage_changed_at column
        // The DB has a DEFAULT now() on stage_changed_at so omitting is fine
        await (supabase
          .from('atrisk_tasks') as any)
          .upsert(
            {
              policy_number: policyNumber,
              agency_id: policy.agency_id,
              stage,
              status: mappedStatus,
              flag_type: policy.flag_type || null,
              due_date: null,
              assigned_by: null,
              assigned_to: null,
            },
            { onConflict: 'policy_number' }
          );

        // Fire-and-forget GHL push
        pushStageToGhl({
          policy_number: policyNumber,
          agency_id: policy.agency_id,
          new_stage: stage,
          client_name: policy.client_name,
          plan_premium: policy.plan_premium,
          ghl_contact_id: null,
          ghl_opportunity_id: null,
          task_id: null,
          source: 'app',
        });
      }
    } catch (err) {
      console.error('Failed to update action state:', err);
      // Revert on error
      fetchData(true);
    }
  }, [policies, fetchData]);

  // ── Filter & search ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = policies;

    // Flag filter
    if (flagFilter !== 'all') {
      result = result.filter((p) => {
        const ft = (p.flag_type || 'at_risk').toLowerCase();
        return ft === flagFilter;
      });
    }

    // Action filter
    if (actionFilter !== 'all') {
      if (actionFilter === 'unworked') {
        result = result.filter((p) => p.action_state === 'none');
      } else {
        result = result.filter((p) => p.action_state === actionFilter);
      }
    }

    // Search
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((p) =>
        (p.client_name?.toLowerCase().includes(q)) ||
        p.policy_number.toLowerCase().includes(q) ||
        (p.agent_writing_number?.toLowerCase().includes(q)) ||
        p.product_type.toLowerCase().includes(q)
      );
    }

    return result;
  }, [policies, flagFilter, actionFilter, query]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [flagFilter, actionFilter, query]);

  const visiblePolicies = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  const hasMore = visibleCount < filtered.length;

  // ── Counts ─────────────────────────────────────────────────────────────

  const flagCounts = useMemo(() => {
    const counts: Record<FlagFilter, number> = {
      all: policies.length,
      future_term: 0,
      pended: 0,
      suspended: 0,
      at_risk: 0,
    };
    for (const p of policies) {
      const ft = (p.flag_type || 'at_risk').toLowerCase() as FlagFilter;
      if (ft in counts) counts[ft]++;
    }
    return counts;
  }, [policies]);

  const actionCounts = useMemo(() => {
    const counts: Record<ActionFilter, number> = {
      all: policies.length,
      unworked: 0,
      got_it: 0,
      working: 0,
      done: 0,
    };
    for (const p of policies) {
      if (p.action_state === 'none') counts.unworked++;
      else if (p.action_state === 'got_it') counts.got_it++;
      else if (p.action_state === 'working') counts.working++;
      else if (p.action_state === 'done') counts.done++;
    }
    return counts;
  }, [policies]);

  const showAgent = !isAgent;

  // ── Total premium at risk ────────────────────────────────────────────
  const totalAnnualPremiumAtRisk = useMemo(
    () => policies.reduce((sum, p) => sum + (p.plan_premium * 12), 0),
    [policies]
  );

  // ── CSV export ───────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);

  const exportCsv = useCallback(() => {
    if (filtered.length === 0) return;
    setExporting(true);
    try {
      const headers = [
        'Policy #', 'Client', 'Product', 'Status', 'Flag', 'Day',
        'Monthly Premium', 'Annual Premium', 'Effective Date', 'Paid To',
        'Drafts', 'Agent WN', 'Agency', 'Action',
      ];
      const rows = filtered.map((p) => [
        p.policy_number,
        p.client_name || '',
        p.product_type,
        p.status,
        p.flag_type || 'at_risk',
        `${p.days_idle}/45`,
        p.plan_premium.toFixed(2),
        (p.plan_premium * 12).toFixed(2),
        p.policy_effective_date || '',
        p.paid_to_date || '',
        p.draft_count || '',
        p.agent_writing_number || '',
        p.agency_id || '',
        p.action_state === 'none' ? 'Unworked' : p.action_state === 'got_it' ? 'Got it' : p.action_state === 'working' ? 'Working' : 'Done',
      ]);
      const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `needs_attention_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${filtered.length.toLocaleString()} policies`);
    } catch (err) {
      console.error('CSV export error:', err);
      toast.error('CSV export failed', {
        description: err instanceof Error ? err.message : 'Try again in a moment.',
      });
    } finally {
      setExporting(false);
    }
  }, [filtered]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10">
            <Bell size={18} className="text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Needs Attention</h2>
            <p className="text-xs text-muted-foreground">
              {policies.length} flagged · {fmt$(totalAnnualPremiumAtRisk)} at risk · urgency-ranked
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search client, policy, agent…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 w-[220px]"
            />
          </div>

          {/* CSV Export */}
          <button
            onClick={exportCsv}
            disabled={exporting || filtered.length === 0}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
            title="Export to CSV"
          >
            {exporting ? (
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
            ) : (
              <Download size={14} className="text-muted-foreground" />
            )}
          </button>

          {/* Refresh */}
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            {refreshing ? (
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
            ) : (
              <RefreshCw size={14} className="text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Filters */}
      <AttentionFilters
        flagFilter={flagFilter}
        actionFilter={actionFilter}
        onFlagChange={setFlagFilter}
        onActionChange={setActionFilter}
        flagCounts={flagCounts}
        actionCounts={actionCounts}
      />

      {/* Policy list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 rounded-xl shimmer" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Award size={32} className="mx-auto text-emerald-400/50 mb-3" />
          <p className="text-sm font-semibold text-foreground">All clear</p>
          <p className="text-xs text-muted-foreground mt-1">
            {policies.length === 0
              ? 'No at-risk policies found'
              : 'No policies match the current filters'}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {visiblePolicies.map((policy) => (
            <AttentionCard
              key={policy.policy_number}
              policy={policy}
              showAgent={showAgent}
              onActionChange={handleActionChange}
              notes={notesMap.get(policy.policy_number)}
            />
          ))}

          {/* Load more */}
          {hasMore && (
            <button
              onClick={() => {
                const nextCount = visibleCount + PAGE_SIZE;
                setVisibleCount(nextCount);
                // Batch-fetch notes for the next page of policies
                const nextPage = filtered.slice(visibleCount, nextCount).map((p) => p.policy_number);
                if (nextPage.length > 0) {
                  fetchNotesForPolicies(nextPage).then((newNotes) => {
                    setNotesMap((prev) => {
                      const merged = new Map(prev);
                      for (const [k, v] of newNotes) merged.set(k, v);
                      return merged;
                    });
                  });
                }
              }}
              className="w-full py-3 text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-xl hover:bg-muted transition-colors"
            >
              Show more ({filtered.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
