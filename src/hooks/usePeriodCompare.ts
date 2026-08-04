/**
 * usePeriodCompare — reusable hook for period selection + compare-to-prior (P9).
 *
 * Manages:
 * - Current preset + date range
 * - Compare toggle state
 * - Previous period computation
 * - localStorage persistence of preset
 *
 * Usage:
 *   const period = usePeriodCompare({ storageKey: 'dashboard' });
 *   <PeriodPills {...period.pillProps} />
 *   // Use period.dateRange for current data fetch
 *   // Use period.previousRange when period.comparing is true
 */
import { useState, useMemo, useCallback } from 'react';
import { type DatePreset, type DateRange, DEFAULT_PRESET, getDateRange, getPreviousPeriod } from '@/lib/dateUtils';

const LS_PREFIX = 'fym-period-preset';

interface UsePeriodCompareOptions {
  /** localStorage key suffix for page-specific persistence */
  storageKey?: string;
  /** Default preset override */
  defaultPreset?: DatePreset;
  /** Enable compare toggle (default: true) */
  enableCompare?: boolean;
}

function loadPreset(storageKey?: string): DatePreset | null {
  try {
    const key = storageKey ? `${LS_PREFIX}-${storageKey}` : LS_PREFIX;
    const val = localStorage.getItem(key);
    if (val && ['thisMonth', 'lastMonth', 'thisQuarter', 'past6Months', 'pastYear', 'allTime'].includes(val)) {
      return val as DatePreset;
    }
  } catch {}
  return null;
}

export function usePeriodCompare(options: UsePeriodCompareOptions = {}) {
  const { storageKey, defaultPreset, enableCompare = true } = options;

  const initialPreset = loadPreset(storageKey) ?? defaultPreset ?? DEFAULT_PRESET;

  const [preset, setPreset] = useState<DatePreset>(initialPreset);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(initialPreset));
  const [comparing, setComparing] = useState(false);

  const previousRange = useMemo(
    () => comparing ? getPreviousPeriod(dateRange) : null,
    [comparing, dateRange],
  );

  const handleChange = useCallback((range: DateRange, newPreset: DatePreset) => {
    setDateRange(range);
    setPreset(newPreset);
  }, []);

  const handleCompareChange = useCallback((val: boolean) => {
    setComparing(val);
  }, []);

  /** Props to spread directly onto <PeriodPills /> */
  const pillProps = useMemo(() => ({
    preset,
    dateRange,
    onChange: handleChange,
    showCompare: enableCompare,
    comparing,
    onCompareChange: handleCompareChange,
    storageKey,
  }), [preset, dateRange, handleChange, enableCompare, comparing, handleCompareChange, storageKey]);

  return {
    preset,
    dateRange,
    comparing,
    previousRange,
    pillProps,
    setPreset,
    setDateRange,
    setComparing,
    handleChange,
  };
}
