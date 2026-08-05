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

/**
 * Tailwind text color class for a retention percentage.
 * 90%+ = green, 85%+ = amber, below = red, null = muted.
 * Single source of truth — replaces 5+ local retColor/retentionColor copies.
 */
export function retentionColor(pct: number | null | undefined): string {
  if (pct == null) return 'text-muted-foreground';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}

/**
 * Tailwind background tint for a retention percentage (subtle row highlight).
 * Pairs with retentionColor for consistent visual language.
 */
export function retentionBg(pct: number | null | undefined): string {
  if (pct == null) return '';
  if (pct >= 90) return 'bg-emerald-500/[0.03]';
  if (pct >= 85) return 'bg-amber-500/[0.03]';
  return 'bg-red-500/[0.03]';
}
