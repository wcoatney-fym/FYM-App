/**
 * AgentFollowUpTracker — Admin view of cases in agent follow-up stages.
 *
 * Shows cases that have been handed off to agents (Agent Outreach, Code Red,
 * Pending Save) — "did the agent actually act after the manager flagged it?"
 *
 * Data: AdminAtRiskPolicy[] filtered to agent follow-up stages.
 */
import { useState, useMemo } from 'react';
import { UserCheck, Search, ArrowUpDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AdminAtRiskPolicy } from './types';
import { STAGE_LABELS, AGENT_FOLLOWUP_STAGES } from './types';

interface AgentFollowUpTrackerProps {
  policies: AdminAtRiskPolicy[];
  loading?: boolean;
}

type SortField = 'days_idle' | 'plan_premium' | 'client_name' | 'task_stage';
type SortDir = 'asc' | 'desc';

export function AgentFollowUpTracker({ policies, loading }: AgentFollowUpTrackerProps) {
  const [query, setQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('days_idle');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Filter to agent follow-up stages only
  const agentCases = useMemo(() => {
    return policies.filter(p =>
      p.task_stage && AGENT_FOLLOWUP_STAGES.includes(p.task_stage)
    );
  }, [policies]);

  // Search + sort
  const filtered = useMemo(() => {
    let result = agentCases;

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(p =>
        (p.client_name || '').toLowerCase().includes(q) ||
        p.policy_number.toLowerCase().includes(q) ||
        (p.agency_id || '').toLowerCase().includes(q) ||
        (p.agent_writing_number || '').toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'days_idle': cmp = a.days_idle - b.days_idle; break;
        case 'plan_premium': cmp = a.plan_premium - b.plan_premium; break;
        case 'client_name': cmp = (a.client_name || '').localeCompare(b.client_name || ''); break;
        case 'task_stage': cmp = (a.task_stage || '').localeCompare(b.task_stage || ''); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [agentCases, query, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl shimmer" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <UserCheck size={16} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Agent Follow-Up Tracker</h3>
            <p className="text-[11px] text-muted-foreground">
              {agentCases.length} cases awaiting agent action
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search..."
            className="pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-48"
          />
        </div>
      </div>

      {agentCases.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No cases currently in agent follow-up stages.
          </CardContent>
        </Card>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-7 gap-2 px-4 py-2.5 bg-muted/30 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border">
            <button
              onClick={() => toggleSort('client_name')}
              className="col-span-2 flex items-center gap-1 hover:text-foreground transition-colors text-left"
            >
              Client / Policy
              {sortField === 'client_name' && <ArrowUpDown size={10} />}
            </button>
            <div>Agency</div>
            <button
              onClick={() => toggleSort('task_stage')}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              Stage
              {sortField === 'task_stage' && <ArrowUpDown size={10} />}
            </button>
            <button
              onClick={() => toggleSort('days_idle')}
              className="flex items-center gap-1 hover:text-foreground transition-colors text-center"
            >
              Days Idle
              {sortField === 'days_idle' && <ArrowUpDown size={10} />}
            </button>
            <button
              onClick={() => toggleSort('plan_premium')}
              className="flex items-center gap-1 hover:text-foreground transition-colors text-right"
            >
              Premium
              {sortField === 'plan_premium' && <ArrowUpDown size={10} />}
            </button>
            <div>Agent</div>
          </div>

          {/* Data rows */}
          {filtered.map(p => (
            <div
              key={p.policy_number}
              className={cn(
                'grid grid-cols-7 gap-2 px-4 py-2.5 text-[11px] border-b border-border/30 hover:bg-muted/20 transition-colors',
                p.task_stage === 'code_red' && 'border-l-2 border-l-rose-500',
              )}
            >
              <div className="col-span-2 truncate">
                <span className="font-semibold text-foreground">{p.client_name || 'Unknown'}</span>
                <span className="text-muted-foreground ml-1.5 text-[10px]">{p.policy_number}</span>
              </div>
              <div className="text-muted-foreground truncate">{p.agency_id || '—'}</div>
              <div>
                <span className={cn(
                  'inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold',
                  p.task_stage === 'code_red' && 'bg-rose-500/20 text-rose-400',
                  p.task_stage === 'agent_outreach' && 'bg-amber-500/20 text-amber-400',
                  p.task_stage === 'agent_saved_pending' && 'bg-purple-500/20 text-purple-400',
                )}>
                  {STAGE_LABELS[p.task_stage || ''] || p.task_stage}
                </span>
              </div>
              <div className={cn(
                'text-center font-mono',
                p.days_idle >= 30 ? 'text-rose-400 font-bold' : p.days_idle >= 15 ? 'text-amber-400' : 'text-muted-foreground'
              )}>
                {p.days_idle}d
              </div>
              <div className="text-right text-muted-foreground font-mono">
                ${Math.round(p.plan_premium)}
              </div>
              <div className="text-muted-foreground truncate text-[10px]">
                {p.agent_writing_number || '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
