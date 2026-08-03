/**
 * Period Pill Selector (P9)
 *
 * Horizontal pill strip: [7d] [MTD] [QTD] [YTD] [Custom]
 * Optional compare-to-prior toggle with delta badge.
 * Replaces the dropdown-based TimePeriodSelector on pages that adopt it.
 * localStorage persistence for default period.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar, GitCompareArrows } from 'lucide-react';
import { type DatePreset, type DateRange, DATE_PRESETS, getDateRange } from '@/lib/dateUtils';

/** Subset of presets shown as pills — the most common quick-picks */
const PILL_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'thisMonth', label: 'MTD' },
  { key: 'lastMonth', label: 'Last Mo' },
  { key: 'thisQuarter', label: 'QTD' },
  { key: 'pastYear', label: 'YTD' },
];

const LS_KEY = 'fym-period-preset';

interface PeriodPillsProps {
  preset: DatePreset;
  dateRange: DateRange;
  onChange: (range: DateRange, preset: DatePreset) => void;
  /** Show the compare-to-prior toggle (default: true) */
  showCompare?: boolean;
  /** Current compare state */
  comparing?: boolean;
  /** Called when compare toggle changes */
  onCompareChange?: (comparing: boolean) => void;
  /** Persist selection to localStorage (default: true) */
  persist?: boolean;
  /** localStorage key suffix for page-specific persistence */
  storageKey?: string;
  /** Compact mode — smaller pills, no labels (for tight headers) */
  compact?: boolean;
}

export function PeriodPills({
  preset,
  dateRange,
  onChange,
  showCompare = true,
  comparing = false,
  onCompareChange,
  persist = true,
  storageKey,
  compact = false,
}: PeriodPillsProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const customRef = useRef<HTMLDivElement>(null);

  // Close custom popover on outside click
  useEffect(() => {
    if (!showCustom) return;
    function handleClick(e: MouseEvent) {
      if (customRef.current && !customRef.current.contains(e.target as Node)) setShowCustom(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCustom]);

  const handlePreset = useCallback((key: DatePreset) => {
    onChange(getDateRange(key), key);
    setShowCustom(false);
    if (persist) {
      try { localStorage.setItem(storageKey ? `${LS_KEY}-${storageKey}` : LS_KEY, key); } catch {}
    }
  }, [onChange, persist, storageKey]);

  function handleCustomApply() {
    if (!customStart || !customEnd) return;
    const start = new Date(customStart);
    const end = new Date(customEnd);
    end.setDate(end.getDate() + 1);
    onChange(
      { startDate: start.toISOString(), endDate: end.toISOString(), label: `${customStart} – ${customEnd}` },
      'custom',
    );
    setShowCustom(false);
  }

  const pillBase = compact
    ? 'px-2 py-0.5 text-[10px]'
    : 'px-3 py-1.5 text-xs';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* ── Pill strip ──────────────────────────── */}
      <div className="inline-flex items-center rounded-lg bg-secondary/40 p-0.5 gap-0.5">
        {PILL_PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className={`${pillBase} rounded-md font-medium transition-all duration-200 whitespace-nowrap ${
              preset === p.key
                ? 'gradient-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            }`}
          >
            {p.label}
          </button>
        ))}

        {/* More dropdown for remaining presets */}
        {DATE_PRESETS.filter(p => !PILL_PRESETS.find(pp => pp.key === p.key) && p.key !== 'custom').map(p => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className={`${pillBase} rounded-md font-medium transition-all duration-200 whitespace-nowrap ${
              preset === p.key
                ? 'gradient-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            }`}
          >
            {p.label === 'Past 6 Months' ? '6M' : p.label === 'All Time' ? 'All' : p.label}
          </button>
        ))}

        {/* Custom date pill */}
        <div className="relative" ref={customRef}>
          <button
            onClick={() => setShowCustom(!showCustom)}
            className={`${pillBase} rounded-md font-medium transition-all duration-200 flex items-center gap-1 ${
              preset === 'custom'
                ? 'gradient-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            }`}
          >
            <Calendar size={compact ? 10 : 12} />
            {!compact && (preset === 'custom' ? dateRange.label : 'Custom')}
          </button>

          {showCustom && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-card rounded-lg border border-border shadow-xl z-50 p-3 animate-in fade-in slide-in-from-top-2 duration-150">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Custom Range
              </p>
              <div className="space-y-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm border border-border rounded-md bg-secondary/30 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm border border-border rounded-md bg-secondary/30 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <button
                  onClick={handleCustomApply}
                  disabled={!customStart || !customEnd}
                  className="w-full px-3 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Compare-to-Prior toggle ─────────────── */}
      {showCompare && onCompareChange && (
        <button
          onClick={() => onCompareChange(!comparing)}
          className={`inline-flex items-center gap-1.5 ${pillBase} rounded-md font-medium border transition-all duration-200 ${
            comparing
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
          }`}
          title="Compare to previous period"
        >
          <GitCompareArrows size={compact ? 10 : 12} />
          {!compact && 'Compare'}
        </button>
      )}
    </div>
  );
}
