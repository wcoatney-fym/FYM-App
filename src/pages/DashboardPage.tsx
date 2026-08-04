/**
 * DashboardPage — Org/agency dashboard.
 *
 * Refactored from 781-line monolith into composed widget components:
 *   - KpiStrip: top-level KPI cards
 *   - ProductionSnapshot: status breakdown + trend
 *   - QualityCard: locked quality metrics (PRD §12.7)
 *   - RetentionTrendChart: cohort retention with 90% target line
 *   - CoachingPanel: bottom-retention agencies
 *   - DashboardErrorBanner: edge fn error state with retry
 *   - DashboardCustomizer: widget visibility/ordering
 *
 * UX audit fixes applied:
 *   1. Accessibility: aria-labels, roles, keyboard nav
 *   2. Error states: banner when fetch fails, retry button
 *   3. "Last updated" timestamp so users know data freshness
 *   4. Contrast: removed /70 opacity on subtitle text
 *   5. prefers-reduced-motion: handled in animated.tsx
 *   6. Decomposition: this file → ~300 lines down from ~780
 */
import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { FadeIn } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import {
  fetchDailyProduction,
  fetchAgencyProduction,
  type AgencyProduction,
} from '@/lib/prod-api';
import { scopeToAgency } from '@/lib/query-helpers';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { DataFilters } from '@/components/filters/DataFilters';
import { Navigate } from 'react-router-dom';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useOrgData } from '@/contexts/OrgDataCache';
import { AlertTriangle, LayoutDashboard, Clock } from 'lucide-react';
import { QualityCard } from '@/components/dashboard/QualityCard';
import { KpiStrip } from '@/components/dashboard/KpiStrip';
import { ProductionSnapshot } from '@/components/dashboard/ProductionSnapshot';
import { RetentionTrendChart } from '@/components/dashboard/RetentionTrendChart';
import { CoachingPanel } from '@/components/dashboard/CoachingPanel';
import { DashboardErrorBanner } from '@/components/dashboard/DashboardErrorBanner';
import { DashboardCustomizer } from '@/components/dashboard/DashboardCustomizer';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';
import { PeriodPills } from '@/components/filters/PeriodPills';
import {
  type DatePreset,
  type DateRange,
  type TrendPoint,
  DEFAULT_PRESET,
  getDateRange,
  getPreviousPeriod,
  getGranularity,
  bucketKey,
  fmtBucketLabel,
  fmtMonth,
} from '@/lib/dateUtils';

// ── Types ──────────────────────────────────────────────────────────────────
interface DashStats {
  active_policies: number;
  active_premium: number;
  terminated_policies: number;
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

interface StatusSnapshot {
  totalWritten: number;
  totalAP: number;
  active: number;
  activeAP: number;
  pending: number;
  pendingAP: number;
  atRisk: number;
  atRiskAP: number;
  terminated: number;
  terminatedAP: number;
  trend: TrendPoint[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatLastUpdated(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  });
}

// ── Component ──────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { effectiveRole, effectiveAgencyId, effectiveAgencyWritingNumber, isOrgWide } =
    useEffectiveAuth();
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();
  const orgData = useOrgData();
  const { widgets, isWidgetVisible, toggleWidget, reorderWidgets, resetLayout } =
    useDashboardLayout();
  const [customizerOpen, setCustomizerOpen] = useState(false);

