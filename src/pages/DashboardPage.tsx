import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HudFrame } from '@/components/ui/hud-frame';
import { StaggerContainer, StaggerItem, FadeIn, CountUp, RadialGauge } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import {
  fetchDailyProduction,
  fetchMonthlyProduction,
} from '@/lib/prod-api';
import { scopeToAgency } from '@/lib/query-helpers';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { DataFilters } from '@/components/filters/DataFilters';
import { Link, Navigate } from 'react-router-dom';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useOrgData } from '@/contexts/OrgDataCache';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldCheck, AlertTriangle, Building2, ChevronRight, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { type DatePreset, type DateRange, type TrendPoint, DEFAULT_PRESET, getDateRange, getGranularity, bucketKey, fmtBucketLabel, fmtMonth } from '@/lib/dateUtils';

// ── Types ──────────────────────────────────────────────────────────────────
interface ProductionSnap {
  policiesThisMonth: number;
  apThisMonth: number;
  policiesLastMonth: number;
  apLastMonth: number;
  trend: TrendPoint[];
}

interface DashStats {
  active_policies: number;
  active_premium: number;
  at_risk_count: number;
  at_risk_premium: number;
  retention_pct: number | null;
  agencies_below_target: number;
  total_agencies: number;
}

interface CohortPoint {
  month: string;
  hi: number | null;
  hhc: number | null;
  combined: number | null;
}

interface AgencyRisk {
  agency_id: string;
  name: string | null;
  active_policies: number;
  active_premium: number;
  at_risk_count: number;
  retention_pct: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────


function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function retentionColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground/70';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}

// ── Component ──────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { effectiveRole, effectiveAgencyId, effectiveAgencyWritingNumber, isOrgWide } = useEffectiveAuth();
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();
  const orgData = useOrgData();

