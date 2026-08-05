/**
 * businessDays.ts — Holiday-aware business day calculations
 *
 * US federal holidays observed by the insurance industry.
 * Covers fixed-date and floating holidays (MLK, Presidents', Memorial,
 * Labor, Columbus, Thanksgiving). When a fixed holiday falls on Saturday
 * it's observed Friday; on Sunday it's observed Monday.
 */

// ── Holiday definitions ────────────────────────────────────────────────

interface Holiday {
  name: string;
  /** Returns the actual observed date (after Sat→Fri / Sun→Mon shift) */
  date: (year: number) => Date;
}

/** Nth weekday of a month (0=Sun … 6=Sat). Month is 0-based. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const firstDay = first.getDay();
  let day = 1 + ((weekday - firstDay + 7) % 7) + (n - 1) * 7;
  return new Date(year, month, day);
}

/** Last weekday of a month. Month is 0-based. */
function lastWeekday(year: number, month: number, weekday: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const diff = (lastDay.getDay() - weekday + 7) % 7;
  return new Date(year, month, lastDay.getDate() - diff);
}

/** Shift fixed holidays: Sat→Fri, Sun→Mon */
function observedDate(year: number, month: number, day: number): Date {
  const d = new Date(year, month, day);
  const dow = d.getDay();
  if (dow === 6) return new Date(year, month, day - 1); // Sat → Fri
  if (dow === 0) return new Date(year, month, day + 1); // Sun → Mon
  return d;
}

const US_HOLIDAYS: Holiday[] = [
  { name: "New Year's Day",      date: (y) => observedDate(y, 0, 1) },
  { name: 'MLK Jr. Day',         date: (y) => nthWeekday(y, 0, 1, 3) },       // 3rd Mon Jan
  { name: "Presidents' Day",     date: (y) => nthWeekday(y, 1, 1, 3) },       // 3rd Mon Feb
  { name: 'Memorial Day',        date: (y) => lastWeekday(y, 4, 1) },         // Last Mon May
  { name: 'Juneteenth',          date: (y) => observedDate(y, 5, 19) },
  { name: 'Independence Day',    date: (y) => observedDate(y, 6, 4) },
  { name: 'Labor Day',           date: (y) => nthWeekday(y, 8, 1, 1) },       // 1st Mon Sep
  { name: 'Columbus Day',        date: (y) => nthWeekday(y, 9, 1, 2) },       // 2nd Mon Oct
  { name: 'Veterans Day',        date: (y) => observedDate(y, 10, 11) },
  { name: 'Thanksgiving',        date: (y) => nthWeekday(y, 10, 4, 4) },      // 4th Thu Nov
  { name: 'Christmas Day',       date: (y) => observedDate(y, 11, 25) },
];

// ── Holiday set for a given year (cached) ──────────────────────────────

const holidayCache = new Map<number, Set<string>>();

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function getHolidaySet(year: number): Set<string> {
  if (holidayCache.has(year)) return holidayCache.get(year)!;
  const set = new Set<string>();
  for (const h of US_HOLIDAYS) {
    set.add(dateKey(h.date(year)));
  }
  holidayCache.set(year, set);
  return set;
}

function isHoliday(year: number, month: number, day: number): boolean {
  return getHolidaySet(year).has(`${year}-${month}-${day}`);
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Count business days in a month (excludes weekends + US holidays).
 * @param year  Full year (e.g. 2026)
 * @param month 1-based month (1=Jan … 12=Dec)
 */
export function getBusinessDaysInMonth(year: number, month: number): number {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const dow = dt.getDay();
    if (dow !== 0 && dow !== 6 && !isHoliday(year, month - 1, d)) {
      count++;
    }
  }
  return count;
}

/**
 * Count business days remaining in a month (after today).
 * For future months returns full BD count; for past months returns 0.
 * @param year  Full year
 * @param month 1-based month
 */
export function getBusinessDaysRemaining(year: number, month: number): number {
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;

  if (year !== todayYear || month !== todayMonth) {
    if (year > todayYear || (year === todayYear && month > todayMonth)) {
      return getBusinessDaysInMonth(year, month);
    }
    return 0;
  }

  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayDate = today.getDate();
  for (let d = todayDate + 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const dow = dt.getDay();
    if (dow !== 0 && dow !== 6 && !isHoliday(year, month - 1, d)) {
      count++;
    }
  }
  return count;
}

/**
 * Count business days elapsed in a month (including today if it's a BD).
 * @param year  Full year
 * @param month 1-based month
 */
export function getBusinessDaysElapsed(year: number, month: number): number {
  return getBusinessDaysInMonth(year, month) - getBusinessDaysRemaining(year, month);
}

/**
 * Get the list of holidays in a given month (for display/tooltip).
 * @param year  Full year
 * @param month 1-based month
 * @returns Array of { name, date } for holidays falling in that month
 */
export function getHolidaysInMonth(year: number, month: number): Array<{ name: string; date: Date }> {
  return US_HOLIDAYS
    .map(h => ({ name: h.name, date: h.date(year) }))
    .filter(h => h.date.getMonth() === month - 1);
}
