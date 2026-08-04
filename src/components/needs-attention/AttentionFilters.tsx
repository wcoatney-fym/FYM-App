/**
 * AttentionFilters — Filter chips for Needs Attention page.
 *
 * Two filter groups:
 * 1. Flag type: All | Future Term | Pended | Suspended
 * 2. Action state: All | Unworked | Got it | Working | Done
 */

import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

export type FlagFilter = 'all' | 'future_term' | 'pended' | 'suspended' | 'at_risk';
export type ActionFilter = 'all' | 'unworked' | 'got_it' | 'working' | 'done';

interface AttentionFiltersProps {
  flagFilter: FlagFilter;
  actionFilter: ActionFilter;
  onFlagChange: (f: FlagFilter) => void;
  onActionChange: (f: ActionFilter) => void;
  /** Counts per flag type */
  flagCounts: Record<FlagFilter, number>;
  /** Counts per action state */
  actionCounts: Record<ActionFilter, number>;
}

// ── Chip component ─────────────────────────────────────────────────────────

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border bg-card text-muted-foreground hover:border-border/80',
      )}
    >
      {label} · {count}
    </button>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function AttentionFilters({
  flagFilter,
  actionFilter,
  onFlagChange,
  onActionChange,
  flagCounts,
  actionCounts,
}: AttentionFiltersProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      {/* Flag type filters */}
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] font-semibold text-muted-foreground mr-1">Filter</span>
        <Chip
          label="All"
          count={flagCounts.all}
          active={flagFilter === 'all'}
          onClick={() => onFlagChange('all')}
        />
        <Chip
          label="Future Term"
          count={flagCounts.future_term}
          active={flagFilter === 'future_term'}
          onClick={() => onFlagChange('future_term')}
        />
        <Chip
          label="Pended"
          count={flagCounts.pended}
          active={flagFilter === 'pended'}
          onClick={() => onFlagChange('pended')}
        />
        <Chip
          label="Suspended"
          count={flagCounts.suspended}
          active={flagFilter === 'suspended'}
          onClick={() => onFlagChange('suspended')}
        />
        {flagCounts.at_risk > 0 && (
          <Chip
            label="At Risk"
            count={flagCounts.at_risk}
            active={flagFilter === 'at_risk'}
            onClick={() => onFlagChange('at_risk')}
          />
        )}
      </div>

      {/* Action state filters */}
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] font-semibold text-muted-foreground mr-1">My action</span>
        <Chip
          label="All"
          count={actionCounts.all}
          active={actionFilter === 'all'}
          onClick={() => onActionChange('all')}
        />
        <Chip
          label="Unworked"
          count={actionCounts.unworked}
          active={actionFilter === 'unworked'}
          onClick={() => onActionChange('unworked')}
        />
        <Chip
          label="Working"
          count={actionCounts.working}
          active={actionFilter === 'working'}
          onClick={() => onActionChange('working')}
        />
        <Chip
          label="Done"
          count={actionCounts.done}
          active={actionFilter === 'done'}
          onClick={() => onActionChange('done')}
        />
      </div>
    </div>
  );
}
