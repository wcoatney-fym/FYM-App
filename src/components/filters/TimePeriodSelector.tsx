/**
 * Time period selector — dropdown with preset periods + custom date range.
 * Ported from Sales Tracker DateRangeSelector, styled for FYM App dark theme.
 * Default: This Month.
 */
import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { type DatePreset, type DateRange, DATE_PRESETS, getDateRange } from '@/lib/dateUtils';

interface TimePeriodSelectorProps {
  preset: DatePreset;
  dateRange: DateRange;
  onChange: (range: DateRange, preset: DatePreset) => void;
}

export function TimePeriodSelector({ preset, dateRange, onChange }: TimePeriodSelectorProps) {
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handlePreset(key: DatePreset) {
    if (key === 'custom') return;
    onChange(getDateRange(key), key);
    setOpen(false);
  }

  function handleCustomApply() {
    if (!customStart || !customEnd) return;
    const start = new Date(customStart);
    const end = new Date(customEnd);
    end.setDate(end.getDate() + 1); // exclusive upper bound
    onChange(
      {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        label: `${customStart} – ${customEnd}`,
      },
      'custom',
    );
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 h-8 px-3 text-sm border border-border rounded-md bg-card text-foreground hover:bg-secondary/50 transition-colors"
      >
        <Calendar size={14} className="text-primary shrink-0" />
        <span className="font-medium whitespace-nowrap">{dateRange.label}</span>
        <ChevronDown size={12} className="text-muted-foreground" />
      </button>

      {open && (
        <>
          {/* Mobile backdrop */}
          <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setOpen(false)} />

          <div className="fixed left-4 right-4 top-1/3 sm:absolute sm:right-0 sm:left-auto sm:top-full sm:mt-2 sm:w-60 bg-card rounded-lg border border-border shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Preset list */}
            <div className="py-1">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => handlePreset(p.key)}
                  className={`w-full text-left px-4 py-2.5 sm:py-2 text-sm transition-colors ${
                    preset === p.key
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground/80 hover:bg-secondary/50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom range */}
            <div className="border-t border-border p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Custom Range
              </p>
              <div className="space-y-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm border border-border rounded-md bg-secondary/30 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
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
          </div>
        </>
      )}
    </div>
  );
}
