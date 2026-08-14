/**
 * YourPosition — Sticky bar shown when the logged-in agent
 * isn't in the top 10. Shows their current rank, the gap
 * to #10, and what they need to get there.
 *
 * "You're #14 — 2 more policies to crack the top 10."
 */
import { cn } from '@/lib/utils';
import { fmt$ } from '@/lib/formatUtils';
import { Target, TrendingUp, ArrowUp } from 'lucide-react';

interface YourPositionProps {
  rank: number;
  agentName: string | null;
  policies: number;
  premium: number;
  retentionPct: number | null;
  /** Policies the #10 agent has (to compute gap) */
  tenthPlacePolicies: number;
  /** Premium the #10 agent has */
  tenthPlacePremium: number;
  /** The sorting category to determine what gap message to show */
  category: 'overall' | 'quality' | 'production';
}

export function YourPosition({
  rank,
  agentName,
  policies,
  premium,
  retentionPct,
  tenthPlacePolicies,
  tenthPlacePremium,
  category,
}: YourPositionProps) {
  const policyGap = Math.max(0, tenthPlacePolicies - policies + 1);
  const premiumGap = Math.max(0, tenthPlacePremium - premium + 1);

  let gapMessage: string;
  if (category === 'production') {
    if (premiumGap > 0) {
      gapMessage = `${fmt$(premiumGap)} more premium to crack the top 10`;
    } else if (policyGap > 0) {
      gapMessage = `${policyGap} more ${policyGap === 1 ? 'policy' : 'policies'} to crack the top 10`;
    } else {
      gapMessage = 'Almost there — keep pushing';
    }
  } else {
    if (policyGap > 0) {
      gapMessage = `${policyGap} more ${policyGap === 1 ? 'policy' : 'policies'} to crack the top 10`;
    } else {
      gapMessage = 'Almost there — keep pushing';
    }
  }

  return (
    <div className="sticky bottom-4 z-10">
      <div className={cn(
        'mx-auto max-w-3xl rounded-xl border border-primary/30',
        'bg-gradient-to-r from-card/95 to-card/90 backdrop-blur-sm',
        'shadow-lg shadow-primary/5',
        'px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap',
      )}>
        {/* Left: rank + name */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-black text-primary tabular-nums">#{rank}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {agentName ?? 'You'}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowUp size={10} className="text-primary" />
              {gapMessage}
            </p>
          </div>
        </div>

        {/* Right: quick stats */}
        <div className="flex items-center gap-5">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Policies</p>
            <p className="text-sm font-bold tabular-nums text-foreground">{policies}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Premium</p>
            <p className="text-sm font-bold tabular-nums text-foreground">{fmt$(premium)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Retention</p>
            <p className={cn(
              'text-sm font-bold tabular-nums',
              retentionPct === null ? 'text-muted-foreground'
                : retentionPct >= 90 ? 'text-emerald-400'
                : retentionPct >= 85 ? 'text-amber-400'
                : 'text-red-400',
            )}>
              {retentionPct !== null ? `${retentionPct}%` : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
