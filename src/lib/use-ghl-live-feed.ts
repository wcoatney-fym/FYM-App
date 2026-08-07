/**
 * React hook for GHL Live Feed status.
 *
 * Fetches ghl_api_enabled status for all agencies from the tracker DB
 * (via the ghl-live-feed edge function) and provides a toggle function.
 *
 * Usage:
 *   const { statuses, isEnabled, toggle, loading } = useGhlLiveFeed();
 *   const enabled = isEnabled('some-agency-id');
 *   await toggle('some-agency-id', true);
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchGhlAgencyStatuses,
  toggleGhlLiveFeed,
  type GhlAgencyStatus,
} from '@/lib/ghl-live-feed';

/**
 * Normalize a slug for fuzzy cross-DB matching.
 * Strips common business suffixes (-llc, -inc, -group, -agency, etc.)
 * so "dh-insurance-group" matches "dh-insurance" and
 * "wisechoice-senior-advisors-llc" matches "wisechoice".
 */
function normalizeSlug(slug: string | null | undefined): string {
  if (!slug) return '';
  return slug
    .toLowerCase()
    .replace(/-(llc|inc|group|agency|advisors|solutions|partners|holdings|services|insurance|senior|enterprises|media|dba)$/g, '')
    .replace(/-(llc|inc|group|agency|advisors|solutions|partners|holdings|services|insurance|senior|enterprises|media|dba)$/g, '') // second pass for chained suffixes
    .replace(/-+$/, '');
}

export function useGhlLiveFeed() {
  const [statuses, setStatuses] = useState<GhlAgencyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGhlAgencyStatuses();
      setStatuses(data);
    } catch (err) {
      console.error('[useGhlLiveFeed] Failed to load:', err);
      setError(err instanceof Error ? err.message : 'Failed to load GHL status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Check if a specific agency has GHL live feed enabled */
  const isEnabled = useCallback(
    (agencyId: string): boolean => {
      return statuses.some((s) => s.id === agencyId && s.ghl_api_enabled);
    },
    [statuses]
  );

  /** Build a normalized-slug → GhlAgencyStatus lookup map */
  const slugMap = useMemo(() => {
    const map = new Map<string, GhlAgencyStatus>();
    for (const s of statuses) {
      // Index by exact slug
      if (s.slug) map.set(s.slug, s);
      // Index by normalized slug
      const norm = normalizeSlug(s.slug);
      if (norm && !map.has(norm)) map.set(norm, s);
    }
    return map;
  }, [statuses]);

  /** Find a tracker agency by slug with normalized fallback */
  const findBySlug = useCallback(
    (slug: string | null | undefined): GhlAgencyStatus | undefined => {
      if (!slug) return undefined;
      // Try exact match first
      const exact = slugMap.get(slug);
      if (exact) return exact;
      // Try normalized match
      const norm = normalizeSlug(slug);
      return norm ? slugMap.get(norm) : undefined;
    },
    [slugMap]
  );

  /** Look up GHL status by agency name (for cross-DB matching) */
  const isEnabledByName = useCallback(
    (agencyName: string): boolean => {
      const lower = agencyName.toLowerCase();
      return statuses.some(
        (s) => s.name.toLowerCase() === lower && s.ghl_api_enabled
      );
    },
    [statuses]
  );

  /** Look up GHL status by slug */
  const isEnabledBySlug = useCallback(
    (slug: string): boolean => {
      return statuses.some(
        (s) => s.slug === slug && s.ghl_api_enabled
      );
    },
    [statuses]
  );

  /** Toggle GHL live feed for an agency */
  const toggle = useCallback(
    async (agencyId: string, enabled: boolean): Promise<boolean> => {
      setTogglingId(agencyId);
      try {
        const result = await toggleGhlLiveFeed(agencyId, enabled);
        if (result.success) {
          setStatuses((prev) =>
            prev.map((s) =>
              s.id === agencyId
                ? { ...s, ghl_api_enabled: result.ghl_api_enabled }
                : s
            )
          );
          return true;
        }
        return false;
      } catch (err) {
        console.error('[useGhlLiveFeed] Toggle failed:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to toggle GHL status'
        );
        return false;
      } finally {
        setTogglingId(null);
      }
    },
    []
  );

  return {
    statuses,
    loading,
    error,
    togglingId,
    isEnabled,
    isEnabledByName,
    isEnabledBySlug,
    findBySlug,
    toggle,
    reload: load,
  };
}
