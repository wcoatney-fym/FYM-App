/**
 * DeltaBadge — reusable compare-to-prior period indicator (P9).
 *
 * Shows ↑/↓ arrow + percentage change between current and previous values.
 * Used across Dashboard, Agent Dashboard, Leaderboard, Production pages
 * when the compare toggle is active.
 *
 * Supports inversion (lower = better, e.g. at-risk count, lapse rate).
 */
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface DeltaBadgeProps {
  current: number;
  previous: number;
  /** If true, a decrease is good (green) and an increase is bad (red).
   *  Default: false (increase = green). */
  invertColor?: boolean;
  /** Show the raw delta value alongside the percentage */
  showAbsolute?: boolean;
  /** Format function for the absolute value (default: Math.round) */
  formatAbsolute?: (n: number) => string;
  /** Size variant */
  size?: 'sm' | 'md';
}

function computeDelta(current: number, previous: number) {
  if (previous === 0) return { pct: current > 0 ? 100 : 0, dir: current > 0 ? 'up' as const : 'flat' as const, abs: current };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct: Math.abs(pct), dir: pct > 0 ? 'up' as const : pct < 0 ? 'down' as const : 'flat' as const, abs: Math.abs(current - previous) };
}

export function DeltaBadge({
  current,
  previous,
  invertColor = false,
  showAbsolute = false,
  formatAbsolute,
  size = 'sm',
}: DeltaBadgeProps) {
  const d = computeDelta(current, previous);

  if (d.dir === 'flat') {
    return (
      <span className={`inline-flex items-center gap-0.5 ${size === 'sm' ? 'text-xs' : 'text-sm'} text-muted-foreground/50`}>
        <Minus size={size === 'sm' ? 10 : 12} />
        0%
      </span>
    );
  }

  const isPositive = invertColor ? d.dir === 'down' : d.dir === 'up';
  const color = isPositive ? 'text-emerald-400' : 'text-red-400';
  const bg = isPositive ? 'bg-emerald-400/10' : 'bg-red-400/10';
  const Icon = d.dir === 'up' ? ArrowUpRight : ArrowDownRight;
  const iconSize = size === 'sm' ? 12 : 14;
  const fmtAbs = formatAbsolute ?? ((n: number) => String(Math.round(n)));

  return (
    <span className={`inline-flex items-center gap-0.5 ${size === 'sm' ? 'text-xs' : 'text-sm'} font-medium ${color} ${bg} px-1.5 py-0.5 rounded`}>
      <Icon size={iconSize} />
      {d.pct}%
      {showAbsolute && (
        <span className="opacity-70 ml-0.5">({d.dir === 'up' ? '+' : '−'}{fmtAbs(d.abs)})</span>
      )}
    </span>
  );
}

export { computeDelta };
