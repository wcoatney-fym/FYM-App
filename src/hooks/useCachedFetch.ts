/**
 * useCachedFetch — Generic stale-while-revalidate hook with localStorage persistence
 *
 * Wraps any async fetcher with instant hydration from localStorage.
 * On mount, renders immediately from cached data (zero shimmer),
 * then silently refreshes in the background.
 *
 * Usage:
 *   const { data, loading, refresh } = useCachedFetch(
 *     'agencies-retention',               // unique cache key
 *     () => fetchRetentionSummary(),       // fetcher function
 *     { maxAge: 24 * 60 * 60 * 1000 }     // options
 *   );
 *
 * `loading` is true ONLY when no cached data exists (first-ever load).
 * Once data is cached, `loading` stays false and background refreshes
 * are invisible to the user.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const CACHE_PREFIX = 'fym_cf_';
const CACHE_VERSION = 1;
const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  version: number;
  timestamp: number;
  data: T;
}

interface UseCachedFetchOptions {
  /** Max age in ms before cached data is considered expired (default: 24h) */
  maxAge?: number;
  /** Whether to skip the fetch entirely (e.g. when params aren't ready) */
  skip?: boolean;
  /** Dependencies that trigger a re-fetch when changed */
  deps?: unknown[];
}

interface UseCachedFetchResult<T> {
  /** The data — from cache or fresh fetch */
  data: T | null;
  /** True only when no cached data exists AND the first fetch is in flight */
  loading: boolean;
  /** True while a background refresh is in flight (data is already showing) */
  refreshing: boolean;
  /** Any error from the last fetch attempt */
  error: Error | null;
  /** Manually trigger a re-fetch */
  refresh: () => void;
}

function readCache<T>(key: string, maxAge: number): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (entry.version !== CACHE_VERSION) return null;
    if (Date.now() - entry.timestamp > maxAge) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      data,
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

export function useCachedFetch<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  options: UseCachedFetchOptions = {}
): UseCachedFetchResult<T> {
  const { maxAge = DEFAULT_MAX_AGE, skip = false, deps = [] } = options;

  // Hydrate from localStorage on first render
  const cachedData = useRef(readCache<T>(cacheKey, maxAge));
  const [data, setData] = useState<T | null>(cachedData.current);
  const [loading, setLoading] = useState(cachedData.current === null && !skip);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const doFetch = useCallback(async () => {
    if (skip) return;

    const fetchId = ++fetchIdRef.current;
    const hasData = data !== null;

    if (hasData) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await fetcher();
      if (!mountedRef.current || fetchId !== fetchIdRef.current) return;

      setData(result);
      writeCache(cacheKey, result);
      setLoading(false);
      setRefreshing(false);
    } catch (err) {
      if (!mountedRef.current || fetchId !== fetchIdRef.current) return;

      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, skip, ...deps]);

  useEffect(() => {
    // Re-read cache when key changes
    const cached = readCache<T>(cacheKey, maxAge);
    if (cached !== null) {
      setData(cached);
      setLoading(false);
    } else {
      setData(null);
      if (!skip) setLoading(true);
    }
    doFetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, doFetch]);

  return { data, loading, refreshing, error, refresh: doFetch };
}

/**
 * useCachedMultiFetch — Parallel multi-fetcher with combined cache
 *
 * Like useCachedFetch but runs multiple fetchers in parallel and
 * caches them as a single unit (all-or-nothing).
 *
 * Usage:
 *   const { data, loading } = useCachedMultiFetch(
 *     'agent-dashboard-123',
 *     {
 *       stats: () => fetchAgentProduction({ agent_id: '123' }),
 *       monthly: () => fetchMonthlyProduction({ agent_id: '123' }),
 *       atRisk: () => fetchAtRiskPolicies({ agency_id: 'ABC' }),
 *     }
 *   );
 *   // data.stats, data.monthly, data.atRisk — all typed
 */

type FetcherMap = Record<string, () => Promise<unknown>>;
type FetcherResults<T extends FetcherMap> = {
  [K in keyof T]: Awaited<ReturnType<T[K]>>;
};

interface UseCachedMultiFetchResult<T extends FetcherMap> {
  data: FetcherResults<T> | null;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useCachedMultiFetch<T extends FetcherMap>(
  cacheKey: string,
  fetchers: T,
  options: UseCachedFetchOptions = {}
): UseCachedMultiFetchResult<T> {
  const combinedFetcher = useCallback(async (): Promise<FetcherResults<T>> => {
    const keys = Object.keys(fetchers) as (keyof T)[];
    const promises = keys.map(k => (fetchers[k] as () => Promise<unknown>)());
    const results = await Promise.all(promises);
    const out = {} as FetcherResults<T>;
    keys.forEach((k, i) => {
      (out as Record<string, unknown>)[k as string] = results[i];
    });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, ...(options.deps || [])]);

  return useCachedFetch<FetcherResults<T>>(cacheKey, combinedFetcher, options);
}
