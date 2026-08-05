/**
 * Agency Leaderboard — Enhanced
 *
 * Period toggles: All Time, This Year, This Month, This Week, Today
 * Metric toggle: Policies ↔ Annual Premium
 * Sortable columns, retention filter, drill-down to agency production.
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { fetchAgencyProduction, fetchAgentProduction } from '@/lib/prod-api';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { useOrgData } from '@/contexts/OrgDataCache';
import { DataFilters } from '@/components/filters/DataFilters';
import { ExecutiveSummary, type LeaderboardSortKey, type ExecSummaryData } from '@/components/leaderboard/ExecutiveSummary';
import { type KpiTileData } from '@/components/leaderboard/KpiSummaryTile';
import { RampUpBoard, type RampUpAgent } from '@/components/leaderboard/RampUpBoard';
import {
  Trophy, TrendingUp, ShieldCheck, AlertTriangle, ChevronRight,
  ChevronDown, ChevronUp, Calendar, DollarSign, FileText, Rocket,
  Search,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface AgencyLeaderRow {
  agency_id: string;
  name: string | null;
  active_policies: number;
  active_premium: number;
  at_risk_count: number;
  retained_90d: number;
  eligible_90d: number;
  retention_pct: number | null;
  rank: number;
  // Period-specific
  period_policies: number;
  period_ap: number;
}

type SortKey = 'rank' | 'retention' | 'policies' | 'premium' | 'at_risk' | 'period_policies' | 'period_ap'
  | 'ap' | 'apps' | 'save_rate' | 'taken_pct' | 'avg_ap' | 'agents';
type BoardTab = 'agencies' | 'ramp_up';
type Period = 'all' | 'year' | 'month' | 'week' | 'today';
type Metric = 'policies' | 'premium';

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function retentionColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}

function retentionBg(pct: number | null) {
  if (pct === null) return 'bg-secondary';
  if (pct >= 90) return 'bg-emerald-500/10';
  if (pct >= 85) return 'bg-amber-500/10';
  return 'bg-red-500/10';
}

function rankBadge(rank: number) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-sm font-bold text-muted-foreground tabular-nums">#{rank}</span>;
}

function periodLabel(p: Period) {
  switch (p) {
    case 'all': return 'All Time';
    case 'year': return 'This Year';
    case 'month': return 'This Month';
    case 'week': return 'This Week';
    case 'today': return 'Today';
  }
}

/** Get CT-local date parts via Intl (DST-safe, no toLocaleString hack). */
function ctToday(): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

