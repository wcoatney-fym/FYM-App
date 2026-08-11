/**
 * ManagerScorecard — Admin oversight: how are managers working the at-risk pipeline?
 *
 * Shows each manager's assigned cases, activity, save rate, and open Code Reds.
 * Click a manager row to expand and see their assigned at-risk cases with current stage.
 */
import { useState, useMemo } from 'react';
import {
  Users, ChevronDown, ChevronRight, ShieldAlert,
  Clock, CheckCircle2, AlertTriangle, Activity,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { PipelinePolicy } from './types';

interface ManagerScoreCardProps {
  policies: PipelinePolicy[];
  loading?: boolean;
}

interface ManagerRow {
  assignedTo: string;
  totalCases: number;
  codeRedCount: number;
  savedCount: number;
  lostCount: number;
  activeCount: number; // responded + manager_outreach + agent_outreach
  premiumAtRisk: number;
  saveRate: number;
  cases: PipelinePolicy[];
  lastActivity: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  responded: 'Responded',
  manager_outreach: 'Manager',
  agent_outreach: 'Agent',
  code_red: 'Code Red',
  agent_saved_pending: 'Pending',
  saved: 'Saved',
  lost: 'Lost',
};

function stageBadge(stage: string | null) {
  const s = stage || 'new';
  const label = STAGE_LABELS[s] || s;
  const colors: Record<string, string> = {
    new: 'bg-slate-500/10 text-slate-400',
    responded: 'bg-sky-500/10 text-sky-400',
    manager_outreach: 'bg-amber-500/10 text-amber-400',
    agent_outreach: 'bg-violet-500/10 text-violet-400',
    code_red: 'bg-red-500/10 text-red-400',
    agent_saved_pending: 'bg-teal-500/10 text-teal-400',
    saved: 'bg-emerald-500/10 text-emerald-400',
    lost: 'bg-rose-500/10 text-rose-400',
  };
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold', colors[s] || colors.new)}>
      {label}
    </span>
  );
}