  // ── Local state for date-filtered production (only when user changes date) ──
  const [localDailyProd, setLocalDailyProd] = useState<Array<{ day: string; agency_id: string; policies: number; annual_premium: number }>>([]);
  const [localMonthlyProd, setLocalMonthlyProd] = useState<Array<{ month: string; agency_id: string; policies: number; annual_premium: number }>>([]);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));
  const [dateLoading, setDateLoading] = useState(false);

  const useRpc = datePreset !== 'allTime';

  // Use org cache data for all-time; local fetch only for custom date ranges
  const rawAgencies = orgData.retentionAgencies;
  const rawDailyProd = useRpc ? localDailyProd : orgData.dailyProduction;
  const rawMonthlyProd = useRpc ? localMonthlyProd : orgData.monthlyProduction;
  const loading = orgData.initialLoading || dateLoading;

  // ── Cohort trend from cache (org-wide, not date-filtered) ──
  const trend = useMemo((): CohortPoint[] => {
    return orgData.cohorts.slice(-12).map(c => ({
      month: fmtMonth(c.month + '-01'),
      hi: null,
      hhc: null,
      combined: c.retention_pct,
    }));
  }, [orgData.cohorts]);

  // ── Agency name map from local Supabase ──
  useEffect(() => {
    if (!supabase) return;
    scopeToAgency(
      (supabase as any).from('agencies').select('tracker_id, writing_number, name'),
      isOrgWide, effectiveAgencyId, 'tracker_id'
    ).then((r: { data: any }) => {
      const nm = new Map<string, string>();
      if (r.data) {
        for (const a of r.data as any[]) {
          if (a.writing_number) nm.set(a.writing_number, a.name);
          if (a.tracker_id) nm.set(a.tracker_id, a.name);
        }
      }
      setNameMap(nm);
    });
  }, [effectiveAgencyId, isOrgWide]);

  // ── Only fetch production data when date range changes from all-time ──
  useEffect(() => {
    if (!useRpc) {
      setLocalDailyProd([]);
      setLocalMonthlyProd([]);
      return;
    }
    const agencyParam = !isOrgWide && effectiveAgencyWritingNumber
      ? { agency_id: effectiveAgencyWritingNumber } : {};
    const startDateStr = dateRange.startDate.split('T')[0];
    const endDateStr = dateRange.endDate.split('T')[0];
    setDateLoading(true);
    fetchDailyProduction({ ...agencyParam, start_date: startDateStr, end_date: endDateStr })
      .then(data => {
        setLocalDailyProd(data);
        setLocalMonthlyProd([]);
        setDateLoading(false);
      })
      .catch(err => {
        console.error('Dashboard date-filtered fetch error:', err);
        setDateLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, datePreset, effectiveAgencyWritingNumber, isOrgWide]);

  // ── Detect no-data agencies (no writing_number) ──
  const noDataAgency = filterAgencyId?.startsWith('no-data:') ?? false;

  // ── Derive stats from raw data, filtered by agency (instant) ──
  const stats = useMemo((): DashStats | null => {
    if (orgData.initialLoading) return null;
    if (noDataAgency) return {
      active_policies: 0, active_premium: 0, at_risk_count: 0, at_risk_premium: 0,
      retention_pct: null, agencies_below_target: 0, total_agencies: 0,
    };

    const agencies = filterAgencyId
      ? rawAgencies.filter(a => a.agency_id === filterAgencyId)
      : rawAgencies;

    let totalActive = 0, totalPremium = 0, totalAtRisk = 0;
    let totalRetained = 0, totalEligible = 0;
    let belowTarget = 0;
    for (const a of agencies) {
      totalActive += a.active_policies;
      totalPremium += a.active_premium;
      totalAtRisk += a.at_risk_count;
      totalRetained += a.retained_90d;
      totalEligible += a.eligible_90d;
      if (a.retention_pct !== null && a.retention_pct < 90) belowTarget++;
    }
    const totalAtRiskPremium = totalPremium > 0 && totalActive > 0
      ? Math.round((totalAtRisk * (totalPremium / totalActive)) * 100) / 100 : 0;
    const overallRetention = totalEligible > 0
      ? Math.round((totalRetained / totalEligible) * 1000) / 10 : null;

    return {
      active_policies: totalActive,
      active_premium: totalPremium,
      at_risk_count: totalAtRisk,
      at_risk_premium: totalAtRiskPremium,
      retention_pct: overallRetention,
      agencies_below_target: belowTarget,
      total_agencies: agencies.length,
    };
  }, [orgData.initialLoading, noDataAgency, filterAgencyId, rawAgencies]);

  // ── Bottom agencies (coaching signals) — filtered + sorted ──
  const bottomAgencies = useMemo((): AgencyRisk[] => {
    if (orgData.initialLoading || noDataAgency) return [];
    const agencies = filterAgencyId
      ? rawAgencies.filter(a => a.agency_id === filterAgencyId)
      : rawAgencies;
    return agencies
      .filter(a => a.retention_pct !== null)
      .map(a => ({
        agency_id: a.agency_id,
        name: nameMap.get(a.agency_id) ?? null,
        active_policies: a.active_policies,
        active_premium: a.active_premium,
        at_risk_count: a.at_risk_count,
        retention_pct: a.retention_pct,
      }))
      .sort((a, b) => (a.retention_pct ?? 100) - (b.retention_pct ?? 100))
      .slice(0, 8);
  }, [orgData.initialLoading, noDataAgency, filterAgencyId, rawAgencies, nameMap]);

  // ── Production snapshot — filtered by agency ──
  const production = useMemo((): ProductionSnap | null => {
    if (orgData.initialLoading) return null;
    if (noDataAgency) return { policiesThisMonth: 0, apThisMonth: 0, policiesLastMonth: 0, apLastMonth: 0, trend: [] };

    const gran = getGranularity(dateRange);

    if (rawDailyProd.length > 0) {
      const filtered = filterAgencyId
        ? rawDailyProd.filter(r => r.agency_id === filterAgencyId)
        : rawDailyProd;
      const byBucket = new Map<string, { policies: number; ap: number }>();
      filtered.forEach(r => {
        const key = bucketKey(r.day, gran);
        const existing = byBucket.get(key) || { policies: 0, ap: 0 };
        existing.policies += r.policies;
        existing.ap += r.annual_premium;
        byBucket.set(key, existing);
      });
      const trendArr: TrendPoint[] = Array.from(byBucket.entries())
        .map(([b, v]) => ({ bucket: b, label: fmtBucketLabel(b, gran), policies: v.policies, ap: v.ap }))
        .sort((a, b) => a.bucket.localeCompare(b.bucket));
      const totalPolicies = filtered.reduce((s, r) => s + r.policies, 0);
      const totalAp = filtered.reduce((s, r) => s + r.annual_premium, 0);
      return { policiesThisMonth: totalPolicies, apThisMonth: totalAp, policiesLastMonth: 0, apLastMonth: 0, trend: trendArr };
    }

    // All-time fallback: monthly data
    const filtered = filterAgencyId
      ? rawMonthlyProd.filter(r => r.agency_id === filterAgencyId)
      : rawMonthlyProd;
    const byMonth = new Map<string, { policies: number; ap: number }>();
    for (const r of filtered) {
      const existing = byMonth.get(r.month) || { policies: 0, ap: 0 };
      existing.policies += r.policies;
      existing.ap += r.annual_premium;
      byMonth.set(r.month, existing);
    }
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
    const thisM = byMonth.get(thisMonthKey) || { policies: 0, ap: 0 };
    const lastM = byMonth.get(lastMonthKey) || { policies: 0, ap: 0 };
    const trendArr: TrendPoint[] = Array.from(byMonth.entries())
      .map(([month, v]) => ({ bucket: month, label: fmtMonth(month), policies: v.policies, ap: v.ap }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket))
      .slice(-6);
    return {
      policiesThisMonth: thisM.policies, apThisMonth: thisM.ap,
      policiesLastMonth: lastM.policies, apLastMonth: lastM.ap,
      trend: trendArr,
    };
  }, [orgData.initialLoading, noDataAgency, filterAgencyId, rawDailyProd, rawMonthlyProd, dateRange]);

  const s = stats;

  // Agents don't get the org/agency dashboard — redirect AFTER all hooks.
  if (effectiveRole === 'agent') {
    return <Navigate to="/my-health" replace />;
  }

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">

        {/* Filters */}
        <DataFilters
          showAgencyFilter={showAgencyFilter}
          showTimePeriod
          selectedAgencyId={filterAgencyId}
          selectedPreset={datePreset}
          selectedDateRange={dateRange}
          onAgencyChange={setFilterAgencyId}
          onDateRangeChange={(range, preset) => { setDateRange(range); setDatePreset(preset); }}
        />

        {/* No production data banner for agencies without writing_number */}
        {noDataAgency && !loading && (
          <FadeIn>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={18} className="text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-300">No production data available</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This agency hasn't started writing with UNL yet. Production data will appear once their first policies are issued.
                </p>
              </div>
            </div>
          </FadeIn>
        )}

        {/* ── KPI strip with HUD frames + animations ── */}
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Policies */}
          <StaggerItem>
            <HudFrame>
              <Card className="border-border">
                <CardContent className="p-5">
                  {loading ? (
                    <div className="h-14 rounded shimmer" />
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Active Policies</p>
                        <CountUp
                          end={s?.active_policies ?? 0}
                          className="text-2xl font-bold text-foreground mt-1 block"
                        />
                        {s && <p className="text-xs text-muted-foreground/70 mt-0.5 font-data">{fmt$(s.active_premium)}/mo premium</p>}
                      </div>
                      <div className="p-2.5 rounded-lg bg-cyan-500/10">
                        <ShieldCheck size={20} className="text-primary" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>

          {/* 90-Day Retention — radial gauge */}
          <StaggerItem>
            <HudFrame accentColor={
              s?.retention_pct !== null && (s?.retention_pct ?? 0) >= 90
                ? 'hsl(142 71% 45% / 0.5)'
                : 'hsl(38 92% 50% / 0.5)'
            }>
              <Card className="border-border">
                <CardContent className="p-5">
                  {loading ? (
                    <div className="h-14 rounded shimmer" />
                  ) : (
                    <div className="flex items-center gap-4">
                      <RadialGauge
                        value={s?.retention_pct ?? 0}
                        label="90-day"
                        size={90}
                        strokeWidth={8}
                      />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">90-Day Retention</p>
                        <p className={`text-xs mt-1 ${s?.retention_pct !== null && (s?.retention_pct ?? 0) >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {s?.retention_pct !== null && (s?.retention_pct ?? 0) >= 90 ? 'On target ≥ 90%' : 'Below 90% target'}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>

          {/* At-Risk Policies */}
          <StaggerItem>
            <HudFrame accentColor="hsl(0 84% 60% / 0.5)">
              <Card className="border-border">
                <CardContent className="p-5">
                  {loading ? (
                    <div className="h-14 rounded shimmer" />
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">At-Risk Policies</p>
                        <CountUp
                          end={s?.at_risk_count ?? 0}
                          className="text-2xl font-bold text-foreground mt-1 block"
                        />
                        {s && s.at_risk_premium > 0 && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5 font-data">{fmt$(s.at_risk_premium)}/mo exposed</p>
                        )}
                      </div>
                      <div className="p-2.5 rounded-lg bg-red-500/10">
                        <AlertTriangle size={20} className="text-red-400" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>

          {/* Agencies Below 90% */}
          <StaggerItem>
            <HudFrame accentColor={
              s && s.agencies_below_target > 0
                ? 'hsl(0 84% 60% / 0.5)'
                : 'hsl(142 71% 45% / 0.5)'
            }>
              <Card className="border-border">
                <CardContent className="p-5">
                  {loading ? (
                    <div className="h-14 rounded shimmer" />
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{isOrgWide ? 'Agencies Below 90%' : 'Your Agency'}</p>
                        <CountUp
                          end={s?.agencies_below_target ?? 0}
                          className="text-2xl font-bold text-foreground mt-1 block"
                        />
                        {s && <p className="text-xs text-muted-foreground/70 mt-0.5">{isOrgWide ? `of ${s.total_agencies} total` : (s.agencies_below_target > 0 ? 'Below 90% target' : 'On target')}</p>}
                      </div>
                      <div className={`p-2.5 rounded-lg ${s && s.agencies_below_target > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
                        <Building2 size={20} className={s && s.agencies_below_target > 0 ? 'text-red-400' : 'text-emerald-400'} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>
        </StaggerContainer>

        {/* ── Production Snapshot ── */}
        {production && (
          <FadeIn delay={0.35}>
            <Card className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold text-foreground">Production Snapshot</CardTitle>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">This month vs last month</p>
                  </div>
                  <Link
                    to="/production"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    Full production view <ChevronRight size={12} />
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Policies This Month</p>
                    <p className="text-2xl font-bold text-foreground font-data">{production.policiesThisMonth.toLocaleString()}</p>
                    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${production.policiesThisMonth >= production.policiesLastMonth ? 'text-emerald-400' : 'text-red-400'}`}>
                      {production.policiesThisMonth >= production.policiesLastMonth ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {production.policiesLastMonth > 0 ? Math.abs(Math.round(((production.policiesThisMonth - production.policiesLastMonth) / production.policiesLastMonth) * 100)) : 100}% vs last month
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">AP This Month</p>
                    <p className="text-2xl font-bold text-foreground font-data">{fmt$(production.apThisMonth)}</p>
                    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${production.apThisMonth >= production.apLastMonth ? 'text-emerald-400' : 'text-red-400'}`}>
                      {production.apThisMonth >= production.apLastMonth ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {production.apLastMonth > 0 ? Math.abs(Math.round(((production.apThisMonth - production.apLastMonth) / production.apLastMonth) * 100)) : 100}% vs last month
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Policies Last Month</p>
                    <p className="text-xl font-semibold text-muted-foreground font-data">{production.policiesLastMonth.toLocaleString()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">AP Last Month</p>
                    <p className="text-xl font-semibold text-muted-foreground font-data">{fmt$(production.apLastMonth)}</p>
                  </div>
                </div>
                {/* Mini 6-month trend */}
                <div className="mt-4 h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={production.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                      <XAxis
                        dataKey="label"
                        stroke="hsl(215 20% 55%)"
                        fontSize={10}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid hsl(217 33% 20%)', background: 'hsl(222 47% 9%)', color: 'hsl(210 40% 98%)', fontSize: 11 }}
                        formatter={(v: number, name: string) => [name === 'policies' ? v.toLocaleString() : fmt$(v), name === 'policies' ? 'Policies' : 'AP']}
                      />
                      <Line type="monotone" dataKey="policies" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        )}

        {/* ── Retention trend chart ── */}
        <FadeIn delay={0.4}>
          <Card className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">90-Day Retention by Cohort</CardTitle>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    Monthly cohorts · HI + HHC combined and by product
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-primary rounded" /> Combined
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-violet-500 rounded" /> HI
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-sky-500 rounded" /> HHC
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-72 rounded shimmer" />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                      <XAxis dataKey="month" stroke="hsl(215 20% 55%)" fontSize={12} />
                      <YAxis domain={[70, 105]} stroke="hsl(215 20% 55%)" fontSize={12} tickFormatter={v => `${v}%`} />
                      <Tooltip
                        formatter={(v: number, name: string) => [
                          v !== null ? `${v}%` : '—',
                          name === 'combined' ? 'Combined' : name === 'hi' ? 'HI' : 'HHC',
                        ]}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid hsl(217 33% 20%)',
                          background: 'hsl(222 47% 9%)',
                          color: 'hsl(210 40% 98%)',
                          fontSize: 12,
                        }}
                      />
                      <Line type="monotone" dataKey="combined" stroke="hsl(199 89% 48%)" strokeWidth={2.5}
                        dot={{ fill: 'hsl(199 89% 48%)', r: 4, stroke: 'hsl(199 89% 48%)', strokeWidth: 0 }}
                        activeDot={{ r: 6, stroke: 'hsl(199 89% 48%)', strokeWidth: 2, fill: 'hsl(222 47% 8%)' }}
                        connectNulls />
                      <Line type="monotone" dataKey="hi" stroke="#8b5cf6" strokeWidth={1.5}
                        strokeDasharray="4 3" dot={false} connectNulls />
                      <Line type="monotone" dataKey="hhc" stroke="#0ea5e9" strokeWidth={1.5}
                        strokeDasharray="4 3" dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </FadeIn>

        {/* ── Bottom agencies coaching panel ── */}
        {!loading && bottomAgencies.length > 0 && (
          <FadeIn delay={0.6}>
            <Card className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold text-foreground">{isOrgWide ? 'Agency Coaching Signals' : 'Coaching Signal'}</CardTitle>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {isOrgWide ? 'Lowest retention agencies — sorted worst first. Below 90% = coaching needed.' : 'Your agency\'s retention status. Below 90% = coaching needed.'}
                    </p>
                  </div>
                  {stats && stats.agencies_below_target > 0 && (
                    <Badge className="bg-red-500/10 text-red-400 border-red-500/20 border">
                      {stats.agencies_below_target} below target
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/30">
                  <div className="grid grid-cols-7 gap-2 px-4 py-2 bg-secondary/30 text-xs font-semibold text-muted-foreground font-data">
                    <span className="col-span-2">Agency</span>
                    <span className="text-right">Active</span>
                    <span className="text-right">Premium/mo</span>
                    <span className="text-right">At-Risk</span>
                    <span className="text-right">Retention</span>
                    <span />
                  </div>
                  {bottomAgencies.map((a) => (
                    <div
                      key={a.agency_id}
                      className={`grid grid-cols-7 gap-2 px-4 py-2.5 text-sm items-center row-hover ${
                        a.retention_pct !== null && a.retention_pct < 90 ? 'bg-red-500/5' : ''
                      }`}
                    >
                      <span className="col-span-2 font-medium text-foreground truncate">
                        {a.name ?? <span className="font-data text-xs text-muted-foreground/70">{a.agency_id.slice(0, 8)}…</span>}
                      </span>
                      <span className="text-right text-muted-foreground font-data">{a.active_policies.toLocaleString()}</span>
                      <span className="text-right text-muted-foreground font-data">{fmt$(a.active_premium)}</span>
                      <span className={`text-right font-medium font-data ${a.at_risk_count > 0 ? 'text-red-400' : 'text-muted-foreground/70'}`}>
                        {a.at_risk_count || '—'}
                      </span>
                      <span className={`text-right font-semibold font-data ${retentionColor(a.retention_pct)}`}>
                        {a.retention_pct !== null ? `${a.retention_pct}%` : '—'}
                      </span>
                      <span className="text-center">
                        <Link to={`/agencies/${a.agency_id}`}>
                          <ChevronRight size={14} className="text-muted-foreground/40 hover:text-primary transition-colors" />
                        </Link>
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        )}
      </div>
    </div>
  );
}
