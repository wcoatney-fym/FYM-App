import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeltaBadge } from '@/components/ui/delta-badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { HudFrame } from '@/components/ui/hud-frame';
import { supabase } from '@/lib/supabase';
import {
  fetchAgencyProduction,
  fetchAgentProduction,
  fetchDailyProduction,
  type AgentProduction,
} from '@/lib/prod-api';
import {
  filterDailyByRange,
  aggregateAgencyProduction,
} from '@/lib/clientFilters';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { useOrgData } from '@/contexts/OrgDataCache';
import {
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Legend,
} from 'recharts';
import { DataFilters } from '@/components/filters/DataFilters';
import { type DatePreset, type DateRange, type DailyRow, type TrendPoint, DEFAULT_PRESET, getDateRange, getGranularity, aggregateTrend, fmtMonth } from '@/lib/dateUtils';
import { toast } from 'sonner';
import { fmt$, fmtNum } from '@/lib/formatUtils';
import {
  TrendingUp, DollarSign, FileText, Building2, Search, Download,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface OrgStats {
  totalPolicies: number;
  activePolicies: number;
  terminatedPolicies: number;
  pendingPolicies: number;
  atRiskPolicies: number;
  activeMonthlyPremium: number;
  activeAnnualPremium: number;
  policiesThisMonth: number;
  apThisMonth: number;
  policiesLastMonth: number;
  apLastMonth: number;
  activeAgencies: number;
}

interface AgencyRow {
  agency_id: string;
  agency_name: string | null;
  total_policies: number;
  active_policies: number;
  terminated_policies: number;
  pending_policies: number;
  active_annual_premium: number;
  avg_annual_premium: number;
  policies_this_month: number;
  ap_this_month: number;
  policies_last_month: number;
  ap_last_month: number;
  at_risk_policies: number;
  at_risk_annual_premium: number;
}

// RawMonthlyRow kept for all-time fallback to monthly_production view
interface RawMonthlyRow {
  month: string;
  agency_id: string;
  agent_id: string | null;
  writing_number: string | null;
  product_type: string;
  policies: number;
  annual_premium: number;
}

// ── Component ──────────────────────────────────────────────────────────────
export function ProductionPage() {
  const { effectiveAgencyWritingNumber, isOrgWide } = useEffectiveAuth();
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();
  const orgData = useOrgData();

  // Local state for date-filtered data (only when user picks a custom date range)
  const [localAgencies, setLocalAgencies] = useState<AgencyRow[]>([]);
  const [localMonthly, setLocalMonthly] = useState<RawMonthlyRow[]>([]);
  const [localDaily, setLocalDaily] = useState<DailyRow[]>([]);
  const [dateLoading, setDateLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'ap' | 'policies' | 'growth'>('ap');
  const [search, setSearch] = useState('');
  const [agentBreakdown, setAgentBreakdown] = useState<AgentProduction[]>([]);
  const [agentBreakdownLoading, setAgentBreakdownLoading] = useState(false);
  const [filterAgentId, setFilterAgentId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));

  const useRpc = datePreset !== 'allTime';

  // Build agency name lookup from retention data (ga_name from Max's DB) + local agencies table
  const agencyNameMap = useMemo(() => {
    const map = new Map<string, string>();
    // Retention agencies have ga_name from Max's DB
    for (const ra of orgData.retentionAgencies) {
      if (ra.agency_name) {
        // Title-case the name (ga_name comes in ALL CAPS)
        const name = ra.agency_name.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        map.set(ra.agency_id, name);
      }
    }
    return map;
  }, [orgData.retentionAgencies]);

  // Map org cache agency production to AgencyRow for all-time view
  const cachedAgencies = useMemo((): AgencyRow[] => {
    return orgData.agencyProduction.map(a => ({
      agency_id: a.agency_id,
      agency_name: agencyNameMap.get(a.agency_id) ?? null,
      total_policies: a.total_policies,
      active_policies: a.active_policies,
      terminated_policies: a.terminated_policies,
      pending_policies: a.pending_policies,
      active_annual_premium: a.active_annual_premium,
      avg_annual_premium: a.avg_annual_premium,
      policies_this_month: a.policies_this_month,
      ap_this_month: a.ap_this_month,
      policies_last_month: a.policies_last_month,
      ap_last_month: a.ap_last_month,
      at_risk_policies: a.at_risk_policies,
      at_risk_annual_premium: a.at_risk_annual_premium,
    }));
  }, [orgData.agencyProduction, agencyNameMap]);

  // Map org cache monthly production to RawMonthlyRow
  const cachedMonthly = useMemo((): RawMonthlyRow[] => {
    return orgData.monthlyProduction.map(m => ({
      month: m.month,
      agency_id: m.agency_id,
      agent_id: null,
      writing_number: null,
      product_type: '',
      policies: m.policies,
      annual_premium: m.annual_premium,
    }));
  }, [orgData.monthlyProduction]);

  // Use date-filtered local data when available; fall back to cache data
  // so we never render zeros while the date-filtered fetch is in flight.
  const hasLocalData = localAgencies.length > 0;
  const agencies = useRpc && hasLocalData ? localAgencies : cachedAgencies;
  const rawMonthly = useRpc && hasLocalData ? localMonthly : cachedMonthly;
  const dailyRows = useRpc && hasLocalData ? localDaily : [];
  // Show loading only when we have no data at all
  const hasAnyData = agencies.length > 0 || rawMonthly.length > 0 || dailyRows.length > 0;
  const loading = orgData.initialLoading && !hasAnyData;

  // Org-wide stats derived from agencies
  const stats = useMemo((): OrgStats | null => {
    if (loading && agencies.length === 0) return null;
    return {
      totalPolicies: agencies.reduce((s, a) => s + (a.total_policies || 0), 0),
      activePolicies: agencies.reduce((s, a) => s + (a.active_policies || 0), 0),
      terminatedPolicies: agencies.reduce((s, a) => s + (a.terminated_policies || 0), 0),
      pendingPolicies: agencies.reduce((s, a) => s + (a.pending_policies || 0), 0),
      atRiskPolicies: agencies.reduce((s, a) => s + (a.at_risk_policies || 0), 0),
      activeMonthlyPremium: agencies.reduce((s, a) => s + Number(a.active_annual_premium || 0) / 12, 0),
      activeAnnualPremium: agencies.reduce((s, a) => s + Number(a.active_annual_premium || 0), 0),
      policiesThisMonth: agencies.reduce((s, a) => s + (a.policies_this_month || 0), 0),
      apThisMonth: agencies.reduce((s, a) => s + Number(a.ap_this_month || 0), 0),
      policiesLastMonth: agencies.reduce((s, a) => s + (a.policies_last_month || 0), 0),
      apLastMonth: agencies.reduce((s, a) => s + Number(a.ap_last_month || 0), 0),
      activeAgencies: agencies.filter(a => a.active_policies > 0).length,
    };
  }, [loading, agencies]);

  // Fetch date-filtered data — client-side filtering when cache available (instant)
  useEffect(() => {
    if (!useRpc) {
      setLocalAgencies([]);
      setLocalDaily([]);
      setLocalMonthly([]);
      return;
    }
    const startDate = dateRange.startDate.split('T')[0];
    const endDate = dateRange.endDate.split('T')[0];

    // Org-wide + cache available → instant client-side filter
    if (isOrgWide && orgData.dailyProduction.length > 0) {
      const filtered = filterDailyByRange(orgData.dailyProduction, startDate, endDate);
      const agencyStats = aggregateAgencyProduction(filtered, orgData.agencyProduction);
      setLocalAgencies(agencyStats.map(a => ({
        agency_id: a.agency_id,
        agency_name: agencyNameMap.get(a.agency_id) ?? null,
        total_policies: a.total_policies,
        active_policies: a.active_policies,
        terminated_policies: a.terminated_policies,
        pending_policies: a.pending_policies,
        active_annual_premium: a.active_annual_premium,
        avg_annual_premium: a.avg_annual_premium,
        policies_this_month: a.policies_this_month,
        ap_this_month: a.ap_this_month,
        policies_last_month: a.policies_last_month,
        ap_last_month: a.ap_last_month,
        at_risk_policies: a.at_risk_policies,
        at_risk_annual_premium: a.at_risk_annual_premium,
      })));
      setLocalDaily(filtered.map(d => ({
        agency_id: d.agency_id,
        agent_id: null,
        writing_number: null,
        product_type: '',
        day: d.day,
        policies: d.policies,
        annual_premium: d.annual_premium,
      })));
      setLocalMonthly([]);
      return;
    }

    // Agency-scoped fallback → edge function calls
    if (!supabase) return;
    const agencyParam = !isOrgWide && effectiveAgencyWritingNumber ? { agency_id: effectiveAgencyWritingNumber } : {};
    const dateParams = { ...agencyParam, start_date: startDate, end_date: endDate };

    setDateLoading(true);
    Promise.all([
      fetchAgencyProduction(dateParams),
      fetchDailyProduction(dateParams),
    ]).then(([prodAgencies, dailyData]) => {
      setLocalAgencies(prodAgencies.map(a => ({
        agency_id: a.agency_id,
        agency_name: agencyNameMap.get(a.agency_id) ?? null,
        total_policies: a.total_policies,
        active_policies: a.active_policies,
        terminated_policies: a.terminated_policies,
        pending_policies: a.pending_policies,
        active_annual_premium: a.active_annual_premium,
        avg_annual_premium: a.avg_annual_premium,
        policies_this_month: a.policies_this_month,
        ap_this_month: a.ap_this_month,
        policies_last_month: a.policies_last_month,
        ap_last_month: a.ap_last_month,
        at_risk_policies: a.at_risk_policies,
        at_risk_annual_premium: a.at_risk_annual_premium,
      })));
      setLocalDaily(dailyData.map(d => ({
        agency_id: d.agency_id,
        agent_id: null,
        writing_number: null,
        product_type: '',
        day: d.day,
        policies: d.policies,
        annual_premium: d.annual_premium,
      })));
      setLocalMonthly([]);
      setDateLoading(false);
    }).catch(err => {
      console.error('Production date-filtered fetch error:', err);
      toast.error('Failed to load production data. Showing cached results.');
      setDateLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, datePreset, effectiveAgencyWritingNumber, isOrgWide, agencyNameMap, orgData.dailyProduction, orgData.agencyProduction]);

  // Filter + sort agencies
  const filteredAgencies = useMemo(() => {
    if (!filterAgencyId) return agencies;
    return agencies.filter(a => a.agency_id === filterAgencyId);
  }, [agencies, filterAgencyId]);

  // Determine effective agency scope for agent breakdown
  const breakdownAgencyId = filterAgencyId || (!isOrgWide ? effectiveAgencyWritingNumber : null);

  // Load agent-level breakdown when viewing a specific agency
  useEffect(() => {
    if (!breakdownAgencyId) {
      setAgentBreakdown([]);
      return;
    }
    let cancelled = false;
    setAgentBreakdownLoading(true);

    fetchAgentProduction({ agency_id: breakdownAgencyId })
      .then(agents => {
        if (!cancelled) setAgentBreakdown(agents);
      })
      .catch(err => {
        console.error('Agent breakdown load error:', err);
        if (!cancelled) setAgentBreakdown([]);
      })
      .finally(() => {
        if (!cancelled) setAgentBreakdownLoading(false);
      });

    return () => { cancelled = true; };
  }, [breakdownAgencyId]);

  // Compute adaptive granularity based on selected date range
  const granularity = useMemo(() => getGranularity(dateRange), [dateRange]);

  // Aggregate trend data with adaptive granularity
  const filteredTrend = useMemo((): TrendPoint[] => {
    // Date-filtered path: use dailyRows with adaptive granularity
    if (dailyRows.length > 0) {
      return aggregateTrend(dailyRows, granularity, {
        agencyId: filterAgencyId,
        writingNumber: filterAgentId,
      });
    }
    // All-time fallback: use monthly view data
    let rows = rawMonthly;
    if (filterAgencyId) rows = rows.filter(r => r.agency_id === filterAgencyId);
    if (filterAgentId) rows = rows.filter(r => r.writing_number === filterAgentId);
    const byMonth = new Map<string, { policies: number; ap: number }>();
    rows.forEach(r => {
      const existing = byMonth.get(r.month) || { policies: 0, ap: 0 };
      existing.policies += Number(r.policies);
      existing.ap += Number(r.annual_premium);
      byMonth.set(r.month, existing);
    });
    return Array.from(byMonth.entries())
      .map(([month, v]) => ({
        bucket: month,
        label: fmtMonth(month),
        policies: v.policies,
        ap: v.ap,
      }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket))
      .slice(-12);
  }, [dailyRows, rawMonthly, granularity, filterAgencyId, filterAgentId]);

  const displayStats = useMemo((): OrgStats | null => {
    if (!stats) return null;
    if (!filterAgencyId) return stats;
    const fa = filteredAgencies;
    return {
      totalPolicies: fa.reduce((s, a) => s + (a.total_policies || 0), 0),
      activePolicies: fa.reduce((s, a) => s + (a.active_policies || 0), 0),
      terminatedPolicies: fa.reduce((s, a) => s + (a.terminated_policies || 0), 0),
      pendingPolicies: fa.reduce((s, a) => s + (a.pending_policies || 0), 0),
      atRiskPolicies: fa.reduce((s, a) => s + (a.at_risk_policies || 0), 0),
      activeMonthlyPremium: fa.reduce((s, a) => s + Number(a.active_annual_premium || 0) / 12, 0),
      activeAnnualPremium: fa.reduce((s, a) => s + Number(a.active_annual_premium || 0), 0),
      policiesThisMonth: fa.reduce((s, a) => s + (a.policies_this_month || 0), 0),
      apThisMonth: fa.reduce((s, a) => s + Number(a.ap_this_month || 0), 0),
      policiesLastMonth: fa.reduce((s, a) => s + (a.policies_last_month || 0), 0),
      apLastMonth: fa.reduce((s, a) => s + Number(a.ap_last_month || 0), 0),
      activeAgencies: fa.filter(a => a.active_policies > 0).length,
    };
  }, [stats, filterAgencyId, filteredAgencies]);

  const searchedAgencies = useMemo(() => {
    if (!search) return filteredAgencies;
    const q = search.toLowerCase();
    return filteredAgencies.filter(a =>
      (a.agency_name ?? a.agency_id).toLowerCase().includes(q)
    );
  }, [filteredAgencies, search]);

  const sortedAgencies = useMemo(() => {
    const arr = [...searchedAgencies];
    switch (sortBy) {
      case 'ap': return arr.sort((a, b) => Number(b.active_annual_premium) - Number(a.active_annual_premium));
      case 'policies': return arr.sort((a, b) => b.policies_this_month - a.policies_this_month);
      case 'growth': return arr.sort((a, b) => {
        const gA = a.policies_last_month > 0 ? (a.policies_this_month - a.policies_last_month) / a.policies_last_month : a.policies_this_month > 0 ? 1 : 0;
        const gB = b.policies_last_month > 0 ? (b.policies_this_month - b.policies_last_month) / b.policies_last_month : b.policies_this_month > 0 ? 1 : 0;
        return gB - gA;
      });
      default: return arr;
    }
  }, [searchedAgencies, sortBy]);

  // Agent breakdown — filtered + sorted
  const sortedAgentBreakdown = useMemo(() => {
    let arr = [...agentBreakdown];
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(a =>
        (a.agent_name ?? a.agent_id).toLowerCase().includes(q)
      );
    }
    // Sort
    switch (sortBy) {
      case 'ap': return arr.sort((a, b) => b.active_annual_premium - a.active_annual_premium);
      case 'policies': return arr.sort((a, b) => b.policies_this_month - a.policies_this_month);
      case 'growth': return arr.sort((a, b) => b.active_policies - a.active_policies);
      default: return arr;
    }
  }, [agentBreakdown, search, sortBy]);

  // Whether to show agent-level breakdown vs agency-level
  const showAgentBreakdown = !!breakdownAgencyId;

  // CSV export
  const handleExport = () => {
    const activeAgencies = sortedAgencies.filter(a => a.active_policies > 0);
    if (activeAgencies.length === 0) return;
    const headers = ['Agency', 'Total Policies', 'Active', 'Pending', 'Terminated', 'Active AP', 'Avg AP', 'MTD Policies', 'MTD AP', 'Last Mo Policies', 'At Risk', 'At-Risk AP'];
    const escCsv = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const csvRows = activeAgencies.map(a => [
      escCsv(a.agency_name ?? a.agency_id),
      a.total_policies,
      a.active_policies,
      a.pending_policies,
      a.terminated_policies,
      Math.round(Number(a.active_annual_premium)),
      Math.round(Number(a.avg_annual_premium)),
      a.policies_this_month,
      Math.round(Number(a.ap_this_month)),
      a.policies_last_month,
      a.at_risk_policies,
      Math.round(Number(a.at_risk_annual_premium || 0)),
    ]);
    const csv = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fym-production-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <>
        <Header title="Production" />
        <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 rounded-lg shimmer" />)}
        </div>
      </>
    );
  }

  if (!stats || !displayStats) return null;

  return (
    <>
      <Header title="Production" />
      <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
        {/* Filters — time period always visible, agency/agent for admins */}
        <DataFilters
          showAgencyFilter={showAgencyFilter}
          showAgentFilter={showAgencyFilter}
          showTimePeriod
          selectedAgencyId={filterAgencyId}
          selectedAgentId={filterAgentId}
          selectedPreset={datePreset}
          selectedDateRange={dateRange}
          onAgencyChange={(id) => { setFilterAgencyId(id); setFilterAgentId(null); }}
          onAgentChange={setFilterAgentId}
          onDateRangeChange={(range, preset) => { setDateRange(range); setDatePreset(preset); }}
        />

        {/* Date-loading overlay */}
        {dateLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
            Updating data…
          </div>
        )}

        {/* Hero KPI Cards */}
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: 'Active Policies',
              end: displayStats.activePolicies,
              fmt: fmtNum,
              sub: `${fmtNum(displayStats.policiesThisMonth)} this month`,
              icon: FileText,
              color: 'text-primary',
              bg: 'bg-cyan-500/10',
              accent: 'hsl(199 89% 48%)',
            },
            {
              title: 'Annual Premium',
              end: displayStats.activeAnnualPremium,
              fmt: fmt$,
              sub: `${fmt$(displayStats.apThisMonth)} this month`,
              icon: DollarSign,
              color: 'text-emerald-400',
              bg: 'bg-emerald-500/10',
              accent: 'hsl(142 71% 45%)',
            },
            {
              title: 'This Month',
              end: displayStats.policiesThisMonth,
              fmt: (n: number) => `${fmtNum(n)} policies`,
              delta: displayStats.policiesLastMonth,
              icon: TrendingUp,
              color: 'text-amber-400',
              bg: 'bg-amber-500/10',
              accent: 'hsl(38 92% 50%)',
            },
            {
              title: 'Active Agencies',
              end: displayStats.activeAgencies,
              fmt: fmtNum,
              sub: `${fmtNum(displayStats.atRiskPolicies)} at-risk policies`,
              icon: Building2,
              color: 'text-violet-400',
              bg: 'bg-violet-500/10',
              accent: 'hsl(263 70% 50%)',
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
                        <div className="flex items-center gap-2 mt-0.5">
                          {card.sub && (
                            <p className="text-xs text-muted-foreground">{card.sub}</p>
                          )}
                          {'delta' in card && card.delta !== undefined && (
                            <DeltaBadge current={card.end} previous={card.delta} />
                          )}
                        </div>
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

        {/* Book of Business Status Strip */}
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="grid grid-cols-5 gap-4 text-center">
              {[
                { label: 'Active', value: displayStats.activePolicies, color: 'text-emerald-400' },
                { label: 'Pending', value: displayStats.pendingPolicies, color: 'text-amber-400' },
                { label: 'At Risk', value: displayStats.atRiskPolicies, color: 'text-red-400' },
                { label: 'Terminated', value: displayStats.terminatedPolicies, color: 'text-muted-foreground' },
                { label: 'Total', value: displayStats.totalPolicies, color: 'text-foreground' },
              ].map(s => (
                <div key={s.label}>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`text-lg font-bold font-data ${s.color}`}>{fmtNum(s.value)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Production Trend Chart */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base text-foreground">
              Production — {dateRange.label}{granularity === 'day' ? ' (Daily)' : granularity === 'week' ? ' (Weekly)' : ' (Monthly)'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={filteredTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(215 20% 55%)"
                    fontSize={11}
                    interval={filteredTrend.length > 15 ? Math.floor(filteredTrend.length / 10) : 0}
                    angle={filteredTrend.length > 12 ? -45 : 0}
                    textAnchor={filteredTrend.length > 12 ? 'end' : 'middle'}
                    height={filteredTrend.length > 12 ? 50 : 30}
                  />
                  <YAxis
                    yAxisId="ap"
                    orientation="left"
                    stroke="hsl(215 20% 55%)"
                    fontSize={11}
                    tickFormatter={v => fmt$(v)}
                  />
                  <YAxis
                    yAxisId="policies"
                    orientation="right"
                    stroke="hsl(215 20% 55%)"
                    fontSize={11}
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
                      name === 'ap' ? fmt$(value) : fmtNum(value),
                      name === 'ap' ? 'Annual Premium' : 'Policies',
                    ]}
                    labelFormatter={(label: string) => label}
                  />
                  <Legend
                    formatter={(value: string) => value === 'ap' ? 'Annual Premium' : 'Policies'}
                    wrapperStyle={{ color: 'hsl(215 20% 65%)' }}
                  />
                  <Bar
                    yAxisId="ap"
                    dataKey="ap"
                    fill="hsl(199 89% 48%)"
                    fillOpacity={0.3}
                    stroke="hsl(199 89% 48%)"
                    radius={[3, 3, 0, 0]}
                  />
                  <Line
                    yAxisId="policies"
                    type="monotone"
                    dataKey="policies"
                    stroke="hsl(142 71% 45%)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: 'hsl(142 71% 45%)' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Agency/Agent Breakdown Table */}
        <Card className="border-border">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-base text-foreground">
              {showAgentBreakdown ? 'Agent Breakdown' : 'Agency Breakdown'}
            </CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial sm:w-56">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={showAgentBreakdown ? 'Search agents…' : 'Search agencies…'}
                  className="pl-8 h-8 text-xs"
                  aria-label={showAgentBreakdown ? 'Search agents' : 'Search agencies'}
                />
              </div>
              <div className="flex gap-1">
                {[
                  { key: 'ap' as const, label: 'By AP' },
                  { key: 'policies' as const, label: 'By Volume' },
                  { key: 'growth' as const, label: 'By Growth' },
                ].map(btn => (
                  <button
                    key={btn.key}
                    onClick={() => setSortBy(btn.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      sortBy === btn.key
                        ? 'gradient-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
              <button
                onClick={handleExport}
                className="p-1.5 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Export CSV"
                title="Export CSV"
              >
                <Download size={14} />
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {showAgentBreakdown ? (
              /* ── Agent-level breakdown table ── */
              <Table>
                <TableHeader>
                  <TableRow className="bg-background">
                    <TableHead className="font-semibold text-xs text-muted-foreground min-w-[180px]">Agent</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right">Total</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right">Active</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right hidden md:table-cell">Pending</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right hidden lg:table-cell">Terminated</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right">Active AP</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right hidden lg:table-cell">Avg AP</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right">MTD Policies</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right hidden md:table-cell">MTD AP</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right">At Risk</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right hidden lg:table-cell">Retention</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentBreakdownLoading ? (
                    <TableRow><TableCell colSpan={11} className="py-8 text-center"><div className="h-6 w-48 mx-auto rounded shimmer" /></TableCell></TableRow>
                  ) : sortedAgentBreakdown.length === 0 ? (
                    <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground text-sm">No agents found</TableCell></TableRow>
                  ) : (
                    sortedAgentBreakdown.map(agent => (
                      <TableRow key={agent.agent_id} className="hover:bg-background transition-colors">
                        <TableCell className="py-3">
                          <span className="font-medium text-foreground truncate block max-w-[200px]">
                            {agent.agent_name || agent.agent_id}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-data text-sm">
                          {fmtNum(agent.total_policies)}
                        </TableCell>
                        <TableCell className="text-right font-data text-sm">
                          <span className="text-emerald-400 font-medium">{fmtNum(agent.active_policies)}</span>
                        </TableCell>
                        <TableCell className="text-right text-amber-400 font-data text-sm hidden md:table-cell">
                          {agent.pending_policies > 0 ? fmtNum(agent.pending_policies) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-data text-sm hidden lg:table-cell">
                          {agent.terminated_policies > 0 ? fmtNum(agent.terminated_policies) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-foreground/80 font-medium font-data text-sm">
                          {fmt$(agent.active_annual_premium)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-data text-sm hidden lg:table-cell">
                          {fmt$(agent.avg_annual_premium)}
                        </TableCell>
                        <TableCell className="text-right text-foreground font-data font-medium text-sm">
                          {fmtNum(agent.policies_this_month)}
                        </TableCell>
                        <TableCell className="text-right text-foreground/80 font-data text-sm hidden md:table-cell">
                          {fmt$(agent.ap_this_month)}
                        </TableCell>
                        <TableCell className={`text-right font-data text-sm ${
                          agent.at_risk_policies > 0 ? 'text-red-400 font-medium' : 'text-muted-foreground'
                        }`}>
                          {agent.at_risk_policies > 0 ? fmtNum(agent.at_risk_policies) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-data text-sm hidden lg:table-cell">
                          {agent.retention_pct !== null ? (
                            <span className={agent.retention_pct >= 90 ? 'text-emerald-400' : agent.retention_pct >= 70 ? 'text-amber-400' : 'text-red-400'}>
                              {agent.retention_pct}%
                            </span>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            ) : (
              /* ── Agency-level breakdown table (org-wide, no agency selected) ── */
              <Table>
                <TableHeader>
                  <TableRow className="bg-background">
                    <TableHead className="font-semibold text-xs text-muted-foreground min-w-[180px]">Agency</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right">Total</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right">Active</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right hidden md:table-cell">Pending</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right hidden lg:table-cell">Terminated</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right">Active AP</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right hidden lg:table-cell">Avg AP</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right">MTD Policies</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right hidden md:table-cell">MTD AP</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right hidden sm:table-cell">vs Last Mo</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right">At Risk</TableHead>
                    <TableHead className="font-semibold text-xs text-muted-foreground text-right hidden lg:table-cell">At-Risk AP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAgencies.filter(a => a.active_policies > 0 || a.policies_this_month > 0).map(agency => {
                    return (
                      <TableRow key={agency.agency_id} className="cursor-pointer group hover:bg-background transition-colors">
                        <TableCell className="py-3">
                          <Link
                            to={`/production/${agency.agency_id}`}
                            className="font-medium text-foreground truncate block max-w-[200px] group-hover:text-primary transition-colors"
                          >
                            {agency.agency_name || agency.agency_id}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-data text-sm">
                          {fmtNum(agency.total_policies)}
                        </TableCell>
                        <TableCell className="text-right font-data text-sm">
                          <span className="text-emerald-400 font-medium">{fmtNum(agency.active_policies)}</span>
                        </TableCell>
                        <TableCell className="text-right text-amber-400 font-data text-sm hidden md:table-cell">
                          {agency.pending_policies > 0 ? fmtNum(agency.pending_policies) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-data text-sm hidden lg:table-cell">
                          {agency.terminated_policies > 0 ? fmtNum(agency.terminated_policies) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-foreground/80 font-medium font-data text-sm">
                          {fmt$(Number(agency.active_annual_premium))}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-data text-sm hidden lg:table-cell">
                          {fmt$(Number(agency.avg_annual_premium))}
                        </TableCell>
                        <TableCell className="text-right text-foreground font-data font-medium text-sm">
                          {fmtNum(agency.policies_this_month)}
                        </TableCell>
                        <TableCell className="text-right text-foreground/80 font-data text-sm hidden md:table-cell">
                          {fmt$(Number(agency.ap_this_month))}
                        </TableCell>
                        <TableCell className="text-right hidden sm:table-cell">
                          <DeltaBadge
                            current={agency.policies_this_month}
                            previous={agency.policies_last_month}
                          />
                        </TableCell>
                        <TableCell className={`text-right font-data text-sm ${
                          agency.at_risk_policies > 0 ? 'text-red-400 font-medium' : 'text-muted-foreground'
                        }`}>
                          {agency.at_risk_policies > 0 ? fmtNum(agency.at_risk_policies) : '—'}
                        </TableCell>
                        <TableCell className={`text-right font-data text-sm hidden lg:table-cell ${
                          agency.at_risk_policies > 0 ? 'text-red-400/80' : 'text-muted-foreground'
                        }`}>
                          {agency.at_risk_policies > 0 ? fmt$(Number(agency.at_risk_annual_premium || 0)) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {sortedAgencies.filter(a => a.active_policies > 0 || a.policies_this_month > 0).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      {search ? `No agencies matching "${search}"` : 'No active agencies'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
