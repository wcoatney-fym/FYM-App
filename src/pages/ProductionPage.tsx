import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DeltaBadge } from '@/components/ui/delta-badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { HudFrame } from '@/components/ui/hud-frame';
import { supabase } from '@/lib/supabase';
import {
  fetchAgencyProductionWithMeta,
  fetchAgentProduction,
  fetchDailyProduction,
  fetchMonthlyOverlay,
  type AgentProduction,
  type MonthlyOverlayRow,
} from '@/lib/prod-api';
import {
  filterDailyByRange,
  aggregateAgencyProduction,
} from '@/lib/clientFilters';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { useOrgData } from '@/contexts/OrgDataCache';
import {
  Bar, Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Legend,
} from 'recharts';
import { DataFilters } from '@/components/filters/DataFilters';
import { type DatePreset, type DateRange, type DailyRow, type TrendPoint, DEFAULT_PRESET, getDateRange, getGranularity, aggregateTrend, fmtMonth } from '@/lib/dateUtils';
import { fmt$, fmtNum } from '@/lib/formatUtils';
import {
  TrendingUp, DollarSign, FileText, Building2, Search, Download,
  ArrowUp, ArrowDown, ShieldAlert, TrendingDown, AlertTriangle, RefreshCw, CalendarClock,
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

  // Monthly overlay: submitted (app_recvd_date) vs issued (issue_date)
  const [overlayData, setOverlayData] = useState<MonthlyOverlayRow[]>([]);

  // Local state for date-filtered data (only when user picks a custom date range)
  const [localAgencies, setLocalAgencies] = useState<AgencyRow[]>([]);
  const [localMonthly, setLocalMonthly] = useState<RawMonthlyRow[]>([]);
  const [localDaily, setLocalDaily] = useState<DailyRow[]>([]);
  const [dateLoading, setDateLoading] = useState(false);
  // Column-header sort state (replaces fixed button group)
  type AgencySortKey = 'name' | 'total' | 'active' | 'pending' | 'terminated' | 'activeAp' | 'avgAp' | 'mtdPolicies' | 'mtdAp' | 'vsLastMo' | 'atRisk' | 'atRiskAp';
  type AgentSortKey = 'name' | 'total' | 'active' | 'pending' | 'terminated' | 'activeAp' | 'avgAp' | 'mtdPolicies' | 'mtdAp' | 'atRisk' | 'retention';
  const [agencySortKey, setAgencySortKey] = useState<AgencySortKey>('activeAp');
  const [agencySortAsc, setAgencySortAsc] = useState(false);
  const [agentSortKey, setAgentSortKey] = useState<AgentSortKey>('activeAp');
  const [agentSortAsc, setAgentSortAsc] = useState(false);
  const [search, setSearch] = useState('');
  const [agentBreakdown, setAgentBreakdown] = useState<AgentProduction[]>([]);
  const [agentBreakdownLoading, setAgentBreakdownLoading] = useState(false);
  const [filterAgentId, setFilterAgentId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));
  // Error tracking — preserve stale data on failure instead of showing misleading empty states
  const [prodError, setProdError] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  // Track whether date-filtered fetch completed (to distinguish loading vs genuinely empty)
  const [dateFilterComplete, setDateFilterComplete] = useState(false);
  // Latest app_recvd_date from prod-data — used in empty-state messages
  const [maxAppRecvdDate, setMaxAppRecvdDate] = useState<string | null>(null);

  const useRpc = datePreset !== 'allTime';

  // Fetch monthly overlay data (submitted vs issued) — runs once on mount + when agency filter changes
  useEffect(() => {
    let cancelled = false;
    const params: Record<string, string> = {};
    if (filterAgencyId) params.agency_id = filterAgencyId;
    else if (!isOrgWide && effectiveAgencyWritingNumber) params.agency_id = effectiveAgencyWritingNumber;
    fetchMonthlyOverlay(params)
      .then(data => { if (!cancelled) setOverlayData(data); })
      .catch(err => { console.error('Monthly overlay fetch error:', err); });
    return () => { cancelled = true; };
  }, [filterAgencyId, isOrgWide, effectiveAgencyWritingNumber]);

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

  // Use date-filtered local data when available.
  // When the date-filtered fetch completed with zero results, show zeros honestly
  // instead of falling back to cached all-time data with a misleading period label.
  const hasLocalData = localAgencies.length > 0;
  const dateFilteredEmpty = useRpc && dateFilterComplete && !hasLocalData;
  const agencies = useRpc
    ? (dateFilterComplete ? localAgencies : (hasLocalData ? localAgencies : cachedAgencies))
    : cachedAgencies;
  const rawMonthly = useRpc
    ? (dateFilterComplete ? localMonthly : (hasLocalData ? localMonthly : cachedMonthly))
    : cachedMonthly;
  const dailyRows = useRpc
    ? (dateFilterComplete ? localDaily : [])
    : [];
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
      setDateFilterComplete(false);
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
        issued: d.issued || 0,
      })));
      setLocalMonthly([]);
      setDateFilterComplete(true);
      return;
    }

    // Agency-scoped fallback → edge function calls
    if (!supabase) return;
    const agencyParam = !isOrgWide && effectiveAgencyWritingNumber ? { agency_id: effectiveAgencyWritingNumber } : {};
    const dateParams = { ...agencyParam, start_date: startDate, end_date: endDate };

    setDateLoading(true);
    setProdError(null);
    setDateFilterComplete(false);
    Promise.all([
      fetchAgencyProductionWithMeta(dateParams),
      fetchDailyProduction(dateParams),
    ]).then(([prodResult, dailyData]) => {
      const prodAgencies = prodResult.data;
      setMaxAppRecvdDate(prodResult.maxAppRecvdDate);
      setProdError(null);
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
        issued: d.issued || 0,
      })));
      setLocalMonthly([]);
      setDateFilterComplete(true);
      setDateLoading(false);
    }).catch(err => {
      console.error('Production date-filtered fetch error:', err);
      setProdError('Failed to load production data. Showing cached results.');
      // Don't clear local data — preserve stale values instead of showing zeros
      setDateFilterComplete(true);
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
  // Passes the selected date range so the edge function only returns
  // policies issued within that window. Agents with zero total_policies
  // in the period are excluded from the table.
  useEffect(() => {
    if (!breakdownAgencyId) {
      setAgentBreakdown([]);
      return;
    }
    let cancelled = false;
    setAgentBreakdownLoading(true);

    const params: Parameters<typeof fetchAgentProduction>[0] = {
      agency_id: breakdownAgencyId,
    };
    if (useRpc) {
      params.start_date = dateRange.startDate.split('T')[0];
      params.end_date = dateRange.endDate.split('T')[0];
    }

    setAgentError(null);
    fetchAgentProduction(params)
      .then(agents => {
        if (!cancelled) {
          setAgentError(null);
          // Only include agents who had production during the selected period
          setAgentBreakdown(agents.filter(a => a.total_policies > 0));
        }
      })
      .catch(err => {
        console.error('Agent breakdown load error:', err);
        if (!cancelled) {
          setAgentError('Failed to load agent data. Data shown may be stale.');
          // Don't clear agent breakdown — preserve stale data
        }
      })
      .finally(() => {
        if (!cancelled) setAgentBreakdownLoading(false);
      });

    return () => { cancelled = true; };
  }, [breakdownAgencyId, dateRange, useRpc]);

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
    // If we're in a date-filtered mode and the fetch completed with no data,
    // return empty — do NOT fall back to overlay/monthly data under the wrong label.
    if (useRpc && dateFilterComplete) {
      return [];
    }
    // All-time view: use overlay data (submitted vs issued by month)
    if (!useRpc && overlayData.length > 0) {
      return overlayData
        .slice(-12)
        .map(row => ({
          bucket: row.month,
          label: fmtMonth(row.month),
          policies: row.submitted_policies,
          ap: row.submitted_ap,
          issued: row.issued_policies,
        }))
        .sort((a, b) => a.bucket.localeCompare(b.bucket));
    }
    // All-time fallback: monthly production (no issued data available)
    if (!useRpc) {
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
          issued: 0,
        }))
        .sort((a, b) => a.bucket.localeCompare(b.bucket))
        .slice(-12);
    }
    return [];
  }, [dailyRows, rawMonthly, overlayData, granularity, filterAgencyId, filterAgentId, useRpc, dateFilterComplete]);


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

  // ── Book Quality stats (migrated from Financials) ──────────────────────
  const bookQualityStats = useMemo(() => {
    const sums = filterAgencyId
      ? orgData.retentionAgencies.filter(r => r.agency_id === filterAgencyId)
      : orgData.retentionAgencies;
    const totalPremium = sums.reduce((s, r) => s + r.active_premium, 0);
    const totalActive = sums.reduce((s, r) => s + r.active_policies, 0);
    const totalAtRisk = sums.reduce((s, r) => s + r.at_risk_count, 0);
    const totalRetained = sums.reduce((s, r) => s + r.retained_90d, 0);
    const totalEligible = sums.reduce((s, r) => s + r.eligible_90d, 0);
    const blendedRetention = totalEligible > 0 ? Math.round((totalRetained / totalEligible) * 1000) / 10 : null;
    const flaggedConcentration = orgData.retentionAgencies.filter(r => {
      const total = orgData.retentionAgencies.reduce((s2, r2) => s2 + r2.active_premium, 0);
      return total > 0 && (r.active_premium / total) >= 0.1;
    });

    // Product-level stats (HI vs HHC)
    const latestByProduct: Record<string, { active: number; premium: number; retention: number | null }> = {};
    for (const ps of orgData.productSummary) {
      if (ps.product_type === 'HI' || ps.product_type === 'HHC') {
        latestByProduct[ps.product_type] = {
          active: ps.active_policies,
          premium: ps.active_premium,
          retention: ps.retention_pct,
        };
      }
    }

    return { totalPremium, totalActive, totalAtRisk, blendedRetention, flaggedConcentration: flaggedConcentration.length, latestByProduct };
  }, [orgData.retentionAgencies, orgData.productSummary, filterAgencyId]);

  // Cohort retention chart data (HI vs HHC, last 12 months)
  const retentionChartData = useMemo(() => {
    const productCohorts = orgData.productCohorts ?? [];
    const months = [...new Set(productCohorts.map(c => c.month))].sort().slice(-12);
    return months.map(month => {
      const hi = productCohorts.find(c => c.month === month && c.product_type === 'HI');
      const hhc = productCohorts.find(c => c.month === month && c.product_type === 'HHC');
      return {
        month: new Date(month).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
        HI: hi?.retention_pct ?? null,
        HHC: hhc?.retention_pct ?? null,
        target: 90,
      };
    });
  }, [orgData.productCohorts]);

  function retentionColor(pct: number | null) {
    if (pct === null) return 'text-muted-foreground';
    if (pct >= 90) return 'text-emerald-400';
    if (pct >= 85) return 'text-amber-400';
    return 'text-red-400';
  }
  function retentionBadgeClass(pct: number) {
    if (pct >= 90) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (pct >= 85) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-red-500/10 text-red-400 border-red-500/20';
  }

  const searchedAgencies = useMemo(() => {
    if (!search) return filteredAgencies;
    const q = search.toLowerCase();
    return filteredAgencies.filter(a =>
      (a.agency_name ?? a.agency_id).toLowerCase().includes(q)
    );
  }, [filteredAgencies, search]);

  // Sort handler for agency columns
  function handleAgencySort(key: AgencySortKey) {
    if (agencySortKey === key) {
      setAgencySortAsc(!agencySortAsc);
    } else {
      setAgencySortKey(key);
      setAgencySortAsc(key === 'name'); // name defaults ascending, numbers descending
    }
  }

  // Sort handler for agent columns
  function handleAgentSort(key: AgentSortKey) {
    if (agentSortKey === key) {
      setAgentSortAsc(!agentSortAsc);
    } else {
      setAgentSortKey(key);
      setAgentSortAsc(key === 'name');
    }
  }

  // Sort indicator component
  function SortIndicator({ active, asc }: { active: boolean; asc: boolean }) {
    if (!active) return null;
    return asc
      ? <ArrowUp size={12} className="inline ml-0.5 text-primary" />
      : <ArrowDown size={12} className="inline ml-0.5 text-primary" />;
  }

  const sortedAgencies = useMemo(() => {
    const arr = [...searchedAgencies];
    const dir = agencySortAsc ? 1 : -1;
    arr.sort((a, b) => {
      switch (agencySortKey) {
        case 'name': return dir * (a.agency_name ?? a.agency_id).localeCompare(b.agency_name ?? b.agency_id);
        case 'total': return dir * (a.total_policies - b.total_policies);
        case 'active': return dir * (a.active_policies - b.active_policies);
        case 'pending': return dir * (a.pending_policies - b.pending_policies);
        case 'terminated': return dir * (a.terminated_policies - b.terminated_policies);
        case 'activeAp': return dir * (Number(a.active_annual_premium) - Number(b.active_annual_premium));
        case 'avgAp': return dir * (Number(a.avg_annual_premium) - Number(b.avg_annual_premium));
        case 'mtdPolicies': return dir * (a.policies_this_month - b.policies_this_month);
        case 'mtdAp': return dir * (Number(a.ap_this_month) - Number(b.ap_this_month));
        case 'vsLastMo': {
          const gA = a.policies_last_month > 0 ? (a.policies_this_month - a.policies_last_month) / a.policies_last_month : a.policies_this_month > 0 ? 1 : 0;
          const gB = b.policies_last_month > 0 ? (b.policies_this_month - b.policies_last_month) / b.policies_last_month : b.policies_this_month > 0 ? 1 : 0;
          return dir * (gA - gB);
        }
        case 'atRisk': return dir * (a.at_risk_policies - b.at_risk_policies);
        case 'atRiskAp': return dir * (Number(a.at_risk_annual_premium || 0) - Number(b.at_risk_annual_premium || 0));
        default: return 0;
      }
    });
    return arr;
  }, [searchedAgencies, agencySortKey, agencySortAsc]);

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
    const dir = agentSortAsc ? 1 : -1;
    arr.sort((a, b) => {
      switch (agentSortKey) {
        case 'name': return dir * (a.agent_name ?? a.agent_id).localeCompare(b.agent_name ?? b.agent_id);
        case 'total': return dir * (a.total_policies - b.total_policies);
        case 'active': return dir * (a.active_policies - b.active_policies);
        case 'pending': return dir * (a.pending_policies - b.pending_policies);
        case 'terminated': return dir * (a.terminated_policies - b.terminated_policies);
        case 'activeAp': return dir * (a.active_annual_premium - b.active_annual_premium);
        case 'avgAp': return dir * (a.avg_annual_premium - b.avg_annual_premium);
        case 'mtdPolicies': return dir * (a.policies_this_month - b.policies_this_month);
        case 'mtdAp': return dir * (Number(a.ap_this_month) - Number(b.ap_this_month));
        case 'atRisk': return dir * (a.at_risk_policies - b.at_risk_policies);
        case 'retention': return dir * ((a.retention_pct ?? -1) - (b.retention_pct ?? -1));
        default: return 0;
      }
    });
    return arr;
  }, [agentBreakdown, search, agentSortKey, agentSortAsc]);

  // Whether to show agent-level breakdown vs agency-level
  const showAgentBreakdown = !!breakdownAgencyId;

  // CSV export — exports whichever table is currently displayed
  const handleExport = () => {
    const escCsv = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };

    let headers: string[];
    let csvRows: (string | number)[][];
    let filename: string;

    if (showAgentBreakdown) {
      // Agent breakdown view
      if (sortedAgentBreakdown.length === 0) return;
      headers = ['Agent', 'Total', 'Active', 'Pending', 'Terminated', 'Active AP', 'Avg AP', 'MTD Policies', 'MTD AP', 'At Risk', 'Retention'];
      csvRows = sortedAgentBreakdown.map(a => [
        escCsv(a.agent_name ?? a.agent_id),
        a.total_policies,
        a.active_policies,
        a.pending_policies,
        a.terminated_policies,
        Math.round(a.active_annual_premium),
        Math.round(a.avg_annual_premium),
        a.policies_this_month,
        Math.round(Number(a.ap_this_month)),
        a.at_risk_policies,
        a.retention_pct !== null && a.retention_pct !== undefined ? `${a.retention_pct}%` : '',
      ]);
      filename = `fym-agent-breakdown-${new Date().toISOString().slice(0, 10)}.csv`;
    } else {
      // Agency breakdown view
      const activeAgencies = sortedAgencies.filter(a => a.active_policies > 0);
      if (activeAgencies.length === 0) return;
      headers = ['Agency', 'Total Policies', 'Active', 'Pending', 'Terminated', 'Active AP', 'Avg AP', 'MTD Policies', 'MTD AP', 'Last Mo Policies', 'At Risk', 'At-Risk AP'];
      csvRows = activeAgencies.map(a => [
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
      filename = `fym-production-${new Date().toISOString().slice(0, 10)}.csv`;
    }

    const csv = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
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

        {/* Error banner — production data fetch failed */}
        {(prodError || orgData.fetchError) && !dateLoading && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center gap-3">
            <AlertTriangle size={18} className="text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">{prodError || orgData.fetchError}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Data shown may be stale. Check your connection and refresh.</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Refresh page"
              title="Refresh page"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        )}

        {/* Zero-state banner — date-filtered query returned no data (e.g. start of month) */}
        {dateFilteredEmpty && !prodError && !orgData.fetchError && !dateLoading && (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-center gap-3">
            <CalendarClock size={18} className="text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                No production data for {dateRange.label} yet
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {maxAppRecvdDate
                  ? `Latest data through ${new Date(maxAppRecvdDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — new applications typically appear within a day or two of month start.`
                  : 'New applications typically appear within a day or two of month start.'}
              </p>
            </div>
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

        {/* Production Trend Chart — Policies Sold vs Effectuated */}
        <Card className="border-border">
          <CardHeader>
            <div>
              <CardTitle className="text-base text-foreground">
                Production — {dateRange.label}{granularity === 'day' ? ' (Daily)' : granularity === 'week' ? ' (Weekly)' : ' (Monthly)'}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Bars = policies sold (by app received date) · Line = policies effectuated (by issue date)</p>
            </div>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="h-72">
              {filteredTrend.length > 0 ? (
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
                        fmtNum(value),
                        name === 'policies' ? 'Policies Sold' : 'Policies Effectuated',
                      ]}
                      labelFormatter={(label: string) => label}
                    />
                    <Legend
                      formatter={(value: string) => value === 'policies' ? 'Policies Sold' : 'Policies Effectuated'}
                      wrapperStyle={{ color: 'hsl(215 20% 65%)' }}
                    />
                    <Bar
                      dataKey="policies"
                      fill="hsl(199 89% 48%)"
                      fillOpacity={0.4}
                      stroke="hsl(199 89% 48%)"
                      radius={[3, 3, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="issued"
                      stroke="hsl(142 71% 45%)"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: 'hsl(142 71% 45%)' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <CalendarClock size={32} className="mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No chart data for {dateRange.label}
                    </p>
                    {maxAppRecvdDate && (
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Latest data through {new Date(maxAppRecvdDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>



        {/* ── Book Quality Section (migrated from Financials) ── */}
        {isOrgWide && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <ShieldAlert size={18} className="text-amber-400" />
              Book Quality
            </h2>

            {/* Financial KPI strip */}
            <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  title: 'Active Premium',
                  end: bookQualityStats.totalPremium,
                  fmt: (n: number) => fmt$(n) + '/mo',
                  sub: `${bookQualityStats.totalActive.toLocaleString()} policies`,
                  icon: DollarSign, color: 'text-primary', bg: 'bg-cyan-500/10',
                },
                {
                  title: 'At-Risk Premium',
                  end: bookQualityStats.totalAtRisk,
                  fmt: (n: number) => n.toLocaleString(),
                  sub: 'policies flagged',
                  icon: ShieldAlert,
                  color: bookQualityStats.totalAtRisk > 0 ? 'text-red-400' : 'text-muted-foreground',
                  bg: bookQualityStats.totalAtRisk > 0 ? 'bg-red-500/10' : 'bg-secondary',
                },
                {
                  title: 'Blended Retention',
                  end: bookQualityStats.blendedRetention ?? 0,
                  fmt: (n: number) => bookQualityStats.blendedRetention !== null ? `${n.toFixed(1)}%` : '—',
                  sub: '90-day, all products',
                  icon: TrendingDown,
                  color: bookQualityStats.blendedRetention !== null ? retentionColor(bookQualityStats.blendedRetention) : 'text-muted-foreground',
                  bg: bookQualityStats.blendedRetention !== null && bookQualityStats.blendedRetention >= 90 ? 'bg-emerald-500/10' : 'bg-amber-500/10',
                },
                {
                  title: 'Concentration Risk',
                  end: bookQualityStats.flaggedConcentration,
                  fmt: (n: number) => n.toString(),
                  sub: 'agencies >10% of premium',
                  icon: AlertTriangle,
                  color: bookQualityStats.flaggedConcentration > 0 ? 'text-amber-400' : 'text-muted-foreground',
                  bg: bookQualityStats.flaggedConcentration > 0 ? 'bg-amber-500/10' : 'bg-secondary',
                },
              ].map(card => (
                <StaggerItem key={card.title}>
                  <Card className="border-border">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                          <CountUp
                            end={card.end}
                            format={card.fmt}
                            className="text-2xl font-bold text-foreground mt-1 block"
                          />
                          <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
                        </div>
                        <div className={`p-2.5 rounded-lg ${card.bg}`}>
                          <card.icon size={20} className={card.color} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </StaggerContainer>

            {/* Product breakdown cards (HI vs HHC) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(bookQualityStats.latestByProduct)
                .filter(([pt]) => ['HI', 'HHC'].includes(pt))
                .sort(([, a], [, b]) => b.premium - a.premium)
                .map(([pt, data]) => (
                  <Card key={pt} className="border-border">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold text-foreground">
                          {pt === 'HHC' ? 'Home Health Care' : 'Hospital Indemnity'}
                        </CardTitle>
                        {data.retention !== null && (
                          <Badge className={`text-xs border ${retentionBadgeClass(data.retention)}`}>
                            {data.retention}% retained
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs">Active premium</p>
                          <p className="font-semibold text-foreground">{fmt$(data.premium)}<span className="font-normal text-muted-foreground">/mo</span></p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Retention</p>
                          <p className={`font-semibold ${retentionColor(data.retention)}`}>
                            {data.retention !== null ? `${data.retention}%` : '—'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>

            {/* 90-Day Retention by Cohort chart */}
            {retentionChartData.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <div>
                    <CardTitle className="text-base font-semibold text-foreground">90-Day Retention by Cohort</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Monthly cohorts · HI vs HHC · red dashed line = 90% target</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={retentionChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                        <XAxis dataKey="month" stroke="hsl(215 20% 55%)" fontSize={11} />
                        <YAxis domain={[0, 105]} stroke="hsl(215 20% 55%)" fontSize={11} tickFormatter={(v: number) => `${v}%`} />
                        <Tooltip
                          formatter={(v: number, name: string) => [
                            v !== null ? `${v}%` : '—',
                            name === 'target' ? '90% Target' : name,
                          ]}
                          contentStyle={{ borderRadius: '8px', border: '1px solid hsl(217 33% 20%)', background: 'hsl(222 47% 9%)', color: 'hsl(210 40% 98%)', fontSize: 12 }}
                        />
                        <Line type="monotone" dataKey="HI" stroke="hsl(262 83% 58%)" strokeWidth={2.5} dot={{ r: 3, fill: 'hsl(262 83% 58%)' }} connectNulls />
                        <Line type="monotone" dataKey="HHC" stroke="hsl(199 89% 48%)" strokeWidth={2.5} dot={{ r: 3, fill: 'hsl(199 89% 48%)' }} connectNulls />
                        <Line type="monotone" dataKey="target" stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

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
                    <TableHead className="min-w-[180px]">
                      <button onClick={() => handleAgentSort('name')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Agent<SortIndicator active={agentSortKey === 'name'} asc={agentSortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleAgentSort('total')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Total<SortIndicator active={agentSortKey === 'total'} asc={agentSortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleAgentSort('active')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Active<SortIndicator active={agentSortKey === 'active'} asc={agentSortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right hidden md:table-cell">
                      <button onClick={() => handleAgentSort('pending')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Pending<SortIndicator active={agentSortKey === 'pending'} asc={agentSortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right hidden lg:table-cell">
                      <button onClick={() => handleAgentSort('terminated')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Terminated<SortIndicator active={agentSortKey === 'terminated'} asc={agentSortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleAgentSort('activeAp')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Active AP<SortIndicator active={agentSortKey === 'activeAp'} asc={agentSortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right hidden lg:table-cell">
                      <button onClick={() => handleAgentSort('avgAp')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Avg AP<SortIndicator active={agentSortKey === 'avgAp'} asc={agentSortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleAgentSort('mtdPolicies')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        MTD Policies<SortIndicator active={agentSortKey === 'mtdPolicies'} asc={agentSortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right hidden md:table-cell">
                      <button onClick={() => handleAgentSort('mtdAp')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        MTD AP<SortIndicator active={agentSortKey === 'mtdAp'} asc={agentSortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleAgentSort('atRisk')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        At Risk<SortIndicator active={agentSortKey === 'atRisk'} asc={agentSortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right hidden lg:table-cell">
                      <button onClick={() => handleAgentSort('retention')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Retention<SortIndicator active={agentSortKey === 'retention'} asc={agentSortAsc} />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentBreakdownLoading ? (
                    <TableRow><TableCell colSpan={11} className="py-8 text-center"><div className="h-6 w-48 mx-auto rounded shimmer" /></TableCell></TableRow>
                  ) : !agentError && sortedAgentBreakdown.length === 0 ? (
                    <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground text-sm">No agents found</TableCell></TableRow>
                  ) : agentError && sortedAgentBreakdown.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="py-8 text-center">
                        <AlertTriangle size={24} className="mx-auto text-destructive mb-2 opacity-70" />
                        <p className="text-sm font-medium text-destructive">{agentError}</p>
                        <p className="text-xs text-muted-foreground mt-1">Check your connection and refresh.</p>
                      </TableCell>
                    </TableRow>
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
                    <TableHead className="min-w-[180px]">
                      <button onClick={() => handleAgencySort('name')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Agency<SortIndicator active={agencySortKey === 'name'} asc={agencySortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleAgencySort('total')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Total<SortIndicator active={agencySortKey === 'total'} asc={agencySortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleAgencySort('active')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Active<SortIndicator active={agencySortKey === 'active'} asc={agencySortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right hidden md:table-cell">
                      <button onClick={() => handleAgencySort('pending')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Pending<SortIndicator active={agencySortKey === 'pending'} asc={agencySortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right hidden lg:table-cell">
                      <button onClick={() => handleAgencySort('terminated')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Terminated<SortIndicator active={agencySortKey === 'terminated'} asc={agencySortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleAgencySort('activeAp')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Active AP<SortIndicator active={agencySortKey === 'activeAp'} asc={agencySortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right hidden lg:table-cell">
                      <button onClick={() => handleAgencySort('avgAp')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Avg AP<SortIndicator active={agencySortKey === 'avgAp'} asc={agencySortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleAgencySort('mtdPolicies')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        MTD Policies<SortIndicator active={agencySortKey === 'mtdPolicies'} asc={agencySortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right hidden md:table-cell">
                      <button onClick={() => handleAgencySort('mtdAp')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        MTD AP<SortIndicator active={agencySortKey === 'mtdAp'} asc={agencySortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right hidden sm:table-cell">
                      <button onClick={() => handleAgencySort('vsLastMo')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        vs Last Mo<SortIndicator active={agencySortKey === 'vsLastMo'} asc={agencySortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleAgencySort('atRisk')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        At Risk<SortIndicator active={agencySortKey === 'atRisk'} asc={agencySortAsc} />
                      </button>
                    </TableHead>
                    <TableHead className="text-right hidden lg:table-cell">
                      <button onClick={() => handleAgencySort('atRiskAp')} className="font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors">
                        At-Risk AP<SortIndicator active={agencySortKey === 'atRiskAp'} asc={agencySortAsc} />
                      </button>
                    </TableHead>
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
                    <TableCell colSpan={12} className="text-center py-8">
                      {prodError || orgData.fetchError ? (
                        <>
                          <AlertTriangle size={24} className="mx-auto text-destructive mb-2 opacity-70" />
                          <p className="text-sm font-medium text-destructive">Failed to load agency data</p>
                          <p className="text-xs text-muted-foreground mt-1">Check your connection and refresh.</p>
                        </>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          {search ? `No agencies matching "${search}"` : 'No active agencies'}
                        </span>
                      )}
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
