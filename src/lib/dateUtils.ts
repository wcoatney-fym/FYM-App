/**
 * Date utilities for time period filtering across all pages.
 * Ported from Sales Tracker DateRangeSelector — same presets, same logic.
 * Default: "thisMonth"
 */

export type DatePreset =
  | 'past7Days'
  | 'past14Days'
  | 'pastMonth'
  | 'pastQuarter'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'past6Months'
  | 'pastYear'
  | 'allTime'
  | 'custom';

export interface DateRange {
  startDate: string;   // ISO string
  endDate: string;     // ISO string (exclusive upper bound)
  label: string;
}

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'past7Days', label: 'Past 7 Days' },
  { key: 'past14Days', label: 'Past 14 Days' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'thisQuarter', label: 'This Quarter' },
  { key: 'past6Months', label: 'Past 6 Months' },
  { key: 'pastYear', label: 'Past Year' },
  { key: 'allTime', label: 'All Time' },
];

/** Recruiting-specific presets — rolling windows only, no calendar-anchored periods */
export const RECRUITING_DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'past7Days', label: 'Past 7 Days' },
  { key: 'past14Days', label: 'Past 14 Days' },
  { key: 'pastMonth', label: 'Past Month' },
  { key: 'pastQuarter', label: 'Past Quarter' },
  { key: 'past6Months', label: 'Past 6 Months' },
  { key: 'pastYear', label: 'Past Year' },
];

export const DEFAULT_PRESET: DatePreset = 'thisMonth';
export const RECRUITING_DEFAULT_PRESET: DatePreset = 'pastMonth';

export function getDateRange(preset: DatePreset): DateRange {
  const now = new Date();

  switch (preset) {
    case 'past7Days': {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      return { startDate: start.toISOString(), endDate: end.toISOString(), label: 'Past 7 Days' };
    }
    case 'past14Days': {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const start = new Date(end);
      start.setDate(start.getDate() - 14);
      return { startDate: start.toISOString(), endDate: end.toISOString(), label: 'Past 14 Days' };
    }
    case 'pastMonth': {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const start = new Date(end);
      start.setMonth(start.getMonth() - 1);
      return { startDate: start.toISOString(), endDate: end.toISOString(), label: 'Past Month' };
    }
    case 'pastQuarter': {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const start = new Date(end);
      start.setMonth(start.getMonth() - 3);
      return { startDate: start.toISOString(), endDate: end.toISOString(), label: 'Past Quarter' };
    }
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return { startDate: start.toISOString(), endDate: end.toISOString(), label: 'This Month' };
    }
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: start.toISOString(), endDate: end.toISOString(), label: 'Last Month' };
    }
    case 'thisQuarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), qMonth, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const qLabel = `Q${Math.floor(qMonth / 3) + 1} ${now.getFullYear()}`;
      return { startDate: start.toISOString(), endDate: end.toISOString(), label: qLabel };
    }
    case 'past6Months': {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const start = new Date(end);
      start.setMonth(start.getMonth() - 6);
      return { startDate: start.toISOString(), endDate: end.toISOString(), label: 'Past 6 Months' };
    }
    case 'pastYear': {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const start = new Date(end);
      start.setFullYear(start.getFullYear() - 1);
      return { startDate: start.toISOString(), endDate: end.toISOString(), label: 'Past Year' };
    }
    case 'allTime': {
      const start = new Date(2020, 0, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return { startDate: start.toISOString(), endDate: end.toISOString(), label: 'All Time' };
    }
    default:
      return getDateRange('thisMonth');
  }
}

/**
 * Compute the previous period of equal length for delta comparisons.
 */
export function getPreviousPeriod(range: DateRange): DateRange {
  const start = new Date(range.startDate);
  const end = new Date(range.endDate);
  const duration = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime());
  const prevStart = new Date(start.getTime() - duration);
  return { startDate: prevStart.toISOString(), endDate: prevEnd.toISOString(), label: 'Previous period' };
}

/**
 * Check if a date string falls within the given range (start inclusive, end exclusive).
 */
export function isInRange(dateStr: string | null | undefined, range: DateRange): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  const start = new Date(range.startDate);
  const end = new Date(range.endDate);
  return d >= start && d < end;
}

/**
 * Format an ISO month string (YYYY-MM) to short display.
 */
export function fmtMonth(iso: string) {
  const [y, m] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1]} '${y.slice(2)}`;
}

// ── Adaptive chart granularity ─────────────────────────────────────────────

export type Granularity = 'day' | 'week' | 'month';

/**
 * Pick the right chart granularity based on range size:
 * - ≤31 days → daily
 * - ≤90 days → weekly
 * - >90 days → monthly
 */
export function getGranularity(range: DateRange): Granularity {
  const start = new Date(range.startDate);
  const end = new Date(range.endDate);
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 31) return 'day';
  if (days <= 90) return 'week';
  return 'month';
}

/** ISO date string → bucket key for the given granularity */
export function bucketKey(dateStr: string, granularity: Granularity): string {
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  switch (granularity) {
    case 'day':
      return dateStr.slice(0, 10); // YYYY-MM-DD
    case 'week': {
      // ISO week: Monday-aligned. Find the Monday of this week.
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(d);
      monday.setDate(diff);
      return monday.toISOString().slice(0, 10); // YYYY-MM-DD of Monday
    }
    case 'month':
      return dateStr.slice(0, 7); // YYYY-MM
  }
}

/** Format a bucket key for chart axis labels */
export function fmtBucketLabel(key: string, granularity: Granularity): string {
  switch (granularity) {
    case 'day': {
      const d = new Date(key + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    case 'week': {
      const d = new Date(key + 'T00:00:00');
      return `Wk ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    case 'month':
      return fmtMonth(key);
  }
}

export interface DailyRow {
  day: string;
  agency_id: string;
  agent_id: string | null;
  writing_number: string | null;
  product_type: string;
  policies: number;
  annual_premium: number;
  /** Policies effectuated (by issue_date) on this day */
  issued: number;
}

export interface TrendPoint {
  bucket: string;
  label: string;
  policies: number;
  ap: number;
  /** Policies effectuated (went active) in this bucket */
  issued: number;
}

/**
 * Aggregate daily rows into trend points using the appropriate granularity.
 * Optionally filter by agency_id and/or writing_number.
 */
export function aggregateTrend(
  dailyRows: DailyRow[],
  granularity: Granularity,
  filters?: { agencyId?: string | null; writingNumber?: string | null },
): TrendPoint[] {
  let rows = dailyRows;
  if (filters?.agencyId) rows = rows.filter(r => r.agency_id === filters.agencyId);
  if (filters?.writingNumber) rows = rows.filter(r => r.writing_number === filters.writingNumber);

  const byBucket = new Map<string, { policies: number; ap: number; issued: number }>();
  rows.forEach(r => {
    const key = bucketKey(r.day, granularity);
    const existing = byBucket.get(key) || { policies: 0, ap: 0, issued: 0 };
    existing.policies += Number(r.policies);
    existing.ap += Number(r.annual_premium);
    existing.issued += Number(r.issued || 0);
    byBucket.set(key, existing);
  });

  return Array.from(byBucket.entries())
    .map(([bucket, v]) => ({
      bucket,
      label: fmtBucketLabel(bucket, granularity),
      policies: v.policies,
      ap: v.ap,
      issued: v.issued,
    }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}
