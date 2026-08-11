import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { HudFrame } from '@/components/ui/hud-frame';
import {
  AlertTriangle, TrendingDown, XCircle, Users, Search,
  ChevronDown, ChevronRight, Download, Target,
} from 'lucide-react';
import { fmt$, fmtPct, retentionColor } from '@/lib/formatUtils';

// ── Types ──────────────────────────────────────────────────────────────────
export interface AgentCoachingFlag {
  writing_number: string;
  agent_name: string | null;
  agency_id: string;
  agency_name: string | null;
  total_policies: number;
  active_policies: number;
  terminated_policies: number;
  at_risk_count: number;
  active_premium: number | null;
  annual_premium: number | null;
  retained_90d: number;
  eligible_90d: number;
  retention_pct: number | null;
  at_risk_pct: number | null;
  terminated_pct: number | null;
  flag_retention: boolean;
  flag_at_risk: boolean;
  flag_terminated: boolean;
  needs_coaching: boolean;
  flag_count: number;
  threshold_retention: number;
  threshold_at_risk: number;
  threshold_terminated: number;
  threshold_min_policies: number;
}

type SortKey = 'agent' | 'agency' | 'retention' | 'atRisk' | 'terminated' | 'premium' | 'flags';

interface AgentCoachingTableProps {
  agents: AgentCoachingFlag[];
  loading: boolean;
  /** Optional agency filter — null = show all */
  filterAgencyId?: string | null;
  /** Show only flagged agents (default true) */
  flaggedOnly?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────
export function AgentCoachingTable({
  agents,
  loading,
  filterAgencyId = null,
  flaggedOnly = true,
}: AgentCoachingTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('flags');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Filter and sort
  const filtered = useMemo(() => {
    let list = agents;

    if (flaggedOnly) {
      list = list.filter(a => a.needs_coaching);
    }

    if (filterAgencyId) {
      list = list.filter(a => a.agency_id === filterAgencyId);
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        (a.agent_name ?? '').toLowerCase().includes(q) ||
        (a.agency_name ?? '').toLowerCase().includes(q) ||
        a.writing_number.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'agent': cmp = (a.agent_name ?? '').localeCompare(b.agent_name ?? ''); break;
        case 'agency': cmp = (a.agency_name ?? '').localeCompare(b.agency_name ?? ''); break;
        case 'retention': cmp = (a.retention_pct ?? -1) - (b.retention_pct ?? -1); break;
        case 'atRisk': cmp = (a.at_risk_pct ?? 0) - (b.at_risk_pct ?? 0); break;
        case 'terminated': cmp = (a.terminated_pct ?? 0) - (b.terminated_pct ?? 0); break;
        case 'premium': cmp = (a.annual_premium ?? 0) - (b.annual_premium ?? 0); break;
        case 'flags': cmp = a.flag_count - b.flag_count; break;
      }
      return cmp * sortDir;
    });

    return list;
  }, [agents, filterAgencyId, flaggedOnly, search, sortKey, sortDir]);

  // KPI summary
  const summary = useMemo(() => {
    const flagged = agents.filter(a => a.needs_coaching && (!filterAgencyId || a.agency_id === filterAgencyId));
    const totalFlagged = flagged.length;
    const premiumAtRisk = flagged.reduce((s, a) => s + (a.annual_premium ?? 0), 0);
    const avgRetention = flagged.length > 0
      ? flagged.reduce((s, a) => s + (a.retention_pct ?? 0), 0) / flagged.length
      : null;
    const uniqueAgencies = new Set(flagged.map(a => a.agency_id)).size;
    return { totalFlagged, premiumAtRisk, avgRetention, uniqueAgencies };
  }, [agents, filterAgencyId]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 1 ? -1 : 1);
    } else {
      setSortKey(key);
      setSortDir(key === 'retention' ? 1 : -1);
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return <span className="text-[10px] ml-0.5">{sortDir === 1 ? '↑' : '↓'}</span>;
  }

  function exportCsv() {
    const header = ['Agent', 'Writing #', 'Agency', 'Retention %', 'At-Risk %', 'Terminated %', 'Active Policies', 'Annual Premium', 'Flags'];
    const rows = filtered.map(a => [
      a.agent_name ?? '',
      a.writing_number,
      a.agency_name ?? a.agency_id,
      a.retention_pct !== null ? `${a.retention_pct}` : '',
      a.at_risk_pct !== null ? `${a.at_risk_pct}` : '',
      a.terminated_pct !== null ? `${a.terminated_pct}` : '',
      String(a.active_policies),
      String(a.annual_premium ?? 0),
      [
        a.flag_retention ? 'Retention' : '',
        a.flag_at_risk ? 'At-Risk' : '',
        a.flag_terminated ? 'Terminated' : '',
      ].filter(Boolean).join('; '),
    ]);
    const csv = [header.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agents-needing-coaching-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg shimmer" />)}
      </div>
    );
  }

  const thresholds = agents.length > 0 ? agents[0] : null;

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            title: 'Agents Flagged',
            end: summary.totalFlagged,
            fmt: (n: number) => n.toLocaleString(),
            sub: 'needing coaching intervention',
            icon: Users,
            color: summary.totalFlagged > 0 ? 'text-red-400' : 'text-muted-foreground',
            bg: summary.totalFlagged > 0 ? 'bg-red-500/10' : 'bg-secondary',
            accent: summary.totalFlagged > 0 ? 'hsl(0 84% 60%)' : 'hsl(215 20% 55%)',
          },
          {
            title: 'Agencies Affected',
            end: summary.uniqueAgencies,
            fmt: (n: number) => n.toLocaleString(),
            sub: 'with flagged agents',
            icon: AlertTriangle,
            color: summary.uniqueAgencies > 0 ? 'text-amber-400' : 'text-muted-foreground',
            bg: summary.uniqueAgencies > 0 ? 'bg-amber-500/10' : 'bg-secondary',
            accent: summary.uniqueAgencies > 0 ? 'hsl(38 92% 50%)' : 'hsl(215 20% 55%)',
          },
          {
            title: 'Premium Exposed',
            end: summary.premiumAtRisk,
            fmt: fmt$,
            sub: 'annual premium on flagged agents',
            icon: TrendingDown,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
            accent: 'hsl(38 92% 50%)',
          },
          {
            title: 'Avg Retention',
            end: summary.avgRetention ?? 0,
            fmt: (n: number) => summary.avgRetention === null ? '—' : `${n.toFixed(1)}%`,
            sub: 'across flagged agents',
            icon: Target,
            color: (summary.avgRetention ?? 100) < 90 ? 'text-red-400' : 'text-emerald-400',
            bg: (summary.avgRetention ?? 100) < 90 ? 'bg-red-500/10' : 'bg-emerald-500/10',
            accent: (summary.avgRetention ?? 100) < 90 ? 'hsl(0 84% 60%)' : 'hsl(142 71% 45%)',
          },
        ].map(card => (
          <StaggerItem key={card.title}>
            <HudFrame accentColor={card.accent}>
              <Card className="border-border h-full">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                      <CountUp
                        end={card.end}
                        format={card.fmt}
                        className="text-xl font-bold text-foreground mt-0.5 block font-data"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</p>
                    </div>
                    <div className={`p-2 rounded-lg ${card.bg}`}>
                      <card.icon size={16} className={card.color} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>
        ))}
      </StaggerContainer>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search agents or agencies…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-border rounded-lg text-sm bg-card focus:ring-2 focus:ring-ring"
            />
          </div>
          {thresholds && (
            <div className="hidden md:flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>Thresholds:</span>
              <Badge variant="outline" className="text-[10px] border-border px-1.5 py-0">
                Ret &lt; {thresholds.threshold_retention}%
              </Badge>
              <Badge variant="outline" className="text-[10px] border-border px-1.5 py-0">
                AR &gt; {thresholds.threshold_at_risk}%
              </Badge>
              <Badge variant="outline" className="text-[10px] border-border px-1.5 py-0">
                Term &gt; {thresholds.threshold_terminated}%
              </Badge>
              <Badge variant="outline" className="text-[10px] border-border px-1.5 py-0">
                Min {thresholds.threshold_min_policies} policies
              </Badge>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="h-8 text-xs border-border hover:border-primary/50 gap-1.5 shrink-0"
        >
          <Download size={13} />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
            <Target size={24} className="text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-foreground/70">
            {search ? 'No agents match your search' : 'No agents currently need coaching'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {search ? 'Try a different search term.' : 'All agents are within configured thresholds. 🎯'}
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/30 border-b border-border">
                  <th className="w-8 px-3 py-2.5" />
                  {([
                    ['agent', 'Agent'],
                    ['agency', 'Agency'],
                    ['retention', '90-Day Ret.'],
                    ['atRisk', 'At-Risk %'],
                    ['terminated', 'Term. %'],
                    ['premium', 'Annual AP'],
                    ['flags', 'Flags'],
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                    >
                      {label}
                      <SortIcon col={key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(agent => {
                  const isExpanded = expandedAgent === agent.writing_number;
                  return (
                    <AgentRow
                      key={agent.writing_number}
                      agent={agent}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedAgent(
                        isExpanded ? null : agent.writing_number
                      )}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-border bg-secondary/10 text-xs text-muted-foreground">
            {filtered.length} agent{filtered.length !== 1 ? 's' : ''} shown
          </div>
        </div>
      )}
    </div>
  );
}

// ── Row component ──────────────────────────────────────────────────────────
function AgentRow({
  agent,
  isExpanded,
  onToggle,
}: {
  agent: AgentCoachingFlag;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-border/30 hover:bg-secondary/20 cursor-pointer transition-colors"
      >
        <td className="px-3 py-2.5">
          {isExpanded
            ? <ChevronDown size={14} className="text-muted-foreground" />
            : <ChevronRight size={14} className="text-muted-foreground" />}
        </td>
        <td className="px-3 py-2.5">
          <div className="font-medium text-foreground truncate max-w-[180px]">
            {agent.agent_name ?? agent.writing_number}
          </div>
          <div className="text-[10px] text-muted-foreground font-data">{agent.writing_number}</div>
        </td>
        <td className="px-3 py-2.5 text-foreground/80 truncate max-w-[160px]">
          {agent.agency_name ?? agent.agency_id}
        </td>
        <td className="px-3 py-2.5">
          <span className={`font-data font-medium ${retentionColor(agent.retention_pct)}`}>
            {fmtPct(agent.retention_pct)}
          </span>
          {agent.flag_retention && (
            <AlertTriangle size={11} className="inline ml-1 text-red-400" />
          )}
        </td>
        <td className="px-3 py-2.5">
          <span className={`font-data ${
            (agent.at_risk_pct ?? 0) > agent.threshold_at_risk ? 'text-red-400 font-medium' : 'text-foreground/80'
          }`}>
            {fmtPct(agent.at_risk_pct)}
          </span>
          {agent.flag_at_risk && (
            <AlertTriangle size={11} className="inline ml-1 text-amber-400" />
          )}
        </td>
        <td className="px-3 py-2.5">
          <span className={`font-data ${
            (agent.terminated_pct ?? 0) > agent.threshold_terminated ? 'text-red-400 font-medium' : 'text-foreground/80'
          }`}>
            {fmtPct(agent.terminated_pct)}
          </span>
          {agent.flag_terminated && (
            <XCircle size={11} className="inline ml-1 text-red-400" />
          )}
        </td>
        <td className="px-3 py-2.5 font-data text-foreground/80">
          {fmt$(agent.annual_premium ?? 0)}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1">
            {agent.flag_retention && (
              <Badge className="text-[9px] px-1.5 py-0 bg-red-500/10 text-red-400 border border-red-500/30">
                Ret
              </Badge>
            )}
            {agent.flag_at_risk && (
              <Badge className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-400 border border-amber-500/30">
                AR
              </Badge>
            )}
            {agent.flag_terminated && (
              <Badge className="text-[9px] px-1.5 py-0 bg-rose-500/10 text-rose-400 border border-rose-500/30">
                Term
              </Badge>
            )}
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-border/30 bg-secondary/10">
          <td />
          <td colSpan={7} className="px-3 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Active Policies:</span>{' '}
                <span className="text-foreground font-data font-medium">{agent.active_policies}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Terminated:</span>{' '}
                <span className="text-foreground font-data font-medium">{agent.terminated_policies}</span>
              </div>
              <div>
                <span className="text-muted-foreground">At-Risk Count:</span>{' '}
                <span className={`font-data font-medium ${agent.at_risk_count > 0 ? 'text-amber-400' : 'text-foreground'}`}>
                  {agent.at_risk_count}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Monthly Premium:</span>{' '}
                <span className="text-foreground font-data font-medium">{fmt$(agent.active_premium ?? 0)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">90-Day Eligible:</span>{' '}
                <span className="text-foreground font-data font-medium">{agent.eligible_90d}</span>
              </div>
              <div>
                <span className="text-muted-foreground">90-Day Retained:</span>{' '}
                <span className="text-foreground font-data font-medium">{agent.retained_90d}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total Book:</span>{' '}
                <span className="text-foreground font-data font-medium">{agent.total_policies}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Threshold (min policies):</span>{' '}
                <span className="text-foreground font-data font-medium">{agent.threshold_min_policies}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