function periodStart(p: Period): string | null {
  if (p === 'all') return null;
  const { year, month, day } = ctToday();

  switch (p) {
    case 'year':
      return `${year}-01-01`;
    case 'month':
      return `${year}-${pad2(month)}-01`;
    case 'week': {
      // Walk back to Monday
      const d = new Date(`${year}-${pad2(month)}-${pad2(day)}T12:00:00`);
      const dow = d.getDay(); // 0=Sun
      const diff = dow === 0 ? 6 : dow - 1;
      d.setDate(d.getDate() - diff);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
    case 'today':
      return `${year}-${pad2(month)}-${pad2(day)}`;
  }
}

// ── Component ──────────────────────────────────────────────────────────────
export function LeaderboardPage() {
  const navigate = useNavigate();
  const { effectiveAgencyWritingNumber, isOrgWide } = useEffectiveAuth();
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();
  const orgData = useOrgData();
  const [rows, setRows] = useState<AgencyLeaderRow[]>([]);
  const loading = orgData.initialLoading;
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState<'all' | 'above' | 'below'>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [metric, setMetric] = useState<Metric>('policies');
  const [boardTab, setBoardTab] = useState<BoardTab>('agencies');
  const [rampUpAgents, setRampUpAgents] = useState<RampUpAgent[]>([]);
  const [rampUpLoading, setRampUpLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Cache period data
  const [periodData, setPeriodData] = useState<Map<string, { policies: number; ap: number }>>(new Map());

  // Battle wins per agency (trophy count badge) — cached, wins don't change often
  const { data: agencyBattleWins } = useCachedFetch<Map<string, number>>(
    'leaderboard-battle-wins',
    async () => {
      if (!supabase) return new Map();
      const PAGE = 100;
      let offset = 0;
      const winMap = new Map<string, number>();
      let done = false;
      while (!done) {
        const { data: winData } = await (supabase as any)
          .from('battle_participants')
          .select('agency_id')
          .eq('is_winner', true)
          .not('agency_id', 'is', null)
          .range(offset, offset + PAGE - 1);
        if (!winData || winData.length === 0) { done = true; break; }
        for (const w of winData as any[]) {
          if (!w.agency_id) continue;
          winMap.set(w.agency_id, (winMap.get(w.agency_id) || 0) + 1);
        }
        if (winData.length < PAGE) done = true;
        else offset += PAGE;
      }
      return winMap;
    },
    { maxAge: 4 * 60 * 60 * 1000 }, // 4 hour cache — battles don't change often
  );

  const loadPeriodData = useCallback(async (p: Period) => {
    const start = periodStart(p);
    if (!start) {
      setPeriodData(new Map());
      return;
    }

    try {
      // Query prod DB edge function for period-filtered agency production
      // Use tomorrow in CT as exclusive end date (safe on month boundaries)
      const { year, month, day } = ctToday();
      const tomorrow = new Date(`${year}-${pad2(month)}-${pad2(day)}T12:00:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endDate = `${tomorrow.getFullYear()}-${pad2(tomorrow.getMonth() + 1)}-${pad2(tomorrow.getDate())}`;
      const agencies = await fetchAgencyProduction({ start_date: start, end_date: endDate });
      const agMap = new Map<string, { policies: number; ap: number }>();
      for (const a of agencies) {
        agMap.set(a.agency_id, {
          policies: a.active_policies + a.terminated_policies + a.pending_policies,
          ap: a.active_annual_premium,
        });
      }
      setPeriodData(agMap);
    } catch (err) {
      console.error('Period data load error:', err);
      setPeriodData(new Map());
    }
  }, []);


  // Derive rows from org cache + enrich with names
  useEffect(() => {
    const summaryData = orgData.retentionAgencies;
    if (!summaryData || summaryData.length === 0) return;

    // Agency names from rcbzag
    const nameMap = new Map<string, string>();
    if (supabase) {
      (supabase as any)
        .from('agencies')
        .select('tracker_id, writing_number, name')
        .then(({ data: agencyNames }: { data: any }) => {
          if (agencyNames) {
            for (const a of agencyNames as any[]) {
              if (a.writing_number) nameMap.set(a.writing_number, a.name);
              if (a.tracker_id) nameMap.set(a.tracker_id, a.name);
            }
          }

          const ranked = summaryData
            .map(r => ({
              agency_id: r.agency_id,
              name: nameMap.get(r.agency_id) ?? null,
              active_policies: r.active_policies,
              active_premium: r.active_premium,
              at_risk_count: r.at_risk_count,
              retained_90d: r.retained_90d,
              eligible_90d: r.eligible_90d,
              retention_pct: r.retention_pct,
              rank: 0,
              period_policies: 0,
              period_ap: 0,
            }))
            .sort((a, b) => {
              const retA = a.retention_pct ?? -1;
              const retB = b.retention_pct ?? -1;
              if (retB !== retA) return retB - retA;
              return b.active_premium - a.active_premium;
            });

          ranked.forEach((r, i) => { r.rank = i + 1; });
          setRows(ranked);
        });
    } else {
      const ranked = summaryData
        .map(r => ({
          agency_id: r.agency_id,
          name: null,
          active_policies: r.active_policies,
          active_premium: r.active_premium,
          at_risk_count: r.at_risk_count,
          retained_90d: r.retained_90d,
          eligible_90d: r.eligible_90d,
          retention_pct: r.retention_pct,
          rank: 0,
          period_policies: 0,
          period_ap: 0,
        }))
        .sort((a, b) => {
          const retA = a.retention_pct ?? -1;
          const retB = b.retention_pct ?? -1;
          if (retB !== retA) return retB - retA;
          return b.active_premium - a.active_premium;
        });
      ranked.forEach((r, i) => { r.rank = i + 1; });
      setRows(ranked);
    }

  }, [orgData.retentionAgencies]);

  // Load period data when period changes
  useEffect(() => {
    loadPeriodData(period);
  }, [period, loadPeriodData]);

  // Load ramp-up agents (first app within last 90 days)
  useEffect(() => {
    if (boardTab !== 'ramp_up') return;
    setRampUpLoading(true);

    const loadRampUp = async () => {
      try {
        const today = new Date();
        const ninetyDaysAgo = new Date(today);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const cutoff = `${ninetyDaysAgo.getFullYear()}-${String(ninetyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(ninetyDaysAgo.getDate()).padStart(2, '0')}`;

        // Server-side date filter — only fetch agents with activity in last 90 days
        const allAgents = await fetchAgentProduction({ start_date: cutoff });
        const rampAgents: RampUpAgent[] = [];

        for (const a of allAgents) {
          // Check if this is a ramp-up agent (first_issue_date within 90 days)
          const firstDate = (a as any).first_issue_date;
          if (!firstDate || firstDate < cutoff) continue;

          const daysActive = Math.floor(
            (today.getTime() - new Date(firstDate + 'T00:00:00').getTime()) / 86400000,
          );

          const totalApps = a.active_policies + a.terminated_policies + a.pending_policies;
          const totalAP = a.active_annual_premium;

          rampAgents.push({
            agent_id: a.agent_id,
            agent_name: a.agent_name ?? a.agent_id,
            agency_name: (a as any).parent_agency_name ?? null,
            first_app_date: firstDate,
            days_active: daysActive,
            total_apps: totalApps,
            total_ap: totalAP,
            avg_ap_per_app: totalApps > 0 ? totalAP / totalApps : 0,
            retention_pct: a.retention_pct ?? null,
            at_risk_count: a.at_risk_policies ?? 0,
          });
        }

        setRampUpAgents(rampAgents);
      } catch (err) {
        console.error('Ramp-up load error:', err);
        setRampUpAgents([]);
      } finally {
        setRampUpLoading(false);
      }
    };

    loadRampUp();
  }, [boardTab]);

  // Merge period data into rows
  const enrichedRows = useMemo(() => {
    if (period === 'all') return rows;
    return rows.map(r => ({
      ...r,
      period_policies: periodData.get(r.agency_id)?.policies || 0,
      period_ap: periodData.get(r.agency_id)?.ap || 0,
    }));
  }, [rows, period, periodData]);

  // Sort + filter (moved before stats so stats can derive from filtered data)
  const displayed = useMemo(() => {
    let filtered = [...enrichedRows];
    if (filterAgencyId) filtered = filtered.filter(r => r.agency_id === filterAgencyId);
    if (filter === 'above') filtered = filtered.filter(r => r.retention_pct !== null && r.retention_pct >= 90);
    if (filter === 'below') filtered = filtered.filter(r => r.retention_pct === null || r.retention_pct < 90);
    // Agency name search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(r =>
        (r.name?.toLowerCase().includes(q)) || r.agency_id.toLowerCase().includes(q),
      );
    }

    const dir = sortAsc ? 1 : -1;
    filtered.sort((a, b) => {
      switch (sortKey) {
        case 'rank': return dir * (a.rank - b.rank);
        case 'retention': return dir * ((a.retention_pct ?? -1) - (b.retention_pct ?? -1));
        case 'policies': return dir * (a.active_policies - b.active_policies);
        case 'premium': return dir * (a.active_premium - b.active_premium);
        case 'at_risk': return dir * (a.at_risk_count - b.at_risk_count);
        case 'period_policies': return dir * (a.period_policies - b.period_policies);
        case 'period_ap': return dir * (a.period_ap - b.period_ap);
        default: return 0;
      }
    });
    return filtered;
  }, [enrichedRows, sortKey, sortAsc, filter, filterAgencyId, searchQuery]);

  // Executive Summary data — compute KPI tiles from all rows
  const execSummary = useMemo<ExecSummaryData | null>(() => {
    if (enrichedRows.length === 0) return null;

    const total = enrichedRows.length;
    const totalAP = enrichedRows.reduce((s, r) => s + r.active_premium, 0);
    const totalPolicies = enrichedRows.reduce((s, r) => s + r.active_policies, 0);
    const avgRetention = enrichedRows.filter(r => r.retention_pct !== null).length > 0
      ? enrichedRows.filter(r => r.retention_pct !== null).reduce((s, r) => s + (r.retention_pct ?? 0), 0)
        / enrichedRows.filter(r => r.retention_pct !== null).length
      : null;
    const avgAP = totalPolicies > 0 ? totalAP / totalPolicies * 12 : 0; // annualized per policy
    const aboveTarget = enrichedRows.filter(r => r.retention_pct !== null && r.retention_pct >= 90).length;
    const totalAtRisk = enrichedRows.reduce((s, r) => s + r.at_risk_count, 0);

    // Viewer's agency rank (if not org-wide)
    const viewerRow = !isOrgWide && effectiveAgencyWritingNumber
      ? enrichedRows.find(r => r.agency_id === effectiveAgencyWritingNumber)
      : null;

    const entityName = viewerRow?.name ?? 'All Agencies';
    const initials = entityName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    const tiles: KpiTileData[] = [
      {
        key: 'ap',
        label: 'Total AP/mo',
        value: fmt$(totalAP),
        rank: viewerRow ? enrichedRows.sort((a, b) => b.active_premium - a.active_premium).indexOf(viewerRow) + 1 : undefined,
        rankOf: viewerRow ? total : undefined,
      },
      {
        key: 'apps',
        label: 'Active Policies',
        value: totalPolicies.toLocaleString(),
        rank: viewerRow ? enrichedRows.sort((a, b) => b.active_policies - a.active_policies).indexOf(viewerRow) + 1 : undefined,
        rankOf: viewerRow ? total : undefined,
      },
      {
        key: 'save_rate',
        label: 'Avg Retention',
        value: avgRetention !== null ? `${avgRetention.toFixed(1)}%` : '—',
        rank: viewerRow?.retention_pct != null
          ? enrichedRows.filter(r => r.retention_pct !== null).sort((a, b) => (b.retention_pct ?? 0) - (a.retention_pct ?? 0)).indexOf(viewerRow) + 1
          : undefined,
        rankOf: viewerRow?.retention_pct != null ? enrichedRows.filter(r => r.retention_pct !== null).length : undefined,
      },
      {
        key: 'taken_pct',
        label: '≥90% Target',
        value: `${aboveTarget}/${total}`,
        delta: `${Math.round(aboveTarget / total * 100)}%`,
        deltaUp: aboveTarget / total >= 0.5,
      },
      {
        key: 'avg_ap',
        label: 'Avg AP/Policy',
        value: fmt$(avgAP),
      },
      {
        key: 'at_risk',
        label: 'Total At-Risk',
        value: totalAtRisk.toLocaleString(),
        delta: totalAtRisk > 0 ? `${totalAtRisk}` : undefined,
        deltaUp: totalAtRisk === 0,
      },
    ];

    return {
      entityName,
      subtitle: `${total} agencies · ${periodLabel(period)}`,
      initials,
      tiles,
    };
  }, [enrichedRows, isOrgWide, effectiveAgencyWritingNumber, period]);

  // Ramp-up agent count for badge
  const rampUpCount = rampUpAgents.length;

  // Stats — derived from displayed (filtered) data
  const stats = useMemo(() => {
    const total = displayed.length;
    const above = displayed.filter(r => r.retention_pct !== null && r.retention_pct >= 90).length;
    const below = total - above;
    const totalPolicies = period === 'all'
      ? displayed.reduce((s, r) => s + r.active_policies, 0)
      : displayed.reduce((s, r) => s + r.period_policies, 0);
    const totalPremium = period === 'all'
      ? displayed.reduce((s, r) => s + r.active_premium, 0)
      : displayed.reduce((s, r) => s + r.period_ap, 0);
    return { total, above, below, totalPolicies, totalPremium };
  }, [displayed, period]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(key === 'rank'); }
  }

  function SortArrow({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortAsc
      ? <ChevronUp size={10} className="inline ml-0.5" />
      : <ChevronDown size={10} className="inline ml-0.5" />;
  }

  return (
    <div>
      <Header title="Agency Leaderboard" />
      <div className="p-6 space-y-6">

        {/* Agency filter — FYM admins only */}
        {showAgencyFilter && (
          <DataFilters
            selectedAgencyId={filterAgencyId}
            onAgencyChange={setFilterAgencyId}
          />
        )}

        {/* Board Tab Switcher */}
        <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5 w-fit">
          <button
            onClick={() => setBoardTab('agencies')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
              boardTab === 'agencies'
                ? 'gradient-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Trophy size={14} /> Agencies
          </button>
          <button
            onClick={() => setBoardTab('ramp_up')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
              boardTab === 'ramp_up'
                ? 'gradient-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Rocket size={14} /> Ramp Up
            {rampUpCount > 0 && boardTab !== 'ramp_up' && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400">
                {rampUpCount}
              </span>
            )}
          </button>
        </div>

        {/* Ramp Up Board */}
        {boardTab === 'ramp_up' && (
          <RampUpBoard agents={rampUpAgents} loading={rampUpLoading} />
        )}

        {/* Agencies Board */}
        {boardTab === 'agencies' && (<>

        {/* Executive Summary */}
        {execSummary && (
          <ExecutiveSummary
            data={execSummary}
            activeSort={sortKey as LeaderboardSortKey}
            onSortChange={(key) => {
              // Map exec summary keys to table sort keys
              const keyMap: Record<string, SortKey> = {
                ap: 'premium',
                apps: 'policies',
                save_rate: 'retention',
                at_risk: 'at_risk',
                avg_ap: 'premium',
                taken_pct: 'retention',
              };
              const mapped = keyMap[key] || 'rank';
              if (sortKey === mapped) setSortAsc(p => !p);
              else { setSortKey(mapped); setSortAsc(false); }
            }}
          />
        )}

        {/* Period + Metric Toggles */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Period */}
          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5">
            {(['all', 'year', 'month', 'week', 'today'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  period === p
                    ? 'gradient-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {periodLabel(p)}
              </button>
            ))}
          </div>

          {/* Metric toggle — only shows for period views */}
          {period !== 'all' && (
            <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5">
              <button
                onClick={() => setMetric('policies')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                  metric === 'policies'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText size={12} /> Policies
              </button>
              <button
                onClick={() => setMetric('premium')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                  metric === 'premium'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <DollarSign size={12} /> Premium
              </button>
            </div>
          )}

          {period !== 'all' && (
            <span className="text-xs text-muted-foreground ml-auto">
              <Calendar size={12} className="inline mr-1" />
              {periodLabel(period)} — new business effective dates
            </span>
          )}
        </div>

        {/* Stats strip */}
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: 'Total Agencies', end: stats.total, icon: Trophy, color: 'text-primary', bg: 'bg-cyan-500/10' },
            { title: 'Above 90% Target', end: stats.above, icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { title: 'Below 90% Target', end: stats.below, icon: AlertTriangle, color: stats.below > 0 ? 'text-red-400' : 'text-muted-foreground', bg: stats.below > 0 ? 'bg-red-500/10' : 'bg-secondary' },
            {
              title: period === 'all' ? 'Total Active Premium' : `${periodLabel(period)} Production`,
              end: metric === 'premium' || period === 'all' ? stats.totalPremium : stats.totalPolicies,
              icon: TrendingUp,
              color: 'text-foreground/80',
              bg: 'bg-secondary',
              fmt: metric === 'premium' || period === 'all'
                ? (n: number) => fmt$(n) + (period === 'all' ? '/mo' : '')
                : (n: number) => `${n.toLocaleString()} policies`,
            },
          ].map(card => (
            <StaggerItem key={card.title}>
              <Card className="border-border">
                <CardContent className="p-4">
                  {loading ? (
                    <div className="h-12 rounded shimmer" />
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                        <CountUp
                          end={card.end}
                          format={card.fmt}
                          className="text-2xl font-bold text-foreground mt-0.5 block"
                        />
                      </div>
                      <div className={`p-2 rounded-lg ${card.bg}`}>
                        <card.icon size={18} className={card.color} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Filter tabs + search */}
        <div className="flex flex-wrap items-center gap-2">
          {([['all', 'All'], ['above', '≥ 90%'], ['below', '< 90%']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === key
                  ? 'gradient-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search agencies…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-48"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {displayed.length} {displayed.length === 1 ? 'agency' : 'agencies'}
          </span>
        </div>

        {/* Leaderboard table — semantic HTML */}
        <Card className="border-border overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 rounded shimmer" />)}
              </div>
            ) : displayed.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                {searchQuery.trim()
                  ? `No agencies matching "${searchQuery.trim()}"`
                  : 'No agencies match the current filter.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-background border-b border-border/50 text-xs font-semibold text-muted-foreground">
                      <th
                        className="px-4 py-2.5 text-left cursor-pointer hover:text-foreground whitespace-nowrap w-16"
                        onClick={() => toggleSort('rank')}
                      >Rank <SortArrow k="rank" /></th>
                      <th className="px-2 py-2.5 text-left">Agency</th>
                      <th
                        className="px-2 py-2.5 text-center cursor-pointer hover:text-foreground whitespace-nowrap"
                        onClick={() => toggleSort('retention')}
                      >90-Day Retention <SortArrow k="retention" /></th>
                      <th
                        className="px-2 py-2.5 text-right cursor-pointer hover:text-foreground whitespace-nowrap"
                        onClick={() => toggleSort('policies')}
                      >Active <SortArrow k="policies" /></th>
                      <th
                        className="px-2 py-2.5 text-right cursor-pointer hover:text-foreground whitespace-nowrap"
                        onClick={() => toggleSort('premium')}
                      >Premium/mo <SortArrow k="premium" /></th>
                      {period !== 'all' && (
                        <th
                          className="px-2 py-2.5 text-right cursor-pointer hover:text-foreground whitespace-nowrap"
                          onClick={() => toggleSort(metric === 'policies' ? 'period_policies' : 'period_ap')}
                        >
                          {periodLabel(period)} {metric === 'policies' ? 'Policies' : 'AP'}
                          <SortArrow k={metric === 'policies' ? 'period_policies' : 'period_ap'} />
                        </th>
                      )}
                      <th
                        className="px-2 py-2.5 text-center cursor-pointer hover:text-foreground whitespace-nowrap w-20"
                        onClick={() => toggleSort('at_risk')}
                      >At-Risk <SortArrow k="at_risk" /></th>
                      <th className="px-2 py-2.5 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {displayed.map((r) => (
                      <tr
                        key={r.agency_id}
                        onClick={() => navigate(`/production/${r.agency_id}`)}
                        className={`cursor-pointer hover:bg-background/80 transition-colors ${
                          r.rank <= 3 ? 'bg-amber-500/10' : ''
                        } ${
                          !isOrgWide && effectiveAgencyWritingNumber === r.agency_id ? 'ring-1 ring-primary/40 bg-primary/5' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-center">{rankBadge(r.rank)}</td>
                        <td className="px-2 py-3">
                          <span className="font-medium text-foreground flex items-center gap-1.5">
                            <span className="truncate max-w-[200px]">
                              {r.name ?? <span className="font-data text-xs text-muted-foreground">{r.agency_id.slice(0, 12)}…</span>}
                              {!isOrgWide && effectiveAgencyWritingNumber === r.agency_id && (
                                <span className="ml-1.5 text-[10px] text-primary font-semibold">YOU</span>
                              )}
                            </span>
                            {(agencyBattleWins?.get(r.agency_id) || 0) > 0 && (
                              <span className="text-[10px] font-data text-amber-400 whitespace-nowrap" title="Battle wins">
                                🏆 x{agencyBattleWins?.get(r.agency_id)}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${retentionBg(r.retention_pct)} ${retentionColor(r.retention_pct)}`}>
                            {r.retention_pct !== null ? `${r.retention_pct}%` : '—'}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-right text-foreground/80 font-data">
                          {r.active_policies.toLocaleString()}
                        </td>
                        <td className="px-2 py-3 text-right text-foreground/80 font-data">
                          {fmt$(r.active_premium)}
                        </td>
                        {period !== 'all' && (
                          <td className={`px-2 py-3 text-right font-data font-medium ${
                            (metric === 'policies' ? r.period_policies : r.period_ap) > 0
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}>
                            {metric === 'policies'
                              ? (r.period_policies > 0 ? r.period_policies.toLocaleString() : '—')
                              : (r.period_ap > 0 ? fmt$(r.period_ap) : '—')
                            }
                          </td>
                        )}
                        <td className={`px-2 py-3 text-center font-medium font-data ${r.at_risk_count > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                          {r.at_risk_count || '—'}
                        </td>
                        <td className="px-2 py-3 text-center">
                          <ChevronRight size={16} className="text-muted-foreground" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        </>)}{/* end boardTab === 'agencies' */}
      </div>
    </div>
  );
}
