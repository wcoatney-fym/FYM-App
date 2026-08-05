import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { HudFrame } from '@/components/ui/hud-frame';
import { supabase } from '@/lib/supabase';
// prod-api fetch functions now handled by OrgDataCache
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { useOrgData } from '@/contexts/OrgDataCache';
import { Toaster, toast } from 'sonner';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { DataFilters } from '@/components/filters/DataFilters';
import { type DatePreset, type DateRange, DEFAULT_PRESET, getDateRange } from '@/lib/dateUtils';
import {
  ShieldCheck, Users, CheckCircle2, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Minus, ChevronDown, ChevronRight,
  Search, Download,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface CohortRow {
  product_type: 'HI' | 'HHC';
  cohort_month: string;
  cohort_size: number;
  drafted_first: number;
  retained: number;
  retention_pct: number | null;
  active_premium: number | null;
}

interface AgencyOverviewRow {
  agency_id: string;
  agency_name: string | null;
  active_policies: number;
  active_premium: number | null;
  at_risk_count: number;
  retained_90d: number;
  eligible_90d: number;
  retention_pct: number | null;
  recent_3mo_pct: number | null;
  prior_3mo_pct: number | null;
}

interface AgencyCohortRow {
  agency_id: string;
  agency_name: string | null;
  product_type: 'HI' | 'HHC';
  cohort_month: string;
  cohort_size: number;
  drafted_first: number;
  retained: number;
  retention_pct: number | null;
  active_premium: number | null;
}

interface TrendPoint {
  cohort_month: string;
  HI: number | null;
  HHC: number | null;
}

type SortKey = 'agency' | 'eligible' | 'retained' | 'retention' | 'recent' | 'ap' | 'atRisk';

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtNum(n: number) {
  return n.toLocaleString();
}
function fmtMonth(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}
function retentionColor(pct: number | null): string {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}

function TrendBadge({ recent, prior }: { recent: number | null; prior: number | null }) {
  if (recent === null || prior === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const diff = recent - prior;
  if (Math.abs(diff) < 0.5) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
        <Minus size={12} /> Flat
      </span>
    );
  }
  const up = diff > 0;
  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-0.5 border ${
        up
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-red-500/30 bg-red-500/10 text-red-400'
      }`}
    >
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(diff).toFixed(1)}pt
    </Badge>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export function RetentionPage() {
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();
  const orgData = useOrgData();

  const [agencies, setAgencies] = useState<AgencyOverviewRow[]>([]);
  const [agencySearch, setAgencySearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('retention');
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedAgency, setExpandedAgency] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));

  const loading = orgData.initialLoading;

  // Derive cohort rows from cache
  const orgCohorts = useMemo((): CohortRow[] => {
    return orgData.cohorts.map(c => ({
      product_type: 'HI' as const,
      cohort_month: c.month,
      cohort_size: c.eligible,
      drafted_first: c.eligible,
      retained: c.retained,
      retention_pct: c.retention_pct,
      active_premium: null,
    }));
  }, [orgData.cohorts]);

  // Derive agency overview from cache + enrich with names
  useEffect(() => {
    const allAgencies: AgencyOverviewRow[] = orgData.retentionAgencies.map(a => ({
      agency_id: a.agency_id,
      agency_name: null,
      active_policies: a.active_policies,
      active_premium: a.active_premium,
      at_risk_count: a.at_risk_count,
      retained_90d: a.retained_90d,
      eligible_90d: a.eligible_90d,
      retention_pct: a.retention_pct,
      recent_3mo_pct: (a as any).recent_3mo_pct ?? null,
      prior_3mo_pct: (a as any).prior_3mo_pct ?? null,
    }));

    // Enrich with agency names from rcbzag
    if (supabase && allAgencies.length > 0) {
      (supabase as any)
        .from('agencies')
        .select('tracker_id, writing_number, name')
        .then(({ data: nameData }: { data: any }) => {
          if (nameData) {
            const nameMap = new Map<string, string>();
            for (const a of nameData as any[]) {
              if (a.writing_number) nameMap.set(a.writing_number, a.name);
              if (a.tracker_id) nameMap.set(a.tracker_id, a.name);
            }
            allAgencies.forEach(a => {
              a.agency_name = nameMap.get(a.agency_id) ?? null;
            });
          }
          setAgencies([...allAgencies]);
        });
    } else {
      setAgencies(allAgencies);
    }
  }, [orgData.retentionAgencies]);

  // Cohort retention is always a historical lookback — the time filter controls
  // which *issue-date cohorts* appear. For "This Month" or very narrow ranges
  // that have zero mature cohorts, fall back to showing all data so the chart
  // is never empty.
  const isMonthInRange = useCallback((cohortMonth: string) => {
    if (datePreset === 'allTime') return true;
    const monthDate = new Date(cohortMonth + '-01T00:00:00');
    const start = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);
    return monthDate >= start && monthDate < end;
  }, [dateRange, datePreset]);

  // Check if applying the date filter would leave the chart empty.
  // Must check the correct data source depending on whether an agency is selected.
  const hasCohortsInRange = useMemo(() => {
    if (datePreset === 'allTime') return true;
    if (filterAgencyId) {
      return orgData.agencyCohorts.some(c => c.agency_id === filterAgencyId && isMonthInRange(c.month));
    }
    return orgCohorts.some(c => isMonthInRange(c.cohort_month));
  }, [orgCohorts, orgData.agencyCohorts, filterAgencyId, datePreset, isMonthInRange]);

  // If date filter yields no cohorts, show all (graceful fallback)
  const effectiveIsMonthInRange = useCallback((cohortMonth: string) => {
    if (!hasCohortsInRange) return true; // fallback: show all
    return isMonthInRange(cohortMonth);
  }, [hasCohortsInRange, isMonthInRange]);

  // Org-wide KPI summary — derived from sortedAgencies so it respects the filter
  // (sortedAgencies is defined below; moved summary after it would create a forward-ref,
  //  so we inline the filter here)
  const filteredAgencies = useMemo(() => {
    if (!filterAgencyId) return agencies;
    return agencies.filter(a => a.agency_id === filterAgencyId);
  }, [agencies, filterAgencyId]);

  const summary = useMemo(() => {
    const eligible = filteredAgencies.reduce((s, a) => s + (a.eligible_90d || 0), 0);
    const retained = filteredAgencies.reduce((s, a) => s + (a.retained_90d || 0), 0);
    const everDrafted = filteredAgencies.reduce((s, a) => s + (a.eligible_90d || 0), 0);
    const atRiskAgencies = filteredAgencies.filter(a => a.retention_pct !== null && a.retention_pct < 90).length;
    const orgRetentionPct = everDrafted > 0 ? (retained / everDrafted) * 100 : 0;
    return { eligible, retained, orgRetentionPct, atRiskAgencies };
  }, [filteredAgencies]);

  // Trend chart data — when filtered, re-aggregate from agency cohorts; apply date range filter
  // Falls back to showing all cohorts when the selected range has none (e.g. "This Month" with no July cohorts)
  const trendData = useMemo(() => {
    if (!filterAgencyId) {
      // Org-wide: use the org-wide cohort_retention view
      const byMonth = new Map<string, TrendPoint>();
      orgCohorts.filter(c => effectiveIsMonthInRange(c.cohort_month)).forEach(c => {
        const existing = byMonth.get(c.cohort_month) || { cohort_month: c.cohort_month, HI: null, HHC: null };
        if (c.product_type === 'HI') existing.HI = c.retention_pct;
        if (c.product_type === 'HHC') existing.HHC = c.retention_pct;
        byMonth.set(c.cohort_month, existing);
      });
      return Array.from(byMonth.values()).sort((a, b) => a.cohort_month.localeCompare(b.cohort_month));
    }
    // Filtered: rebuild from per-agency cohort data in OrgDataCache
    const filtered = orgData.agencyCohorts.filter(c => c.agency_id === filterAgencyId && effectiveIsMonthInRange(c.month));
    const byMonth = new Map<string, TrendPoint>();
    filtered.forEach(c => {
      const key = c.month;
      const existing = byMonth.get(key) || { cohort_month: key, HI: null, HHC: null };
      // Agency cohorts from edge fn are combined (not split by product) — show as HI line
      existing.HI = c.retention_pct;
      byMonth.set(key, existing);
    });
    return Array.from(byMonth.values()).sort((a, b) => a.cohort_month.localeCompare(b.cohort_month));
  }, [orgCohorts, orgData.agencyCohorts, filterAgencyId, effectiveIsMonthInRange]);

  // Filter + sort agency table
  const sortedAgencies = useMemo(() => {
    let arr = [...agencies];
    if (filterAgencyId) arr = arr.filter(a => a.agency_id === filterAgencyId);
    if (agencySearch.trim()) {
      const q = agencySearch.trim().toLowerCase();
      arr = arr.filter(a => (a.agency_name || a.agency_id).toLowerCase().includes(q));
    }
    const dir = sortAsc ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'agency':
          return dir * (a.agency_name || '').localeCompare(b.agency_name || '');
        case 'eligible':
          return dir * ((a.eligible_90d || 0) - (b.eligible_90d || 0));
        case 'retained':
          return dir * ((a.retained_90d || 0) - (b.retained_90d || 0));
        case 'retention':
          return dir * ((a.retention_pct ?? -1) - (b.retention_pct ?? -1));
        case 'recent':
          return dir * ((a.recent_3mo_pct ?? -1) - (b.recent_3mo_pct ?? -1));
        case 'ap':
          return dir * ((a.active_premium || 0) - (b.active_premium || 0));
        case 'atRisk':
          return dir * ((a.at_risk_count || 0) - (b.at_risk_count || 0));
        default:
          return 0;
      }
    });
    return arr;
  }, [agencies, sortKey, sortAsc, filterAgencyId, agencySearch]);

  function exportCsv() {
    const rows = [['Agency', 'Eligible', 'Retained', 'Retention %', 'Recent 3mo %', 'Active AP', 'At-Risk']];
    sortedAgencies.forEach(a => {
      rows.push([
        a.agency_name || a.agency_id,
        String(a.eligible_90d),
        String(a.retained_90d),
        a.retention_pct !== null ? `${a.retention_pct}%` : '',
        a.recent_3mo_pct !== null ? `${a.recent_3mo_pct}%` : '',
        a.active_premium !== null ? String(Math.round(Number(a.active_premium))) : '',
        String(a.at_risk_count || 0),
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retention-breakdown-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'agency');
    }
  }

  function toggleExpand(agencyId: string) {
    setExpandedAgency(expandedAgency === agencyId ? null : agencyId);
  }

  const expandedCohorts = useMemo(() => {
    if (!expandedAgency) return [];
    return orgData.agencyCohorts
      .filter(c => c.agency_id === expandedAgency)
      .map(c => ({
        agency_id: c.agency_id,
        agency_name: null as string | null,
        product_type: 'HI' as const,
        cohort_month: c.month,
        cohort_size: c.eligible,
        drafted_first: c.eligible,
        retained: c.retained,
        retention_pct: c.retention_pct,
        active_premium: null as number | null,
      }))
      .sort((a, b) => a.cohort_month.localeCompare(b.cohort_month));
  }, [orgData.agencyCohorts, expandedAgency]);

  const expandedChartData = useMemo(() => {
    const byMonth = new Map<string, { cohort_month: string; HI: number | null; HHC: number | null }>();
    expandedCohorts.forEach(c => {
      const existing = byMonth.get(c.cohort_month) || { cohort_month: c.cohort_month, HI: null, HHC: null };
      if (c.product_type === 'HI') existing.HI = c.retention_pct;
      if (c.product_type === 'HHC') existing.HHC = c.retention_pct;
      byMonth.set(c.cohort_month, existing);
    });
    return Array.from(byMonth.values());
  }, [expandedCohorts]);

  if (!supabase) {
    return (
      <>
        <Header title="Retention" />
        <div className="p-6 text-center text-muted-foreground">
          <p>Supabase is not configured — running in mock mode. Connect Supabase to view retention data.</p>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Header title="Retention" />
        <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 rounded-lg shimmer" />)}
          </div>
          <div className="h-72 rounded-lg shimmer" />
          <div className="h-64 rounded-lg shimmer" />
        </div>
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" richColors />
      <Header title="Retention" />
      <div className="p-6 space-y-6 max-w-screen-xl mx-auto">

        {/* Filters — time period always visible, agency for admins */}
        <DataFilters
          showAgencyFilter={showAgencyFilter}
          showTimePeriod
          selectedAgencyId={filterAgencyId}
          selectedPreset={datePreset}
          selectedDateRange={dateRange}
          onAgencyChange={setFilterAgencyId}
          onDateRangeChange={(range, preset) => { setDateRange(range); setDatePreset(preset); }}
        />

        {/* KPI Summary Cards */}
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: 'Org-Wide Retention',
              end: summary.orgRetentionPct,
              fmt: (n: number) => `${n.toFixed(1)}%`,
              sub: 'Target: 90%',
              icon: ShieldCheck,
              color: summary.orgRetentionPct >= 90 ? 'text-emerald-400' : summary.orgRetentionPct >= 85 ? 'text-amber-400' : 'text-red-400',
              bg: summary.orgRetentionPct >= 90 ? 'bg-emerald-500/10' : summary.orgRetentionPct >= 85 ? 'bg-amber-500/10' : 'bg-red-500/10',
              accent: summary.orgRetentionPct >= 90 ? 'hsl(142 71% 45%)' : 'hsl(38 92% 50%)',
            },
            {
              title: 'Total Eligible Policies',
              end: summary.eligible,
              fmt: fmtNum,
              sub: '90+ days since issue',
              icon: Users,
              color: 'text-primary',
              bg: 'bg-cyan-500/10',
              accent: 'hsl(199 89% 48%)',
            },
            {
              title: 'Retained (3rd Draft+)',
              end: summary.retained,
              fmt: fmtNum,
              sub: 'Successfully drafted 3x',
              icon: CheckCircle2,
              color: 'text-emerald-400',
              bg: 'bg-emerald-500/10',
              accent: 'hsl(142 71% 45%)',
            },
            {
              title: 'Agencies Below 90%',
              end: summary.atRiskAgencies,
              fmt: fmtNum,
              sub: `of ${filteredAgencies.length} agencies`,
              icon: AlertTriangle,
              color: summary.atRiskAgencies > 0 ? 'text-red-400' : 'text-muted-foreground',
              bg: summary.atRiskAgencies > 0 ? 'bg-red-500/10' : 'bg-secondary',
              accent: summary.atRiskAgencies > 0 ? 'hsl(0 84% 60%)' : 'hsl(215 20% 55%)',
            },
          ].map(card => (
            <StaggerItem key={card.title}>
              <HudFrame accentColor={card.accent}>
                <Card className="border-border h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                        <CountUp
                          end={card.end}
                          format={card.fmt}
                          className="text-3xl font-bold text-foreground mt-1 block font-data"
                        />
                        {card.sub && <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>}
                      </div>
                      <div className={`p-2.5 rounded-lg ${card.bg}`}>
                        <card.icon size={20} className={card.color} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </HudFrame>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Org-wide retention trend */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base text-foreground">90-Day Retention by Cohort — HI vs HHC</CardTitle>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                  <XAxis dataKey="cohort_month" tickFormatter={fmtMonth} stroke="hsl(215 20% 55%)" fontSize={11} />
                  <YAxis
                    domain={[0, 100]}
                    stroke="hsl(215 20% 55%)"
                    fontSize={11}
                    tickFormatter={v => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(217 33% 20%)',
                      background: 'hsl(222 47% 9%)',
                      color: 'hsl(210 40% 98%)',
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => [
                      value !== null ? `${value}%` : '—',
                      name,
                    ]}
                    labelFormatter={fmtMonth}
                  />
                  <Legend wrapperStyle={{ color: 'hsl(215 20% 65%)' }} />
                  <ReferenceLine
                    y={90}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{ value: 'Target 90%', position: 'insideTopRight', fill: '#ef4444', fontSize: 11 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="HI"
                    name="HI"
                    stroke="hsl(199 89% 48%)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: 'hsl(199 89% 48%)' }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="HHC"
                    name="HHC"
                    stroke="#0ea5e9"
                    strokeWidth={2.5}
                    strokeDasharray="5 3"
                    dot={{ r: 3, fill: '#0ea5e9' }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Agency retention table */}
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base text-foreground">
              Agency Retention Breakdown
              {agencies.length > 0 && (
                <Badge className="ml-2 bg-secondary text-muted-foreground border-border border">
                  {sortedAgencies.length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search agencies…"
                  value={agencySearch}
                  onChange={e => setAgencySearch(e.target.value)}
                  className="h-8 pl-8 pr-3 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-48"
                />
              </div>
              <button
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-border bg-background text-foreground hover:bg-secondary transition-colors"
                aria-label="Export retention data as CSV"
              >
                <Download size={14} /> CSV
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {sortedAgencies.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                No agency retention data available yet.
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                <div className="grid grid-cols-9 gap-2 px-4 py-2 bg-secondary/30 text-xs font-semibold text-muted-foreground font-data">
                  <button className="col-span-2 text-left flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('agency')}>
                    Agency
                  </button>
                  <button className="text-right flex items-center justify-end gap-1 hover:text-foreground" onClick={() => handleSort('eligible')}>
                    Eligible
                  </button>
                  <button className="text-right flex items-center justify-end gap-1 hover:text-foreground" onClick={() => handleSort('retained')}>
                    Retained
                  </button>
                  <button className="text-right flex items-center justify-end gap-1 hover:text-foreground" onClick={() => handleSort('retention')}>
                    Retention %
                  </button>
                  <button className="text-right flex items-center justify-end gap-1 hover:text-foreground" onClick={() => handleSort('recent')}>
                    Recent 3mo %
                  </button>
                  <span className="text-right">Trend</span>
                  <button className="text-right flex items-center justify-end gap-1 hover:text-foreground" onClick={() => handleSort('ap')}>
                    Active AP
                  </button>
                  <button className="text-right flex items-center justify-end gap-1 hover:text-foreground" onClick={() => handleSort('atRisk')}>
                    At-Risk
                  </button>
                </div>
                {sortedAgencies.map(agency => {
                  const below90 = agency.retention_pct !== null && agency.retention_pct < 90;
                  const isExpanded = expandedAgency === agency.agency_id;
                  return (
                    <div key={agency.agency_id}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-label={`${agency.agency_name || agency.agency_id} retention details`}
                        onClick={() => toggleExpand(agency.agency_id)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(agency.agency_id); } }}
                        className={`grid grid-cols-9 gap-2 px-4 py-3 text-sm row-hover cursor-pointer ${
                          below90 ? 'bg-red-500/5' : ''
                        }`}
                      >
                        <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                          {isExpanded ? (
                            <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="font-medium text-foreground truncate">
                            {agency.agency_name || agency.agency_id.slice(0, 12) + '…'}
                          </span>
                        </div>
                        <span className="text-right text-muted-foreground font-data self-center">
                          {fmtNum(agency.eligible_90d)}
                        </span>
                        <span className="text-right text-foreground/80 font-medium font-data self-center">
                          {fmtNum(agency.retained_90d)}
                        </span>
                        <span className={`text-right font-medium font-data self-center ${retentionColor(agency.retention_pct)}`}>
                          {agency.retention_pct !== null ? `${agency.retention_pct}%` : '—'}
                        </span>
                        <span className={`text-right font-medium font-data self-center ${retentionColor(agency.recent_3mo_pct)}`}>
                          {agency.recent_3mo_pct !== null ? `${agency.recent_3mo_pct}%` : '—'}
                        </span>
                        <span className="text-right self-center flex justify-end">
                          <TrendBadge recent={agency.recent_3mo_pct} prior={agency.prior_3mo_pct} />
                        </span>
                        <span className="text-right text-foreground font-data font-medium self-center">
                          {agency.active_premium !== null ? fmt$(Number(agency.active_premium)) : '—'}
                        </span>
                        <span className={`text-right font-data self-center ${
                          agency.at_risk_count > 0 ? 'text-red-400 font-medium' : 'text-muted-foreground'
                        }`}>
                          {agency.at_risk_count || '—'}
                        </span>
                      </div>

                      {/* Expandable agency cohort detail */}
                      {isExpanded && (
                        <div className="px-4 py-4 bg-secondary/20 border-t border-border/20 space-y-4">
                          {expandedCohorts.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">
                              No monthly cohort detail available for this agency.
                            </p>
                          ) : (
                            <>
                              <div className="h-48">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={expandedChartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                                    <XAxis dataKey="cohort_month" tickFormatter={fmtMonth} stroke="hsl(215 20% 55%)" fontSize={10} />
                                    <YAxis domain={[0, 100]} stroke="hsl(215 20% 55%)" fontSize={10} tickFormatter={v => `${v}%`} />
                                    <Tooltip
                                      contentStyle={{
                                        borderRadius: '8px',
                                        border: '1px solid hsl(217 33% 20%)',
                                        background: 'hsl(222 47% 9%)',
                                        color: 'hsl(210 40% 98%)',
                                        fontSize: 12,
                                      }}
                                      formatter={(value: number, name: string) => [value !== null ? `${value}%` : '—', name]}
                                      labelFormatter={fmtMonth}
                                    />
                                    <Legend wrapperStyle={{ color: 'hsl(215 20% 65%)', fontSize: 11 }} />
                                    <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="4 4" />
                                    <Bar dataKey="HI" name="HI" fill="hsl(199 89% 48%)" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="HHC" name="HHC" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                              <div className="divide-y divide-border/30 rounded-md border border-border/30 overflow-hidden">
                                <div className="grid grid-cols-6 gap-2 px-3 py-1.5 bg-secondary/40 text-[11px] font-semibold text-muted-foreground font-data">
                                  <span>Month</span>
                                  <span>Product</span>
                                  <span className="text-right">Cohort Size</span>
                                  <span className="text-right">Drafted 1x</span>
                                  <span className="text-right">Retained</span>
                                  <span className="text-right">Retention %</span>
                                </div>
                                {expandedCohorts.map((c, i) => (
                                  <div key={`${c.cohort_month}-${c.product_type}-${i}`} className="grid grid-cols-6 gap-2 px-3 py-1.5 text-xs">
                                    <span className="text-muted-foreground font-data">{fmtMonth(c.cohort_month)}</span>
                                    <span className="text-foreground/80">{c.product_type}</span>
                                    <span className="text-right text-muted-foreground font-data">{fmtNum(c.cohort_size)}</span>
                                    <span className="text-right text-muted-foreground font-data">{fmtNum(c.drafted_first)}</span>
                                    <span className="text-right text-foreground font-data">{fmtNum(c.retained)}</span>
                                    <span className={`text-right font-medium font-data ${retentionColor(c.retention_pct)}`}>
                                      {c.retention_pct !== null ? `${c.retention_pct}%` : '—'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
