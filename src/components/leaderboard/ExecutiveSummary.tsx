/**
 * ExecutiveSummary — Gradient card at top of the leaderboard showing
 * the viewer's book/agency executive KPIs with clickable sort tiles.
 *
 * Per PRD: adapts per active board tab (Books, Agency Agents, Agencies, All Agents).
 * Strongest/weakest KPI callout at bottom.
 */
import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { KpiSummaryTile, type KpiTileData } from './KpiSummaryTile';

export type LeaderboardSortKey =
  | 'ap' | 'apps' | 'save_rate' | 'taken_pct' | 'avg_ap' | 'retention' | 'at_risk' | 'agents';

export interface ExecSummaryData {
  /** Display name for the viewer's entity (book name, agency name, etc.) */
  entityName: string;
  /** Subtitle context (e.g. "12 agents · ranked vs. 4 books") */
  subtitle: string;
  /** Avatar initials */
  initials: string;
  /** KPI tiles to display */
  tiles: KpiTileData[];
}

interface ExecutiveSummaryProps {
  data: ExecSummaryData;
  activeSort: LeaderboardSortKey;
  onSortChange: (key: LeaderboardSortKey) => void;
}

export function ExecutiveSummary({ data, activeSort, onSortChange }: ExecutiveSummaryProps) {
  // Determine strongest and weakest KPIs
  const { strongest, weakest } = useMemo(() => {
    const ranked = data.tiles.filter(t => t.rank != null && t.rankOf != null);
    if (ranked.length === 0) return { strongest: null, weakest: null };

    const sorted = [...ranked].sort((a, b) => {
      const pctA = (a.rank ?? 0) / (a.rankOf ?? 1);
      const pctB = (b.rank ?? 0) / (b.rankOf ?? 1);
      return pctA - pctB;
    });

    return {
      strongest: sorted[0],
      weakest: sorted[sorted.length - 1],
    };
  }, [data.tiles]);

  return (
    <div className="rounded-xl border border-primary/20 p-5 mb-4" style={{
      background: 'linear-gradient(135deg, hsl(217 33% 12%), hsl(222 47% 8%))',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center font-extrabold text-white text-sm bg-gradient-to-br from-pink-600 to-pink-800">
            {data.initials}
          </div>
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-primary">
              Executive Summary
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-extrabold text-lg text-foreground">{data.entityName}</span>
              <span className="text-xs text-muted-foreground">{data.subtitle}</span>
            </div>
          </div>
        </div>
        <div className="text-[11px] flex items-center gap-1.5 text-muted-foreground/50">
          Click any KPI to re-sort
        </div>
      </div>

      {/* KPI Tiles Grid */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5">
        {data.tiles.map(tile => (
          <KpiSummaryTile
            key={tile.key}
            tile={tile}
            activeSort={activeSort === tile.key}
            onClick={() => onSortChange(tile.key as LeaderboardSortKey)}
          />
        ))}
      </div>

      {/* Strongest / Weakest callout */}
      {(strongest || weakest) && (
        <div className="mt-4 pt-4 border-t border-border/30 flex items-center gap-4 flex-wrap">
          {strongest && (
            <div className="text-xs flex items-center gap-1.5 text-muted-foreground">
              <TrendingUp size={14} className="text-emerald-400" />
              <span>Strongest: </span>
              <span className="font-semibold text-foreground">
                {strongest.label} (#{strongest.rank} of {strongest.rankOf})
              </span>
            </div>
          )}
          {strongest && weakest && (
            <span className="text-muted-foreground/30">·</span>
          )}
          {weakest && weakest !== strongest && (
            <div className="text-xs flex items-center gap-1.5 text-muted-foreground">
              <TrendingDown size={14} className="text-amber-400" />
              <span>Room to grow: </span>
              <span className="font-semibold text-foreground">{weakest.label}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
