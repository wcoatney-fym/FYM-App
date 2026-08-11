/**
 * AgentFollowUpTracker — Cases handed off to agents that need follow-up.
 *
 * Shows cases in "Agent | Outreach" stage — the manager flagged it and
 * handed it to the agent. Admins need to see: did the agent actually act?
 *
 * Columns: Client, Agent, Agency, Days Since Assigned, Premium at Risk, Stage, Manager Notes
 */
import { useMemo, useState } from 'react';
import { UserCheck, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { PipelinePolicy } from './types';

interface AgentFollowUpTrackerProps {
  policies: PipelinePolicy[];
  loading?: boolean;
}

type SortKey = 'days' | 'premium' | 'agent' | 'agency';
type SortDir = 'asc' | 'desc';

// Stages that indicate manager → agent handoff
const AGENT_STAGES = ['agent_outreach', 'code_red', 'agent_saved_pending'];

export function AgentFollowUpTracker({ policies, loading }: AgentFollowUpTrackerProps) {
  const [sortKey, setSortKey] = useState<SortKey>('days');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [query, setQuery] = useState('');

  // Filter to agent-stage cases only
  const agentCases = useMemo(() => {
    let filtered = policies.filter(p => {
      const stage = p.task_status || 'new';
      return AGENT_STAGES.includes(stage);
    });

    // Search
    if (query.trim()) {
      const q = query.toLowerCase();
      filtered = filtered.filter(p =>
        (p.client_name || '').toLowerCase().includes(q) ||
        (p.agent_name || '').toLowerCase().includes(q) ||
        (p.writing_number || '').toLowerCase().includes(q) ||
        (p.agency_name || '').toLowerCase().includes(q) ||
        p.policy_number.toLowerCase().includes(q)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'days':
          cmp = a.days_since_draft - b.days_since_draft;
          break;
        case 'premium':
          cmp = Number(a.plan_premium) - Number(b.plan_premium);
          break;
        case 'agent':
          cmp = (a.agent_name || '').localeCompare(b.agent_name || '');
          break;
        case 'agency':
          cmp = (a.agency_name || '').localeCompare(b.agency_name || '');
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return filtered;
  }, [policies, query, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === 'desc'
      ? <ChevronDown size={12} className="inline text-primary" />
      : <ChevronUp size={12} className="inline text-primary" />;
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl shimmer" />)}
      </div>
    );
  }

  const totalCases = policies.filter(p => AGENT_STAGES.includes(p.task_status || 'new')).length;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-500/10">
            <UserCheck size={16} className="text-sky-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Agent Follow-Up Tracker</h3>
            <p className="text-[11px] text-muted-foreground">
              {totalCases} cases awaiting agent action
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            className="bg-card border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 w-44"
          />
        </div>
      </div>

      {agentCases.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            {totalCases === 0
              ? 'No cases currently in agent follow-up stages.'
              : 'No cases match your search.'}
          </CardContent>
        </Card>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_120px_120px_80px_90px_80px] gap-2 px-4 py-2.5 bg-muted/30 border-b border-border">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Client</span>
            <button onClick={() => toggleSort('agent')} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-left flex items-center gap-1 hover:text-foreground transition-colors">
              Agent <SortIcon col="agent" />
            </button>
            <button onClick={() => toggleSort('agency')} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-left flex items-center gap-1 hover:text-foreground transition-colors">
              Agency <SortIcon col="agency" />
            </button>
            <button onClick={() => toggleSort('days')} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center flex items-center justify-center gap-1 hover:text-foreground transition-colors">
              Days <SortIcon col="days" />
            </button>
            <button onClick={() => toggleSort('premium')} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-right flex items-center justify-end gap-1 hover:text-foreground transition-colors">
              Premium <SortIcon col="premium" />
            </button>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Stage</span>
          </div>

          {/* Rows */}
          {agentCases.map(p => {
            const daysLeft = Math.max(0, 45 - p.days_since_draft);
            const isCodeRed = p.days_since_draft >= 30;
            const stageLabel = p.task_status === 'agent_outreach' ? 'Agent' :
                               p.task_status === 'code_red' ? 'Code Red' :
                               p.task_status === 'agent_saved_pending' ? 'Pending' : p.task_status || 'New';
            const stageColor = p.task_status === 'code_red' ? 'bg-red-500/10 text-red-400' :
                               p.task_status === 'agent_saved_pending' ? 'bg-teal-500/10 text-teal-400' :
                               'bg-violet-500/10 text-violet-400';

            return (
              <div
                key={p.policy_number}
                className={cn(
                  'grid grid-cols-[1fr_120px_120px_80px_90px_80px] gap-2 px-4 py-2.5 border-b border-border/30 hover:bg-muted/10 transition-colors items-center',
                  isCodeRed && 'border-l-2 border-l-red-500',
                )}
              >
                {/* Client */}
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate block">
                    {p.client_name || 'Unknown'}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {p.product_type} · #{p.policy_number.slice(-6)}
                  </span>
                </div>

                {/* Agent */}
                <span className="text-[12px] text-foreground truncate">
                  {p.agent_name || p.writing_number || '—'}
                </span>

                {/* Agency */}
                <span className="text-[12px] text-muted-foreground truncate">
                  {p.agency_name || p.agency_id?.slice(0, 8) || '—'}
                </span>

                {/* Days remaining */}
                <span className={cn(
                  'text-sm font-mono font-bold text-center',
                  daysLeft <= 7 ? 'text-red-400' :
                  daysLeft <= 15 ? 'text-amber-400' : 'text-muted-foreground'
                )}>
                  {daysLeft}d
                </span>

                {/* Premium */}
                <span className="text-sm font-mono text-foreground text-right">
                  ${Math.round(Number(p.plan_premium) * 12).toLocaleString()}
                </span>

                {/* Stage badge */}
                <div className="text-center">
                  <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold', stageColor)}>
                    {stageLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
