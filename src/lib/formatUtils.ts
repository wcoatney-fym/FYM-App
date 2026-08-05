/**
 * formatUtils.ts — Shared formatting helpers
 *
 * Single source of truth for number, currency, date, and percentage
 * formatting across all pages. Replaces 19+ copy-pasted fmt$ definitions,
 * 7 fmtNum copies, 5 fmtDate copies, and 3 fmtPct copies.
 */

/** Format a number as compact USD: $1.2M, $45K, $832 */
export function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

/** Format a number with locale separators: 1,234 */
export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString();
}

/** Format an ISO date string as "Jul 5, '26" — returns em dash for null */
export function fmtDate(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

/** Format a percentage: "92.3%" — returns "—" for null/undefined */
export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}%`;
}
