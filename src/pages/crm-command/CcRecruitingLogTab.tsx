/**
 * CcRecruitingLogTab — Recruiting Stage Transition Log Viewer
 *
 * Shows every stage transition event with date/time, filterable by date range.
 * KPI cards at top for quick verification of counts per stage.
 * Data comes from recruiting_stage_transitions table (populated by 3h cron).
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Users, UserCheck, Briefcase, FileText, ShieldCheck,
  TrendingUp, AlertTriangle, Clock, Search,
  RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchStageTransitions,
  fetchGhlLiveCounts,
  fetchRecruitingLeads,
  type StageTransitionRow,
} from '@/lib/recruiting/api';
import type { RecruitingDateFilter } from '@/lib/recruiting/types';

// ── Date period presets ───────────────────────────────────────────────────

type PeriodKey = 'all' | 'today' | 'this-week' | 'this-month' | 'last-month' | 'custom';

interface PeriodOption {
  key: PeriodKey;
  label: string;
  getRange: () => RecruitingDateFilter | undefined;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day;
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), diff));
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { key: 'all', label: 'All Time', getRange: () => undefined },
  {
    key: 'today', label: 'Today',
    getRange: () => {
      const s = startOfDay(new Date());
      const e = new Date(s.getTime() + 86400000);
      return { startDate: s.toISOString(), endDate: e.toISOString() };
    },
  },
  {
    key: 'this-week', label: 'This Week',
    getRange: () => {
      const s = startOfWeek(new Date());
      const e = new Date(s.getTime() + 7 * 86400000);
      return { startDate: s.toISOString(), endDate: e.toISOString() };
    },
  },
  {
    key: 'this-month', label: 'This Month',
    getRange: () => {
      const now = new Date();
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { startDate: s.toISOString(), endDate: e.toISOString() };
    },
  },
  {
    key: 'last-month', label: 'Last Month',
    getRange: () => {
      const now = new Date();
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: s.toISOString(), endDate: e.toISOString() };
    },
  },
];

// ── Stage metadata ────────────────────────────────────────────────────────

const STAGE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  lead:        { label: 'Lead',        icon: Users,         color: 'text-blue-400' },
  attendee:    { label: 'Attendee',    icon: UserCheck,     color: 'text-cyan-400' },
  hired:       { label: 'Hired',       icon: Briefcase,     color: 'text-green-400' },
  contracting: { label: 'Contracting', icon: FileText,      color: 'text-yellow-400' },
  rts:         { label: 'RTS',         icon: ShieldCheck,   color: 'text-purple-400' },
  producing:   { label: 'Producing',   icon: TrendingUp,    color: 'text-emerald-400' },
  lost:        { label: 'Lost',        icon: AlertTriangle, color: 'text-red-400' },
};

// ── Format helpers ────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
  });
}

// ── Component ─────────────────────────────────────────────────────────────

export function CcRecruitingLogTab() {
  const [transitions, setTransitions] = useState<StageTransitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sortAsc, setSortAsc] = useState(false);
  const [kpiCounts, setKpiCounts] = useState<Record<string, number>>({});
  const [kpiLoading, setKpiLoading] = useState(true);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());

  // Get date filter from selected period
  const dateFilter = useMemo(() => {
    const opt = PERIOD_OPTIONS.find((o) => o.key === selectedPeriod);
    return opt?.getRange();
  }, [selectedPeriod]);

  // Fetch contact name map (once — names don't change with date filter)
  useEffect(() => {
    let cancelled = false;
    fetchRecruitingLeads().then((leads) => {
      if (cancelled) return;
      const map = new Map<string, string>();
      // The RPC returns rows that have ghl_contact_id in the id field
      // Build lookup: for each lead, map its id (which is ghl_contact_id in RPC) to name
      for (const l of leads) {
        if (l.id && l.name) map.set(l.id, l.name);
      }
      setNameMap(map);
    });
    return () => { cancelled = true; };
  }, []);

  // Fetch transitions
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchStageTransitions(undefined, dateFilter, 2000).then((rows) => {
      if (!cancelled) {
        setTransitions(rows);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [dateFilter]);

  // Fetch KPI counts (from edge function — cumulative)
  useEffect(() => {
    let cancelled = false;
    setKpiLoading(true);

    fetchGhlLiveCounts(dateFilter ?? undefined).then((data) => {
      if (!cancelled && data) {
        setKpiCounts({
          leads: data.leads,
          attendees: data.attendees,
          hired: data.hired,
          contracting: data.contracting,
          rts: data.rts,
          producing: data.producing,
          lost: data.lost,
        });
        setKpiLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [dateFilter]);

  // Filtered + sorted transitions
  const filtered = useMemo(() => {
    let rows = [...transitions];

    // Stage filter
    if (stageFilter !== 'all') {
      rows = rows.filter((r) => r.stage === stageFilter);
    }

    // Search filter (name, contact ID, or metadata)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter((r) => {
        const name = nameMap.get(r.ghl_contact_id) ?? (r.metadata as Record<string, unknown>)?.name as string ?? '';
        return (
          name.toLowerCase().includes(q) ||
          r.ghl_contact_id.toLowerCase().includes(q) ||
          JSON.stringify(r.metadata).toLowerCase().includes(q) ||
          r.stage.toLowerCase().includes(q) ||
          (r.condition || '').toLowerCase().includes(q)
        );
      });
    }

    // Sort by occurred_at
    rows.sort((a, b) => {
      const diff = new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
      return sortAsc ? diff : -diff;
    });

    return rows;
  }, [transitions, stageFilter, searchQuery, sortAsc]);

  // Count transitions per stage (for the log, not cumulative KPIs)
  const transitionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of transitions) {
      counts[t.stage] = (counts[t.stage] || 0) + 1;
    }
    return counts;
  }, [transitions]);

  const handleRefresh = () => {
    setLoading(true);
    fetchStageTransitions(undefined, dateFilter, 2000).then((rows) => {
      setTransitions(rows);
      setLoading(false);
    });
    setKpiLoading(true);
    fetchGhlLiveCounts(dateFilter ?? undefined).then((data) => {
      if (data) {
        setKpiCounts({
          leads: data.leads, attendees: data.attendees, hired: data.hired,
          contracting: data.contracting, rts: data.rts,
          producing: data.producing, lost: data.lost,
        });
      }
      setKpiLoading(false);
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Recruiting Transition Log</h2>
          <p className="text-xs text-muted-foreground">
            Every stage change tracked with event, time, and day. Updated every 3 hours.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {Object.entries(STAGE_META).map(([key, meta]) => {
          const Icon = meta.icon;
          const count = kpiCounts[key === 'lead' ? 'leads' : key === 'attendee' ? 'attendees' : key] ?? 0;
          const logCount = transitionCounts[key] ?? 0;
          return (
            <button
              key={key}
              onClick={() => setStageFilter(stageFilter === key ? 'all' : key)}
              className={cn(
                'flex flex-col items-center gap-1 p-3 rounded-lg border transition-all',
                stageFilter === key
                  ? 'border-primary bg-primary/10'
                  : 'border-border/40 bg-card/50 hover:bg-card/80'
              )}
            >
              <Icon className={cn('w-4 h-4', meta.color)} />
              <span className="text-lg font-bold">{kpiLoading ? '—' : count}</span>
              <span className="text-[10px] text-muted-foreground">{meta.label}</span>
              <span className="text-[9px] text-muted-foreground/60">{logCount} events</span>
            </button>
          );
        })}
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Period selector */}
        <div className="flex items-center gap-1 bg-card/50 rounded-lg border border-border/40 p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSelectedPeriod(opt.key)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                selectedPeriod === opt.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, tag, stage..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-card/50 border border-border/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Sort toggle */}
        <button
          onClick={() => setSortAsc(!sortAsc)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border/40 bg-card/50 hover:bg-card/80 transition-colors"
        >
          <Clock className="w-3.5 h-3.5" />
          {sortAsc ? 'Oldest' : 'Newest'}
          {sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {/* Count */}
        <span className="text-xs text-muted-foreground">
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Transition log table */}
      <div className="border border-border/40 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-card/80 sticky top-0 z-10">
              <tr className="border-b border-border/40">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Time</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Day</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Stage</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">From</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Event</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />
                    Loading transitions...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground">
                    No transitions found for this period.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const meta = STAGE_META[t.stage] || { label: t.stage, icon: Clock, color: 'text-gray-400' };
                  const Icon = meta.icon;
                  const prevMeta = t.previous_stage ? STAGE_META[t.previous_stage] : null;
                  const details = t.metadata || {};
                  const detailStr = details.tag
                    ? `Tag: ${details.tag}`
                    : details.stage_name
                      ? `Pipeline: ${details.stage_name}`
                      : details.threshold_days
                        ? `${details.threshold_days}d threshold`
                        : '';

                  return (
                    <tr
                      key={t.id}
                      className="border-b border-border/20 hover:bg-card/40 transition-colors"
                    >
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(t.occurred_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatTime(t.occurred_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDay(t.occurred_at)}</td>
                      <td className="px-3 py-2">
                        <span className={cn('inline-flex items-center gap-1', meta.color)}>
                          <Icon className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {prevMeta ? (
                          <span className={prevMeta.color}>{prevMeta.label}</span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium',
                          t.condition === 'sync' ? 'bg-blue-500/10 text-blue-400' :
                          t.condition === 'auto_lost' ? 'bg-red-500/10 text-red-400' :
                          t.condition === 'backfill' ? 'bg-amber-500/10 text-amber-400' :
                          'bg-gray-500/10 text-gray-400'
                        )}>
                          {t.condition}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-foreground capitalize">
                        {nameMap.get(t.ghl_contact_id)
                          ?? (details as Record<string, unknown>).name as string
                          ?? t.ghl_contact_id.slice(0, 12) + '…'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">
                        {detailStr}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
