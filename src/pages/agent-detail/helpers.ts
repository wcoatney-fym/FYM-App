/**
 * Agent Detail — shared formatting helpers
 */

export function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString();
}

export function fmtDate(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export function retentionColor(pct: number | null): string {
  if (pct === null) return 'text-muted-foreground/70';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}

export function retentionBg(pct: number | null): string {
  if (pct === null) return '';
  if (pct >= 90) return 'bg-emerald-500/[0.03]';
  if (pct >= 85) return 'bg-amber-500/[0.03]';
  return 'bg-red-500/[0.03]';
}

export function statusBadge(status: string, isAtRisk: boolean) {
  if (isAtRisk) return { label: 'At Risk', cls: 'bg-red-500/15 text-red-400 border-red-500/20' };
  switch (status) {
    case 'active': return { label: 'Active', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' };
    case 'terminated': return { label: 'Terminated', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' };
    case 'pending': return { label: 'Pending', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' };
    default: return { label: status, cls: 'bg-secondary text-muted-foreground border-border' };
  }
}
