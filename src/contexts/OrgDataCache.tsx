/**
 * OrgDataCache — Shared edge-function data cache with localStorage persistence
 *
 * Fetches core org-wide datasets once and caches them in context so
 * page navigations don't re-fetch and flash shimmer skeletons.
 *
 * On hard refresh / initial load, hydrates instantly from localStorage
 * (stale-while-revalidate) so there is zero shimmer — data renders
 * immediately from the last-known state, then silently refreshes in
 * the background.
 *
 * Cached datasets:
 *   - retentionSummary (agencies + org-wide retention)
 *   - retentionCohorts (monthly cohort trend)
 *   - agencyProduction (per-agency production stats)
 *   - dailyProduction (day-level production)
 *   - monthlyProduction (month-level production)
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

// ── localStorage persistence ───────────────────────────────────────────────

const CACHE_KEY = 'fym_org_data_cache';
const CACHE_VERSION = 1;

interface PersistedCache {
  version: number;
  timestamp: number;
  retentionSummary: RetentionSummaryResponse | null;
  cohorts: CohortEntry[];
  agencyProduction: AgencyProduction[];
  monthlyProduction: MonthlyProduction[];
}

function readPersistedCache(): PersistedCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedCache;
    if (parsed.version !== CACHE_VERSION) return null;
    // Expire after 24 hours — stale data older than that gets shimmer
    if (Date.now() - parsed.timestamp > 24 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedCache(data: Omit<PersistedCache, 'version' | 'timestamp'>) {
  try {
    const payload: PersistedCache = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      ...data,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

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
  /** True only on very first load when no persisted cache exists */
  initialLoading: boolean;
  /** Trigger a full re-fetch (e.g., after date range change) */
  refresh: (params?: { startDate?: string; endDate?: string; allTime?: boolean }) => void;
  /** ISO timestamp of last successful data fetch (null = never fetched this session) */
  lastUpdated: string | null;
  /** Error from last fetch attempt — null when fetch succeeded */
  fetchError: string | null;
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
  lastUpdated: null,
  fetchError: null,
};

const OrgDataContext = createContext<OrgDataState>(defaultState);

export function useOrgData() {
  return useContext(OrgDataContext);
}

// ── Provider ───────────────────────────────────────────────────────────────

export function OrgDataProvider({ children }: { children: ReactNode }) {
  const { effectiveAgencyId, effectiveAgencyWritingNumber, isOrgWide } = useEffectiveAuth();

  // Hydrate from localStorage on first render — if data exists, skip shimmer
  const persisted = useRef(readPersistedCache());
  const hasPersistedData = persisted.current !== null;

  const [retentionAgencies, setRetentionAgencies] = useState<AgencyRetentionSummary[]>(
    hasPersistedData ? persisted.current!.retentionSummary?.data.agencies ?? [] : []
  );
  const [retentionSummary, setRetentionSummary] = useState<RetentionSummaryResponse | null>(
    hasPersistedData ? persisted.current!.retentionSummary : null
  );
  const [cohorts, setCohorts] = useState<CohortEntry[]>(
    hasPersistedData ? persisted.current!.cohorts : []
  );
  const [agencyProduction, setAgencyProduction] = useState<AgencyProduction[]>(
    hasPersistedData ? persisted.current!.agencyProduction : []
  );
  const [dailyProduction, setDailyProduction] = useState<DailyProduction[]>([]);
  const [monthlyProduction, setMonthlyProduction] = useState<MonthlyProduction[]>(
    hasPersistedData ? persisted.current!.monthlyProduction : []
  );
  // If we have persisted data, start with initialLoading = false (instant render)
  const [initialLoading, setInitialLoading] = useState(!hasPersistedData);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
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

        // Persist to localStorage for instant hydration on next page load
        writePersistedCache({
          retentionSummary: retRes,
          cohorts: cohortRes.data.cohorts,
          agencyProduction: prodRes,
          monthlyProduction: trendRes as MonthlyProduction[],
        });
      } else {
        setDailyProduction(trendRes as DailyProduction[]);
        setMonthlyProduction([]);
      }

      hasLoaded.current = true;
      setInitialLoading(false);
      setLastUpdated(new Date().toISOString());
      setFetchError(null);
    } catch (err) {
      console.error('OrgDataCache fetch error:', err);
      setInitialLoading(false);
      setFetchError(err instanceof Error ? err.message : 'Failed to load dashboard data');
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
    lastUpdated,
    fetchError,
  };

  return (
    <OrgDataContext.Provider value={value}>
      {children}
    </OrgDataContext.Provider>
  );
}
