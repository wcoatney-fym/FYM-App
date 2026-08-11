/**
 * clientFilters — Client-side date filtering for cached production data.
 *
 * Eliminates edge function calls on period switches by filtering the
 * all-time cached data (from OrgDataCache / dashboard_cache) in memory.
 * Period switch goes from ~10s (2 network round-trips to Max's DB)
 * to <1ms (pure JS filter + reduce).
 *
 * Usage:
 *   const filtered = filterDailyByRange(orgData.dailyProduction, startDate, endDate);
 *   const agencyStats = aggregateAgencyProduction(filtered, orgData.agencyProduction);
 */

import type { DailyProduction, MonthlyProduction, AgencyProduction } from './prod-api';

// ── Daily production filtering ─────────────────────────────────────────

/**
 * Filter daily production rows to a date range.
 * Both bounds are inclusive (matches edge function behavior).
 * Returns a new array — never mutates the input.
 */
export function filterDailyByRange(
  rows: DailyProduction[],
  startDate: string,
  endDate: string
): DailyProduction[] {
  if (!rows.length) return [];
  // Normalize to YYYY-MM-DD for string comparison (works because ISO dates sort lexicographically)
  const start = startDate.split('T')[0];
  const end = endDate.split('T')[0];
  return rows.filter((r) => r.day >= start && r.day <= end);
}

/**
 * Filter monthly production rows to a date range.
 * Includes any month that overlaps with the range.
 */
export function filterMonthlyByRange(
  rows: MonthlyProduction[],
  startDate: string,
  endDate: string
): MonthlyProduction[] {
  if (!rows.length) return [];
  const startMonth = startDate.split('T')[0].slice(0, 7);
  const endMonth = endDate.split('T')[0].slice(0, 7);
  return rows.filter((r) => r.month >= startMonth && r.month <= endMonth);
}

// ── Agency production re-aggregation ───────────────────────────────────

/**
 * Re-aggregate agency production stats from filtered daily rows.
 *
 * When the user switches time periods, we need per-agency totals for
 * only the selected date range. The all-time agencyProduction cache has
 * lifetime totals. This function computes period-specific totals from
 * the daily production rows (which carry per-day policy counts + AP).
 *
 * For fields that can't be derived from daily data alone (active_policies,
 * at_risk, retention, etc.) we fall back to the all-time cache values.
 * This is correct because those are current-state fields (not period-dependent).
 */
export function aggregateAgencyProduction(
  filteredDaily: DailyProduction[],
  allTimeAgencies: AgencyProduction[]
): AgencyProduction[] {
  if (!filteredDaily.length && !allTimeAgencies.length) return [];

  // Build a map of daily totals by agency
  const dailyTotals = new Map<string, { policies: number; annual_premium: number }>();
  for (const row of filteredDaily) {
    const existing = dailyTotals.get(row.agency_id);
    if (existing) {
      existing.policies += row.policies;
      existing.annual_premium += row.annual_premium;
    } else {
      dailyTotals.set(row.agency_id, {
        policies: row.policies,
        annual_premium: row.annual_premium,
      });
    }
  }

  // Build lookup of all-time agency data for current-state fields
  const allTimeMap = new Map<string, AgencyProduction>();
  for (const a of allTimeAgencies) {
    allTimeMap.set(a.agency_id, a);
  }

  // Merge: use daily totals for period-specific counts,
  // fall back to all-time for current-state fields
  const result: AgencyProduction[] = [];

  // Include all agencies that appear in either source
  const allAgencyIds = new Set([
    ...dailyTotals.keys(),
    ...allTimeMap.keys(),
  ]);

  for (const agencyId of allAgencyIds) {
    const daily = dailyTotals.get(agencyId);
    const allTime = allTimeMap.get(agencyId);

    if (!daily && allTime) {
      // Agency has no production in this period — include with zero period counts
      // but keep current-state fields (active policies, retention, etc.)
      result.push({
        ...allTime,
        total_policies: 0,
        total_annual_premium: 0,
        policies_this_month: 0,
        ap_this_month: 0,
      });
    } else if (daily && allTime) {
      // Has production in period — override period-specific fields
      result.push({
        ...allTime,
        total_policies: daily.policies,
        total_annual_premium: Math.round(daily.annual_premium * 100) / 100,
        policies_this_month: daily.policies,
        ap_this_month: Math.round(daily.annual_premium * 100) / 100,
      });
    } else if (daily) {
      // No all-time record (shouldn't happen, but be safe)
      result.push({
        agency_id: agencyId,
        total_policies: daily.policies,
        active_policies: 0,
        terminated_policies: 0,
        pending_policies: 0,
        at_risk_policies: 0,
        active_monthly_premium: 0,
        active_annual_premium: 0,
        terminated_annual_premium: 0,
        pending_annual_premium: 0,
        at_risk_annual_premium: 0,
        total_annual_premium: Math.round(daily.annual_premium * 100) / 100,
        policies_this_month: daily.policies,
        ap_this_month: Math.round(daily.annual_premium * 100) / 100,
        policies_last_month: 0,
        ap_last_month: 0,
        avg_annual_premium: daily.policies > 0
          ? Math.round((daily.annual_premium / daily.policies) * 100) / 100
          : 0,
      });
    }
  }

  return result.sort((a, b) => (b.total_annual_premium ?? 0) - (a.total_annual_premium ?? 0));
}
