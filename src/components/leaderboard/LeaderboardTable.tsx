/**
 * LeaderboardTable — Rows 4-10 (or all rows when podium is hidden)
 * with movement arrows, color-coded retention bars, and clean data density.
 *
 * Movement arrows show rank changes vs prior period:
 *   ↑3 green, ↓1 red, — neutral
 */
import { cn } from '@/lib/utils';
import { fmt$, fmtPct } from '@/lib/formatUtils';
import { StaggerContainer, StaggerItem } from '@/components/ui/animated';
import { TrendingUp, TrendingDown, Minus, Trophy } from 'lucide-react';

export interface LeaderRow {
  agent_id: string;
  agent_name: string | null;
  agency_name: string | null;
  rank: number;
  active_policies: number;
  active_annual_premium: number;
  retention_pct: number | null;
  at_risk_policies: number;
  avg_annual_premium: number;
  /** Position change vs prior period */
  movement?: number;
}

interface LeaderboardTableProps {
  rows: LeaderRow[];
  loading?: boolean;
  emptyMessage?: string;
  /** Show avg AP column */
  showAvgAp?: boolean;
}

function retentionColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}

function retentionBarColor(pct: number | null) {
  if (pct === null) return 'bg-muted';
  if (pct >= 90) return 'bg-emerald-500';
  if (pct >= 85) return 'bg-amber-500';
  return 'bg-red-500';
}

function MovementBadge({ movement }: { movement?: number }) {
  if (movement === undefined || movement === 0) {
    return (
      <span className="inline-flex items-center justify-center w-8 text-xs text-muted-foreground">
        <Minus size={12} />
      </span>
    );
  }
  if (movement > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 w-8 text-xs font-bold text-emerald-400">
        <TrendingUp size={12} />{movement}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 w-8 text-xs font-bold text-red-400">
      <TrendingDown size={12} />{Math.abs(movement)}
    </span>
  );
}

export function LeaderboardTable({ rows, loading, emptyMessage, showAvgAp }: LeaderboardTableProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 rounded shimmer" />)}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border py-12 text-center">
        <Trophy size={28} className="mx-auto text-muted-foreground mb-3 opacity-50" />
        <p className="text-sm text-muted-foreground">{emptyMessage || 'No agents to display'}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-card/80 border-b border-border/50 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="px-4 py-3 text-center w-12">#</th>
              <th className="px-2 py-3 w-8" />
              <th className="px-2 py-3 text-left">Agent</th>
              <th className="px-2 py-3 text-center w-36">Retention</th>
              <th className="px-2 py-3 text-right w-24">Policies</th>
              <th className="px-2 py-3 text-right w-28">Premium</th>
              {showAvgAp && <th className="px-2 py-3 text-right w-24">Avg AP</th>}
              <th className="px-2 py-3 text-center w-20">At-Risk</th>
            </tr>
          </thead>
          <StaggerContainer className="contents" role="rowgroup">
            {rows.map((r) => (
              <StaggerItem key={r.agent_id} className="contents">
                <tr className="border-b border-border/20 hover:bg-card/60 transition-colors group">
                  {/* Rank */}
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-sm font-bold text-muted-foreground tabular-nums">
                      #{r.rank}
                    </span>
                  </td>

                  {/* Movement */}
                  <td className="px-2 py-3.5">
                    <MovementBadge movement={r.movement} />
                  </td>

                  {/* Agent name + agency */}
                  <td className="px-2 py-3.5">
                    <div className="min-w-0">
                      <span className="font-semibold text-foreground truncate block max-w-[220px]">
                        {r.agent_name ?? (
                          <span className="font-data text-xs text-muted-foreground">
                            {r.agent_id.slice(0, 12)}…
                          </span>
                        )}
                      </span>
                      {r.agency_name && (
                        <span className="text-[11px] text-muted-foreground truncate block max-w-[220px]">
                          {r.agency_name}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Retention with bar */}
                  <td className="px-2 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-2 rounded-full bg-secondary/50 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', retentionBarColor(r.retention_pct))}
                          style={{ width: `${Math.min(100, r.retention_pct ?? 0)}%` }}
                        />
                      </div>
                      <span className={cn('text-xs font-bold tabular-nums w-10 text-right', retentionColor(r.retention_pct))}>
                        {r.retention_pct !== null ? `${r.retention_pct}%` : '—'}
                      </span>
                    </div>
                  </td>

                  {/* Policies */}
                  <td className="px-2 py-3.5 text-right">
                    <span className="font-data font-medium text-foreground/80 tabular-nums">
                      {r.active_policies.toLocaleString()}
                    </span>
                  </td>

                  {/* Premium */}
                  <td className="px-2 py-3.5 text-right">
                    <span className="font-data font-medium text-foreground/80 tabular-nums">
                      {fmt$(r.active_annual_premium)}
                    </span>
                  </td>

                  {/* Avg AP */}
                  {showAvgAp && (
                    <td className="px-2 py-3.5 text-right">
                      <span className="font-data text-muted-foreground tabular-nums">
                        {fmt$(r.avg_annual_premium)}
                      </span>
                    </td>
                  )}

                  {/* At-Risk */}
                  <td className="px-2 py-3.5 text-center">
                    <span className={cn(
                      'font-data font-medium tabular-nums',
                      r.at_risk_policies > 0 ? 'text-red-400' : 'text-muted-foreground',
                    )}>
                      {r.at_risk_policies || '—'}
                    </span>
                  </td>
                </tr>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </table>
      </div>
    </div>
  );
}
