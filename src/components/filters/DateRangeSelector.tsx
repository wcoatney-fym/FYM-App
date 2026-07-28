import { useState } from 'react';
import { Calendar, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DateRangeSelectorProps {
  label?: string;
  startDate: string | null;
  endDate: string | null;
  onStartChange: (date: string | null) => void;
  onEndChange: (date: string | null) => void;
  /** Quick-select presets to show. Defaults to common ranges. */
  presets?: { label: string; days: number }[];
}

const DEFAULT_PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6mo', days: 180 },
  { label: 'YTD', days: -1 },  // special: year-to-date
  { label: '1yr', days: 365 },
];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function DateRangeSelector({
  label = 'Date Range',
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  presets = DEFAULT_PRESETS,
}: DateRangeSelectorProps) {
  const [expanded, setExpanded] = useState(false);
  const hasRange = startDate || endDate;

  function applyPreset(days: number) {
    const today = new Date();
    if (days === -1) {
      // YTD
      onStartChange(isoDate(new Date(today.getFullYear(), 0, 1)));
      onEndChange(isoDate(today));
    } else {
      const start = new Date(today);
      start.setDate(start.getDate() - days);
      onStartChange(isoDate(start));
      onEndChange(isoDate(today));
    }
  }

  function clear() {
    onStartChange(null);
    onEndChange(null);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Toggle / label */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
          hasRange
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
        )}
      >
        <Calendar size={13} />
        {hasRange
          ? `${startDate || '…'} → ${endDate || '…'}`
          : label}
      </button>

      {/* Clear */}
      {hasRange && (
        <button
          onClick={clear}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={13} />
        </button>
      )}

      {/* Expanded: presets + date inputs */}
      {expanded && (
        <>
          {/* Quick presets */}
          <div className="flex items-center gap-1">
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.days)}
                className="px-2 py-1 text-[11px] font-medium rounded-md bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={startDate || ''}
              onChange={e => onStartChange(e.target.value || null)}
              className="h-7 px-2 text-xs rounded-md border border-border bg-card text-foreground focus:outline-none focus:border-primary/50"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={endDate || ''}
              onChange={e => onEndChange(e.target.value || null)}
              className="h-7 px-2 text-xs rounded-md border border-border bg-card text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
        </>
      )}
    </div>
  );
}