export function ManagerScorecard({ policies, loading }: ManagerScoreCardProps) {
  const [expandedManager, setExpandedManager] = useState<string | null>(null);

  const managers = useMemo(() => {
    const map = new Map<string, PipelinePolicy[]>();

    for (const p of policies) {
      // Group by assigned manager (task_assigned_to), or 'Unassigned'
      const key = p.task_assigned_to || 'Unassigned';
      const arr = map.get(key) || [];
      arr.push(p);
      map.set(key, arr);
    }

    const rows: ManagerRow[] = [];
    for (const [assignedTo, cases] of map) {
      const codeRedCount = cases.filter(c => c.days_since_draft >= 30).length;
      const savedCount = cases.filter(c => (c.task_status || 'new') === 'saved').length;
      const lostCount = cases.filter(c => (c.task_status || 'new') === 'lost').length;
      const activeCount = cases.filter(c => {
        const s = c.task_status || 'new';
        return ['responded', 'manager_outreach', 'agent_outreach', 'code_red', 'agent_saved_pending'].includes(s);
      }).length;
      const premiumAtRisk = cases.reduce((s, c) => s + (Number(c.plan_premium) || 0) * 12, 0);
      const resolved = savedCount + lostCount;
      const saveRate = resolved > 0 ? (savedCount / resolved) * 100 : 0;

      // Last activity = most recent task_created_at or updated_at
      const dates = cases
        .map(c => c.task_created_at)
        .filter(Boolean)
        .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime());
      const lastActivity = dates[0] || null;

      rows.push({
        assignedTo,
        totalCases: cases.length,
        codeRedCount,
        savedCount,
        lostCount,
        activeCount,
        premiumAtRisk,
        saveRate,
        cases: cases.sort((a, b) => b.days_since_draft - a.days_since_draft),
        lastActivity,
      });
    }

    // Sort: most cases first, but Unassigned always last
    rows.sort((a, b) => {
      if (a.assignedTo === 'Unassigned') return 1;
      if (b.assignedTo === 'Unassigned') return -1;
      return b.totalCases - a.totalCases;
    });

    return rows;
  }, [policies]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl shimmer" />)}
      </div>
    );
  }

  if (managers.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No at-risk cases in the pipeline.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-violet-500/10">
          <Users size={16} className="text-violet-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">Manager Scorecard</h3>
          <p className="text-[11px] text-muted-foreground">
            Who's working the pipeline — cases, activity, save rate
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_80px_80px_80px_80px_90px_80px] gap-2 px-4 py-2.5 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          <span>Manager</span>
          <span className="text-center">Cases</span>
          <span className="text-center">Active</span>
          <span className="text-center">Code Red</span>
          <span className="text-center">Save Rate</span>
          <span className="text-right">Premium</span>
          <span className="text-center">Last Active</span>
        </div>

        {/* Rows */}
        {managers.map(mgr => {
          const isExpanded = expandedManager === mgr.assignedTo;
          return (
            <div key={mgr.assignedTo}>
              <button
                onClick={() => setExpandedManager(isExpanded ? null : mgr.assignedTo)}
                className="w-full grid grid-cols-[1fr_80px_80px_80px_80px_90px_80px] gap-2 px-4 py-3 border-b border-border/50 hover:bg-muted/20 transition-colors text-left items-center"
              >
                {/* Manager name */}
                <div className="flex items-center gap-2 min-w-0">
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
                  )}
                  <span className={cn(
                    'text-sm font-semibold truncate',
                    mgr.assignedTo === 'Unassigned' ? 'text-muted-foreground italic' : 'text-foreground'
                  )}>
                    {mgr.assignedTo}
                  </span>
                </div>

                {/* Cases */}
                <span className="text-sm font-mono font-bold text-foreground text-center">
                  {mgr.totalCases}
                </span>

                {/* Active */}
                <div className="flex items-center justify-center gap-1">
                  <Activity size={12} className="text-amber-400" />
                  <span className="text-sm font-mono text-amber-400">{mgr.activeCount}</span>
                </div>

                {/* Code Red */}
                <div className="flex items-center justify-center gap-1">
                  {mgr.codeRedCount > 0 ? (
                    <>
                      <ShieldAlert size={12} className="text-red-400" />
                      <span className="text-sm font-mono font-bold text-red-400">{mgr.codeRedCount}</span>
                    </>
                  ) : (
                    <span className="text-sm font-mono text-muted-foreground">0</span>
                  )}
                </div>

                {/* Save Rate */}
                <div className="flex items-center justify-center gap-1">
                  {mgr.savedCount + mgr.lostCount > 0 ? (
                    <span className={cn(
                      'text-sm font-mono font-bold',
                      mgr.saveRate >= 70 ? 'text-emerald-400' : mgr.saveRate >= 40 ? 'text-amber-400' : 'text-red-400'
                    )}>
                      {mgr.saveRate.toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </div>

                {/* Premium at risk */}
                <span className="text-sm font-mono text-foreground text-right">
                  ${Math.round(mgr.premiumAtRisk).toLocaleString()}
                </span>

                {/* Last active */}
                <span className="text-[11px] text-muted-foreground text-center">
                  {mgr.lastActivity ? formatRelative(mgr.lastActivity) : '—'}
                </span>
              </button>

              {/* Expanded cases */}
              {isExpanded && (
                <div className="bg-muted/10 border-b border-border">
                  {mgr.cases.map(c => (
                    <div
                      key={c.policy_number}
                      className="grid grid-cols-[1fr_100px_80px_60px_80px] gap-2 px-8 py-2 border-b border-border/20 text-[12px] items-center last:border-b-0"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-foreground truncate block">
                          {c.client_name || 'Unknown'}
                        </span>
                        <span className="text-muted-foreground text-[11px]">
                          {c.product_type} · {c.agent_name || c.writing_number || 'No agent'}
                        </span>
                      </div>
                      <div>{stageBadge(c.task_status)}</div>
                      <span className={cn(
                        'font-mono font-bold text-center',
                        c.days_since_draft >= 38 ? 'text-red-400' :
                        c.days_since_draft >= 30 ? 'text-red-400/80' :
                        c.days_since_draft >= 14 ? 'text-amber-400' : 'text-muted-foreground'
                      )}>
                        {Math.max(0, 45 - c.days_since_draft)}d left
                      </span>
                      <span className="text-muted-foreground text-center">
                        {c.product_type === 'HHC' ? 'HHC' : 'HI'}
                      </span>
                      <span className="font-mono text-foreground text-right">
                        ${Math.round(Number(c.plan_premium) * 12).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;

  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });
}
