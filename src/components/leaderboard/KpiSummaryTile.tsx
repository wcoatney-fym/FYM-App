/**
 * KpiSummaryTile — Clickable KPI card used in the Executive Summary strip.
 * Per PRD: click any KPI to re-sort the leaderboard table by that metric.
 * Active sort tile gets a navy top border accent.
 */
import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown } from 'lucide-react';

export type RankTier = 'top' | 'mid' | 'low';

export interface KpiTileData {
  key: string;
  label: string;
  value: string;
  rank?: number;
  rankOf?: number;
  delta?: string;
  deltaUp?: boolean;
}

interface KpiSummaryTileProps {
  tile: KpiTileData;
  activeSort: boolean;
  onClick: () => void;
}

function rankTier(rank: number, total: number): RankTier {
  const pct = rank / total;
  if (pct <= 0.33) return 'top';
  if (pct <= 0.66) return 'mid';
  return 'low';
}

function rankChipClass(tier: RankTier): string {
  switch (tier) {
    case 'top': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
    case 'mid': return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
    case 'low': return 'bg-red-500/15 text-red-400 border-red-500/20';
  }
}

export function KpiSummaryTile({ tile, activeSort, onClick }: KpiSummaryTileProps) {
  const tier = tile.rank && tile.rankOf ? rankTier(tile.rank, tile.rankOf) : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative rounded-xl border p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5 cursor-pointer',
        activeSort
          ? 'border-primary bg-primary/5 before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-primary before:rounded-t-xl'
          : 'border-border bg-card',
      )}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {tile.label}
      </div>
      <div className="font-extrabold tabular-nums text-lg mt-1 text-foreground">
        {tile.value}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        {tile.rank != null && tile.rankOf != null && tier && (
          <span className={cn(
            'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border',
            rankChipClass(tier),
          )}>
            #{tile.rank} of {tile.rankOf}
          </span>
        )}
        {tile.delta && (
          <span className={cn(
            'text-[10px] flex items-center gap-0.5 tabular-nums',
            tile.deltaUp ? 'text-emerald-400' : 'text-red-400',
          )}>
            {tile.deltaUp ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
            {tile.delta}
          </span>
        )}
      </div>
    </button>
  );
}
