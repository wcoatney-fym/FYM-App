// Shared date helpers for daily check-in system
// One timezone (America/New_York), one helper, used by all four functions.
// Standing rule: all check-in date logic uses this file. No inline date hacks.

/**
 * Returns today's date string in America/New_York timezone as YYYY-MM-DD.
 * This is the canonical check-in date used across checkin-send, checkin-nudge,
 * checkin-summary, and checkin-webhook.
 */
export function getTodayET(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/**
 * Returns a human-friendly date string like "Wed, Aug 19"
 * in America/New_York timezone.
 */
export function formatDateFriendly(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Returns true if today is a weekday in America/New_York timezone.
 */
export function isWeekdayET(): boolean {
  const now = new Date();
  const estDay = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(now);
  return !["Sat", "Sun"].includes(estDay);
}
