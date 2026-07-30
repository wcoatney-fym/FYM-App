/**
 * Date utilities for time period filtering across all pages.
 * Ported from Sales Tracker DateRangeSelector — same presets, same logic.
 * Default: "thisMonth"
 */

export type DatePreset =
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
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'thisQuarter', label: 'This Quarter' },
  { key: 'past6Months', label: 'Past 6 Months' },
  { key: 'pastYear', label: 'Past Year' },
  { key: 'allTime', label: 'All Time' },
];

export const DEFAULT_PRESET: DatePreset = 'thisMonth';

export function getDateRange(preset: DatePreset): DateRange {
  const now = new Date();

  switch (preset) {
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