  // ── Date-filtered production state ──
  const [localDailyProd, setLocalDailyProd] = useState<
    Array<{ day: string; agency_id: string; policies: number; annual_premium: number }>
  >([]);
  const [localMonthlyProd, setLocalMonthlyProd] = useState<
    Array<{ month: string; agency_id: string; policies: number; annual_premium: number }>
  >([]);
  const [localAgencyProd, setLocalAgencyProd] = useState<AgencyProduction[]>([]);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));
  const [_dateLoading, setDateLoading] = useState(false);
  const [comparing, setComparing] = useState(false);

  // ── Previous-period data for compare mode ──
  const [prevAgencyProd, setPrevAgencyProd] = useState<AgencyProduction[]>([]);
  const previousRange = comparing ? getPreviousPeriod(dateRange) : null;

  const useRpc = datePreset !== 'allTime';

  // Use org cache for all-time; date-filtered local data when available
  const rawAgencies = orgData.retentionAgencies;
  const hasLocalProd = localDailyProd.length > 0 || localMonthlyProd.length > 0;
  const rawDailyProd = useRpc && hasLocalProd ? localDailyProd : orgData.dailyProduction;
  const rawMonthlyProd = useRpc && hasLocalProd ? localMonthlyProd : orgData.monthlyProduction;
  const hasLocalAgencyProd = localAgencyProd.length > 0;
  const rawAgencyProd = useRpc && hasLocalAgencyProd ? localAgencyProd : orgData.agencyProduction;
  const hasAnyData =
    rawAgencies.length > 0 || rawDailyProd.length > 0 || rawMonthlyProd.length > 0;
  const loading = orgData.initialLoading && !hasAnyData;

  // ── Cohort trend from cache ──
  const trend = useMemo(
    (): CohortPoint[] =>
      orgData.cohorts.slice(-12).map((c) => ({
        month: fmtMonth(c.month + '-01'),
        hi: null,
        hhc: null,
        combined: c.retention_pct,
      })),
    [orgData.cohorts]
  );

  // ── Agency name map ──
  useEffect(() => {
    if (!supabase) return;
    scopeToAgency(
      (supabase as any).from('agencies').select('tracker_id, writing_number, name'),
      isOrgWide,
      effectiveAgencyId,
      'tracker_id'
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

  // ── Date-filtered production fetch ──
  useEffect(() => {
    if (!useRpc) {
      setLocalDailyProd([]);
      setLocalMonthlyProd([]);
      setLocalAgencyProd([]);
      return;
    }
    const agencyParam =
      !isOrgWide && effectiveAgencyWritingNumber
        ? { agency_id: effectiveAgencyWritingNumber }
        : {};
    const startDateStr = dateRange.startDate.split('T')[0];
    const endDateStr = dateRange.endDate.split('T')[0];
    setDateLoading(true);
    const dateParams = { ...agencyParam, start_date: startDateStr, end_date: endDateStr };
    Promise.all([fetchDailyProduction(dateParams), fetchAgencyProduction(dateParams)])
      .then(([dailyData, agencyData]) => {
        setLocalDailyProd(dailyData);
        setLocalMonthlyProd([]);
        setLocalAgencyProd(agencyData);
        setDateLoading(false);
      })
      .catch((err) => {
        console.error('Dashboard date-filtered fetch error:', err);
        setDateLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, datePreset, effectiveAgencyWritingNumber, isOrgWide]);

  // ── Previous-period fetch ──
  useEffect(() => {
    if (!comparing || !previousRange) {
      setPrevAgencyProd([]);
      return;
    }
    const agencyParam =
      !isOrgWide && effectiveAgencyWritingNumber
        ? { agency_id: effectiveAgencyWritingNumber }
        : {};
    const startDateStr = previousRange.startDate.split('T')[0];
    const endDateStr = previousRange.endDate.split('T')[0];
    fetchAgencyProduction({
      ...agencyParam,
      start_date: startDateStr,
      end_date: endDateStr,
    })
      .then((data) => setPrevAgencyProd(data))
      .catch((err) => console.error('Previous period fetch error:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparing, previousRange?.startDate, previousRange?.endDate, effectiveAgencyWritingNumber, isOrgWide]);

  // ── Detect no-data agencies ──
  const noDataAgency = filterAgencyId?.startsWith('no-data:') ?? false;

  // ── Derive stats ──
  const stats = useMemo((): DashStats | null => {
    if (loading) return null;
    if (noDataAgency)
      return {
        active_policies: 0,
        active_premium: 0,
        terminated_policies: 0,
        at_risk_count: 0,
        at_risk_premium: 0,
        retention_pct: null,
        agencies_below_target: 0,
        total_agencies: 0,
      };

    const agencies = filterAgencyId
      ? rawAgencies.filter((a) => a.agency_id === filterAgencyId)
      : rawAgencies;

    let totalActive = 0,
      totalPremium = 0,
      totalTerminated = 0,
      totalAtRisk = 0;
    let totalRetained = 0,
      totalEligible = 0;
    let belowTarget = 0;
    for (const a of agencies) {
      totalActive += a.active_policies;
      totalTerminated += a.terminated_policies ?? 0;
      totalPremium += a.active_premium;
      totalAtRisk += a.at_risk_count;
      totalRetained += a.retained_90d;
      totalEligible += a.eligible_90d;
      if (a.retention_pct !== null && a.retention_pct < 90) belowTarget++;
    }
    const totalAtRiskPremium =
      totalPremium > 0 && totalActive > 0
        ? Math.round(totalAtRisk * (totalPremium / totalActive) * 100) / 100
        : 0;
    const overallRetention =
      totalEligible > 0
        ? Math.round((totalRetained / totalEligible) * 1000) / 10
        : null;

    return {
      active_policies: totalActive,
      active_premium: totalPremium,
      terminated_policies: totalTerminated,
      at_risk_count: totalAtRisk,
      at_risk_premium: totalAtRiskPremium,
      retention_pct: overallRetention,
      agencies_below_target: belowTarget,
      total_agencies: agencies.length,
    };
  }, [loading, noDataAgency, filterAgencyId, rawAgencies]);

  // ── Previous-period snapshot ──
  const prevSnapshot = useMemo(() => {
    if (!comparing || prevAgencyProd.length === 0) return null;
    const agencies = filterAgencyId
      ? prevAgencyProd.filter((a) => a.agency_id === filterAgencyId)
      : prevAgencyProd;
    let totalWritten = 0,
      totalAP = 0,
      active = 0,
      atRisk = 0,
      terminated = 0;
    for (const a of agencies) {
      totalWritten += a.total_policies;
      totalAP += a.total_annual_premium ?? 0;
      active += a.active_policies;
      atRisk += a.at_risk_policies;
      terminated += a.terminated_policies;
    }
    return { totalWritten, totalAP, active, atRisk, terminated };
  }, [comparing, prevAgencyProd, filterAgencyId]);

  // ── Bottom agencies (coaching) ──
  const bottomAgencies = useMemo((): AgencyRisk[] => {
    if (loading || noDataAgency) return [];
    const agencies = filterAgencyId
      ? rawAgencies.filter((a) => a.agency_id === filterAgencyId)
      : rawAgencies;
    return agencies
      .filter((a) => a.retention_pct !== null)
      .map((a) => ({
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

  // ── Production snapshot ──
  const snapshot = useMemo((): StatusSnapshot | null => {
    if (loading) return null;
    if (noDataAgency)
      return {
        totalWritten: 0,
        totalAP: 0,
        active: 0,
        activeAP: 0,
        pending: 0,
        pendingAP: 0,
        atRisk: 0,
        atRiskAP: 0,
        terminated: 0,
        terminatedAP: 0,
        trend: [],
      };

    const agencies = filterAgencyId
      ? rawAgencyProd.filter((a) => a.agency_id === filterAgencyId)
      : rawAgencyProd;

    let totalWritten = 0,
      totalAP = 0,
      active = 0,
      activeAP = 0;
    let pending = 0,
      pendingAP = 0,
      atRisk = 0,
      atRiskAP = 0;
    let terminated = 0,
      terminatedAP = 0;
    for (const a of agencies) {
      totalWritten += a.total_policies;
      totalAP += a.total_annual_premium ?? 0;
      active += a.active_policies;
      activeAP += a.active_annual_premium ?? 0;
      pending += a.pending_policies;
      pendingAP += a.pending_annual_premium ?? 0;
      atRisk += a.at_risk_policies;
      atRiskAP += a.at_risk_annual_premium ?? 0;
      terminated += a.terminated_policies;
      terminatedAP += a.terminated_annual_premium ?? 0;
    }

    const gran = getGranularity(dateRange);
    let trendArr: TrendPoint[] = [];

    if (rawDailyProd.length > 0) {
      const filtered = filterAgencyId
        ? rawDailyProd.filter((r) => r.agency_id === filterAgencyId)
        : rawDailyProd;
      const byBucket = new Map<string, { policies: number; ap: number }>();
      filtered.forEach((r) => {
        const key = bucketKey(r.day, gran);
        const existing = byBucket.get(key) || { policies: 0, ap: 0 };
        existing.policies += r.policies;
        existing.ap += r.annual_premium;
        byBucket.set(key, existing);
      });
      trendArr = Array.from(byBucket.entries())
        .map(([b, v]) => ({
          bucket: b,
          label: fmtBucketLabel(b, gran),
          policies: v.policies,
          ap: v.ap,
        }))
        .sort((a, b) => a.bucket.localeCompare(b.bucket));
    } else if (rawMonthlyProd.length > 0) {
      const filtered = filterAgencyId
        ? rawMonthlyProd.filter((r) => r.agency_id === filterAgencyId)
        : rawMonthlyProd;
      const byMonth = new Map<string, { policies: number; ap: number }>();
      for (const r of filtered) {
        const existing = byMonth.get(r.month) || { policies: 0, ap: 0 };
        existing.policies += r.policies;
        existing.ap += r.annual_premium;
        byMonth.set(r.month, existing);
      }
      trendArr = Array.from(byMonth.entries())
        .map(([month, v]) => ({
          bucket: month,
          label: fmtMonth(month),
          policies: v.policies,
          ap: v.ap,
        }))
        .sort((a, b) => a.bucket.localeCompare(b.bucket))
        .slice(-12);
    }

    return {
      totalWritten,
      totalAP,
      active,
      activeAP,
      pending,
      pendingAP,
      atRisk,
      atRiskAP,
      terminated,
      terminatedAP,
      trend: trendArr,
    };
  }, [loading, noDataAgency, filterAgencyId, rawAgencyProd, rawDailyProd, rawMonthlyProd, dateRange]);

  // Agents don't get the org/agency dashboard — redirect AFTER all hooks.
  if (effectiveRole === 'agent') {
    return <Navigate to="/my-dashboard" replace />;
  }

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">
        {/* ── Customize button + last updated ── */}
        <div className="flex items-center justify-between -mt-2 mb--2">
          {orgData.lastUpdated && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
              <Clock size={12} />
              Updated {formatLastUpdated(orgData.lastUpdated)}
            </span>
          )}
          <button
            onClick={() => setCustomizerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            aria-label="Customize dashboard layout"
          >
            <LayoutDashboard size={14} /> Customize
          </button>
        </div>

        {/* ── Error banner ── */}
        {orgData.fetchError && (
          <DashboardErrorBanner error={orgData.fetchError} onRetry={() => orgData.refresh()} />
        )}

        {/* ── Period pills + filters ── */}
        <div className="flex items-center justify-between flex-wrap gap-3" role="toolbar" aria-label="Dashboard filters">
          <PeriodPills
            preset={datePreset}
            dateRange={dateRange}
            onChange={(range, preset) => {
              setDateRange(range);
              setDatePreset(preset);
            }}
            comparing={comparing}
            onCompareChange={setComparing}
            storageKey="dashboard"
          />
          <DataFilters
            showAgencyFilter={showAgencyFilter}
            showTimePeriod={false}
            selectedAgencyId={filterAgencyId}
            onAgencyChange={setFilterAgencyId}
          />
        </div>

        {/* ── No production data banner ── */}
        {noDataAgency && !loading && (
          <FadeIn>
            <div
              className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center gap-3"
              role="status"
            >
              <AlertTriangle size={18} className="text-amber-400 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-amber-300">
                  No production data available
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This agency hasn't started writing with UNL yet. Production data
                  will appear once their first policies are issued.
                </p>
              </div>
            </div>
          </FadeIn>
        )}

        {/* ── KPI strip ── */}
        {isWidgetVisible('kpi-strip') && (
          <KpiStrip
            loading={loading}
            stats={stats}
            isOrgWide={isOrgWide}
          />
        )}

        {/* ── Production Snapshot ── */}
        {isWidgetVisible('production-snapshot') && snapshot && (
          <ProductionSnapshot
            snapshot={snapshot}
            datePreset={datePreset}
            comparing={comparing}
            prevSnapshot={prevSnapshot}
          />
        )}

        {/* ── Quality Card (locked — always shown) ── */}
        <QualityCard filterAgencyId={filterAgencyId} loading={loading} />

        {/* ── Retention trend chart ── */}
        {isWidgetVisible('retention-trend') && (
          <RetentionTrendChart trend={trend} loading={loading} />
        )}

        {/* ── Coaching panel ── */}
        {isWidgetVisible('agencies-coaching') && !loading && (
          <CoachingPanel
            agencies={bottomAgencies}
            belowTargetCount={stats?.agencies_below_target ?? 0}
            isOrgWide={isOrgWide}
          />
        )}

        {/* Dashboard Customizer panel */}
        <DashboardCustomizer
          open={customizerOpen}
          onOpenChange={setCustomizerOpen}
          widgets={widgets}
          onToggle={toggleWidget}
          onReorder={reorderWidgets}
          onReset={resetLayout}
        />
      </div>
    </div>
  );
}
