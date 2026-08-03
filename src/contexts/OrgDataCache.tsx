/**
 * OrgDataCache — Shared edge-function data cache
 *
 * Fetches core org-wide datasets once and caches them in context so
 * page navigations don't re-fetch and flash shimmer skeletons.
 *
 * Cached datasets:
 *   - retentionSummary (agencies + org-wide retention)
 *   - retentionCohorts (monthly cohort trend)
 *   - agencyProduction (per-agency production stats)
 *   - dailyProduction (day-level production)
 *   - monthlyProduction (month-level production)
 *
 * Cache key: `${authScope}|${dateKey}` — invalidates on auth or date change.
 *
 * Pages read from cache via useOrgData(). If data is present, they
 * render immediately (no loading state). The cache refreshes silently
 * when auth/date params change.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  fetchRetentionSummary,
  fetchRetentionCohorts,
  fetchAgencyProduction,
  fetchDailyProduction,
  fetchMonthlyProduction,
  type AgencyRetentionSummary,
  type CohortEntry,
  type AgencyProduction,
  type DailyProduction,
  type MonthlyProduction,
  type RetentionSummaryResponse,
} from '@/lib/prod-api';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';

// ── Types ──────────────────────────────────────────────────────────────────

export interface OrgDataState {
  /** Per-agency retention stats from the retention-data edge fn */
  retentionAgencies: AgencyRetentionSummary[];
  /** Full retention summary response (includes org_wide) */
  retentionSummary: RetentionSummaryResponse | null;
  /** Monthly cohort entries */
  cohorts: CohortEntry[];
  /** Per-agency production stats */
  agencyProduction: AgencyProduction[];
  /** Day-level production rows (all agencies) */
  dailyProduction: DailyProduction[];
  /** Month-level production rows (all agencies) */
  monthlyProduction: MonthlyProduction[];
  /** True only on very first load — never true again after initial data arrives */
  initialLoading: boolean;
  /** Trigger a full re-fetch (e.g., after date range change) */
  refresh: (params?: { startDate?: string; endDate?: string; allTime?: boolean }) => void;
}

const defaultState: OrgDataState = {
  retentionAgencies: [],
  retentionSummary: null,
  cohorts: [],
  agencyProduction: [],
  dailyProduction: [],
  monthlyProduction: [],
  initialLoading: true,
  refresh: () => {},
};

const OrgDataContext = createContext<OrgDataState>(defaultState);

export function useOrgData() {
  return useContext(OrgDataContext);
}

// ── Provider ───────────────────────────────────────────────────────────────

export function OrgDataProvider({ children }: { children: ReactNode }) {
  const { effectiveAgencyId, effectiveAgencyWritingNumber, isOrgWide } = useEffectiveAuth();

  const [retentionAgencies, setRetentionAgencies] = useState<AgencyRetentionSummary[]>([]);
  const [retentionSummary, setRetentionSummary] = useState<RetentionSummaryResponse | null>(null);
  const [cohorts, setCohorts] = useState<CohortEntry[]>([]);
  const [agencyProduction, setAgencyProduction] = useState<AgencyProduction[]>([]);
  const [dailyProduction, setDailyProduction] = useState<DailyProduction[]>([]);
  const [monthlyProduction, setMonthlyProduction] = useState<MonthlyProduction[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const hasLoaded = useRef(false);

  // Track the last fetch params to avoid redundant fetches
  const lastFetchKey = useRef('');

  const doFetch = async (params?: { startDate?: string; endDate?: string; allTime?: boolean }) => {
    const agencyParam = !isOrgWide && effectiveAgencyWritingNumber
      ? { agency_id: effectiveAgencyWritingNumber }
      : {};

    const allTime = params?.allTime ?? true; // default to all-time on initial load
    const dateParams = !allTime && params?.startDate && params?.endDate
      ? { ...agencyParam, start_date: params.startDate, end_date: params.endDate }
      : agencyParam;

    const fetchKey = JSON.stringify({ agencyParam, dateParams, allTime });
    if (fetchKey === lastFetchKey.current && hasLoaded.current) return;
    lastFetchKey.current = fetchKey;

    try {
      const [retRes, cohortRes, prodRes, trendRes] = await Promise.all([
        fetchRetentionSummary(agencyParam),
        fetchRetentionCohorts(agencyParam),
        fetchAgencyProduction(dateParams),
        allTime
          ? fetchMonthlyProduction(agencyParam)
          : fetchDailyProduction(dateParams),
      ]);

      setRetentionSummary(retRes);
      setRetentionAgencies(retRes.data.agencies);
      setCohorts(cohortRes.data.cohorts);
      setAgencyProduction(prodRes);

      if (allTime) {
        setMonthlyProduction(trendRes as MonthlyProduction[]);
        setDailyProduction([]);
      } else {
        setDailyProduction(trendRes as DailyProduction[]);
        setMonthlyProduction([]);
      }

      hasLoaded.current = true;
      setInitialLoading(false);
    } catch (err) {
      console.error('OrgDataCache fetch error:', err);
      setInitialLoading(false);
    }
  };

  // Initial fetch on mount + auth change
  useEffect(() => {
    hasLoaded.current = false;
    lastFetchKey.current = '';
    doFetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveAgencyId, effectiveAgencyWritingNumber, isOrgWide]);

  const value: OrgDataState = {
    retentionAgencies,
    retentionSummary,
    cohorts,
    agencyProduction,
    dailyProduction,
    monthlyProduction,
    initialLoading,
    refresh: doFetch,
  };

  return (
    <OrgDataContext.Provider value={value}>
      {children}
    </OrgDataContext.Provider>
  );
}
